// popups/media_mixer/index.js
// Версия с ручками ресайза (8 областей)
let compressor;

let audioContext, destination;
let activeSources = new Map(); // ключ: sourceId (для аудио)
let mixerState = { devices: [], sources: [] };
let listenGainNode;

// Хранилище видеослоёв
let videoLayers = []; // массив объектов { id, sourceId, videoElement, stream, label, icon, x, y, width, height, flipX, flipY, visible, naturalAspect }
let nextLayerId = 1;

// Переменные для ручного drag & resize
let dragState = {
	active: false,
	layerId: null,
	startMouseX: 0,
	startMouseY: 0,
	startLayer: null, // копия начальных параметров слоя (x, y, width, height)
	edge: null,       // какой край/угол тянем
	ctrlPressed: false
};

// Параметры сцены
let stageRect = { x: 0, y: 0, width: 0, height: 0 };
let containerOffset = { x: 0, y: 0 };
let stageWidth = 1920;   // логическая ширина
let stageHeight = 1080;  // логическая высота
let scale = 1;

// Видео-композитинг
let compositeCanvas;
let compositeCtx;
let compositeAnimationFrame = null;
let compositeStream = null;
let videoTrackFromCanvas = null;
// Регистрируем эту вкладку как микшер
chrome.runtime.sendMessage({ action: 'registerMixerTab' });

function initCompositeCanvas() {
    if (!compositeCanvas) {
        compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = stageWidth;
        compositeCanvas.height = stageHeight;
        compositeCtx = compositeCanvas.getContext('2d');
    }
    if (!compositeAnimationFrame) {
        renderCompositeLoop();
    }
}
function renderCompositeLoop() {
    compositeCtx.clearRect(0, 0, stageWidth, stageHeight);

    videoLayers.forEach(layer => {
        if (!layer.visible) return;
        const videoEl = layer.videoElement;
        if (!videoEl || videoEl.readyState < 2) return;
        const x = layer.x;
        const y = layer.y;
        const w = layer.width;
        const h = layer.height;
        compositeCtx.save();
        if (layer.flipX || layer.flipY) {
            compositeCtx.translate(x + w/2, y + h/2);
            compositeCtx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
            compositeCtx.drawImage(videoEl, -w/2, -h/2, w, h);
        } else {
            compositeCtx.drawImage(videoEl, x, y, w, h);
        }
        compositeCtx.restore();
    });

    compositeAnimationFrame = requestAnimationFrame(renderCompositeLoop);
}
function updateCompositeStream() {
    if (!compositeCanvas) return;

    // Получаем текущую видеодорожку из canvas (создаём новый поток при каждом вызове)
    // Но чтобы избежать постоянного создания новых потоков, можно сохранять видеодорожку и обновлять её,
    // однако captureStream при каждом кадре создаёт новый поток, что неэффективно.
    // Лучше один раз создать MediaStream из canvas и затем только заменять трек, но canvas.captureStream()
    // возвращает новый поток каждый раз. Вместо этого мы будем один раз получить поток из canvas и затем
    // в preview-video обновлять srcObject при необходимости (например, при изменении состава дорожек).
    // Но т.к. видеодорожка из canvas не меняется (только её содержание), можно один раз создать поток и
    // использовать его постоянно. Canvas.captureStream() создаёт поток, который будет обновляться автоматически.
    // Поэтому сделаем так: при первом вызове создаём compositeStream из canvas и назначаем в preview.
    // Далее просто используем этот же поток, он будет обновляться кадрами canvas.

    if (!compositeStream) {
        // Получаем поток из canvas (с частотой кадров по умолчанию)
        compositeStream = compositeCanvas.captureStream(30); // 30 fps
        // Добавляем аудиодорожки из destination.stream
        const audioTracks = destination.stream.getAudioTracks();
        audioTracks.forEach(track => compositeStream.addTrack(track));

        // Назначаем поток в preview-video
        const previewVideo = document.getElementById('preview-video');
        if (previewVideo) {
            previewVideo.srcObject = compositeStream;
        }
    } else {
        // Если аудиодорожки изменились (например, добавился/удалился источник), нужно обновить состав дорожек.
        // Для простоты будем пересоздавать compositeStream при изменении списка аудиоисточников.
        // Но пока оставим как есть, позже добавим обновление.
    }
}
function refreshCompositeStreamAudio() {
    if (!compositeStream) {
        compositeStream = compositeCanvas.captureStream(30);
    }

    // Останавливаем старые видеодорожки и удаляем их
    compositeStream.getVideoTracks().forEach(t => {
        t.stop();
        compositeStream.removeTrack(t);
    });

    // Создаём новый видеопоток из canvas (чтобы получить свежий видеотрек)
    const newCanvasStream = compositeCanvas.captureStream(30);
    const videoTrack = newCanvasStream.getVideoTracks()[0];
    compositeStream.addTrack(videoTrack);

    // Удаляем все старые аудиодорожки
    compositeStream.getAudioTracks().forEach(t => compositeStream.removeTrack(t));

    // Добавляем текущие аудиодорожки из destination.stream, если он есть
    if (destination && destination.stream) {
        destination.stream.getAudioTracks().forEach(track => compositeStream.addTrack(track));
    }

    // Обновляем preview
    const previewVideo = document.getElementById('preview-video');
    if (previewVideo && previewVideo.srcObject !== compositeStream) {
        previewVideo.srcObject = compositeStream;
    }
}
// ---------- Преобразование координат ----------
function screenToLogical(screenX, screenY) {
	return {
		x: (screenX - containerOffset.x) / scale,
		y: (screenY - containerOffset.y) / scale
	};
}

function logicalToScreen(logicalX, logicalY) {
	return {
		x: containerOffset.x + logicalX * scale,
		y: containerOffset.y + logicalY * scale
	};
}

// ---------- Инициализация аудио (без изменений) ----------
function initAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        destination = audioContext.createMediaStreamDestination();
        
        // Создаём компрессор
        compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;   // порог срабатывания, дБ
        compressor.knee.value = 10;         // мягкость ограничения
        compressor.ratio.value = 12;        // степень сжатия
        compressor.attack.value = 0.003;    // время атаки, сек
        compressor.release.value = 0.25;    // время восстановления, сек

        listenGainNode = audioContext.createGain();
        listenGainNode.gain.value = 1.0;

        // Соединяем: destination -> compressor -> listenGainNode -> destination (аудиовыход)
        const listenSource = audioContext.createMediaStreamSource(destination.stream);
        listenSource.connect(compressor);
        compressor.connect(listenGainNode);
        listenGainNode.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume();
}

// ---------- Микрофоны (без изменений) ----------
async function getDevices() {
	let tempStream;
	try {
		tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch (e) {}
	const devices = await navigator.mediaDevices.enumerateDevices();
	if (tempStream) tempStream.getTracks().forEach(t => t.stop());
	return devices.filter(d => d.kind === 'audioinput');
}

async function updateMixer() {
    initAudio();

    // Останавливаем микрофоны, которые отключены
    for (let [key, src] of activeSources.entries()) {
        if (!key.startsWith('source-')) { // значит, это микрофон
            let shouldKeep = mixerState.devices.some(d => d.id === key && d.enabled);
            if (!shouldKeep) {
                src.stream.getTracks().forEach(t => t.stop());
                src.sourceNode.disconnect();
                activeSources.delete(key);
            }
        }
    }

    // Добавляем новые микрофоны
    for (let dev of mixerState.devices) {
        if (dev.enabled && !activeSources.has(dev.id)) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev.id } });
                const sourceNode = audioContext.createMediaStreamSource(stream);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = dev.volume / 100;
                sourceNode.connect(gainNode);
                gainNode.connect(destination);
                activeSources.set(dev.id, { sourceNode, gainNode, stream });
            } catch (e) {
                console.warn('Не удалось захватить микрофон', dev, e);
            }
        }
    }

    // Обновляем громкость ВСЕХ активных источников (и микрофонов, и внешних)
    for (let [key, src] of activeSources.entries()) {
        let targetVolume = 100; // по умолчанию
        if (key.startsWith('source-')) {
            const source = mixerState.sources.find(s => s.id === key);
            if (source) targetVolume = source.volume;
        } else {
            const dev = mixerState.devices.find(d => d.id === key);
            if (dev) targetVolume = dev.volume;
        }
        if (src.gainNode) {
            src.gainNode.gain.value = targetVolume / 100;
        }
    }

    document.getElementById('preview-video').srcObject = destination.stream;
	refreshCompositeStreamAudio();
}

async function renderDevices() {
	const devices = await getDevices();
	const container = document.getElementById('devices-section');
	if (!container) return;
	container.innerHTML = '';

	devices.forEach(device => {
		let devState = mixerState.devices.find(d => d.id === device.deviceId);
		if (!devState) {
			devState = {
				id: device.deviceId,
				label: device.label || 'Микрофон',
				enabled: false,
				volume: 100
			};
			mixerState.devices.push(devState);
		}

		const div = document.createElement('div');
		div.className = 'device-item';
		div.innerHTML = `
			<div class="device-header">
				<input type="checkbox" ${devState.enabled ? 'checked' : ''} data-id="${device.deviceId}">
				<label>${devState.label}</label>
			</div>
			<div class="source-list" style="display: ${devState.enabled ? 'block' : 'none'};">
				<div class="source-item">
					<label>Громкость</label>
					<input type="range" min="0" max="100" value="${devState.volume}" class="volume-slider" data-id="${device.deviceId}">
					<span class="volume-value">${devState.volume}%</span>
				</div>
			</div>
		`;
		container.appendChild(div);

		const checkbox = div.querySelector('input[type="checkbox"]');
		const sourceList = div.querySelector('.source-list');
		const slider = div.querySelector('.volume-slider');
		const span = div.querySelector('.volume-value');

		checkbox.addEventListener('change', (e) => {
			devState.enabled = e.target.checked;
			sourceList.style.display = devState.enabled ? 'block' : 'none';
			saveState();
			updateMixer();
		});

		slider.addEventListener('input', (e) => {
			const val = parseInt(e.target.value);
			devState.volume = val;
			span.textContent = val + '%';
			
			// Мгновенно меняем громкость, если источник активен
			const active = activeSources.get(device.deviceId);
			if (active && active.gainNode) {
				active.gainNode.gain.value = val / 100;
			}
			
			saveState(); // сохраняем в хранилище
		});
	});
}

// ---------- Функции создания и обновления ручек ресайза ----------
function createResizeHandles(layerDiv) {
	const positions = [
		'top-left', 'top', 'top-right',
		'left', 'right',
		'bottom-left', 'bottom', 'bottom-right'
	];
	positions.forEach(pos => {
		const handle = document.createElement('div');
		handle.className = `resize-handle ${pos}`;
		handle.dataset.edge = pos;
		layerDiv.appendChild(handle);
	});
}

function updateResizeHandles(layerDiv, width, height) {
	const handles = layerDiv.querySelectorAll('.resize-handle');
	const handleSize = 10; // размер угловых ручек в пикселях
	const sideWidth = 10; // толщина боковых ручек
	// Обновляем стили для каждой ручки в зависимости от класса
	handles.forEach(handle => {
		const pos = handle.classList[1]; // второй класс
		handle.style.position = 'absolute';
		handle.style.zIndex = pos.includes('top') || pos.includes('bottom') || pos.includes('left') || pos.includes('right') ? '2' : '3';
		handle.style.backgroundColor = 'transparent'; // невидимые
		// Для отладки можно заменить на полупрозрачный цвет:
		// handle.style.backgroundColor = 'rgba(255,0,0,0.2)';
		// handle.style.border = '1px solid red';

		switch (pos) {
			case 'top-left':
				handle.style.left = '0';
				handle.style.top = '0';
				handle.style.width = handleSize + 'px';
				handle.style.height = handleSize + 'px';
				handle.style.cursor = 'nw-resize';
				break;
			case 'top':
				handle.style.left = handleSize + 'px';
				handle.style.top = '0';
				handle.style.width = `calc(100% - ${2 * handleSize}px)`;
				handle.style.height = sideWidth + 'px';
				handle.style.cursor = 'n-resize';
				break;
			case 'top-right':
				handle.style.right = '0';
				handle.style.top = '0';
				handle.style.width = handleSize + 'px';
				handle.style.height = handleSize + 'px';
				handle.style.cursor = 'ne-resize';
				break;
			case 'left':
				handle.style.left = '0';
				handle.style.top = handleSize + 'px';
				handle.style.width = sideWidth + 'px';
				handle.style.height = `calc(100% - ${2 * handleSize}px)`;
				handle.style.cursor = 'w-resize';
				break;
			case 'right':
				handle.style.right = '0';
				handle.style.top = handleSize + 'px';
				handle.style.width = sideWidth + 'px';
				handle.style.height = `calc(100% - ${2 * handleSize}px)`;
				handle.style.cursor = 'e-resize';
				break;
			case 'bottom-left':
				handle.style.left = '0';
				handle.style.bottom = '0';
				handle.style.width = handleSize + 'px';
				handle.style.height = handleSize + 'px';
				handle.style.cursor = 'sw-resize';
				break;
			case 'bottom':
				handle.style.left = handleSize + 'px';
				handle.style.bottom = '0';
				handle.style.width = `calc(100% - ${2 * handleSize}px)`;
				handle.style.height = sideWidth + 'px';
				handle.style.cursor = 's-resize';
				break;
			case 'bottom-right':
				handle.style.right = '0';
				handle.style.bottom = '0';
				handle.style.width = handleSize + 'px';
				handle.style.height = handleSize + 'px';
				handle.style.cursor = 'se-resize';
				break;
		}
	});
}

// ---------- Функции работы со слоями (изменена applyLayerTransform) ----------
function applyLayerTransform(layer) {
	const div = document.getElementById(layer.id);
	if (!div) return;

	// Устанавливаем логические координаты и размеры
	div.style.left = layer.x + 'px';
	div.style.top = layer.y + 'px';
	div.style.width = layer.width + 'px';
	div.style.height = layer.height + 'px';

	// Отражение (если нужно)
	let scaleX = layer.flipX ? -1 : 1;
	let scaleY = layer.flipY ? -1 : 1;
	div.style.transform = `scale(${scaleX}, ${scaleY})`;

	// Обновляем ручки ресайза (они остаются внутри слоя и не требуют трансформации)
	updateResizeHandles(div, layer.width * scale, layer.height * scale); // передаём логические размеры, умноженные на scale? Но ручки должны быть в экранных пикселях. Лучше переделать updateResizeHandles так, чтобы она принимала логические размеры и сама вычисляла экранные через scale. Пока оставим как есть, но учтём, что теперь размеры слоя в CSS логические, а ручки должны быть размером 10px в экранных пикселях. Это значит, что в updateResizeHandles нужно использовать scale. Но в текущей реализации updateResizeHandles использует width и height, которые приходят из applyLayerTransform как screenWidth и screenHeight. Мы передаём layer.width * scale и layer.height * scale. Это правильно.
}

function updateLayerDataFromDiv(div) {
	const id = div.id;
	const layer = videoLayers.find(l => l.id === id);
	if (!layer) return;

	// Экранные координаты из стилей
	const screenX = parseFloat(div.style.left) || 0;
	const screenY = parseFloat(div.style.top) || 0;
	const screenWidth = parseFloat(div.style.width) || 0;
	const screenHeight = parseFloat(div.style.height) || 0;

	// Преобразуем в логические
	const logicalPos = screenToLogical(screenX, screenY);
	layer.x = logicalPos.x;
	layer.y = logicalPos.y;
	layer.width = screenWidth / scale;
	layer.height = screenHeight / scale;
}

// ---------- Создание слоя ----------
function createVideoLayer(stream, label, icon, sourceId) {
	const layerId = `layer-${nextLayerId++}`;
	const video = document.createElement('video');
	video.srcObject = stream;
	video.autoplay = true;
	video.playsInline = true;
	video.muted = false;
	video.style.pointerEvents = 'none'; // чтобы события мыши проходили к контейнеру и ручкам

	const container = document.getElementById('video-layers-container');
	const layerDiv = document.createElement('div');
	layerDiv.className = 'video-layer';
	layerDiv.id = layerId;
	layerDiv.dataset.sourceId = sourceId;
	layerDiv.style.left = '20px';
	layerDiv.style.top = '20px';
	layerDiv.style.width = '320px';
	layerDiv.style.height = '180px';
	layerDiv.style.transform = '';

	const closeBtn = document.createElement('div');
	closeBtn.className = 'layer-close-btn';
	closeBtn.innerHTML = '✕';
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		removeVideoLayer(layerId);
	});
	layerDiv.appendChild(closeBtn);
	layerDiv.appendChild(video);

	// Создаём ручки ресайза
	createResizeHandles(layerDiv);

	container.appendChild(layerDiv);

	const layerData = {
		id: layerId,
		sourceId: sourceId,
		videoElement: video,
		stream: stream,
		label: label,
		icon: icon,
		x: 20,
		y: 20,
		width: 320,
		height: 180,
		flipX: false,
		flipY: false,
		visible: true,
		naturalAspect: null
	};
	videoLayers.push(layerData);

	video.addEventListener('loadedmetadata', () => {
		layerData.naturalAspect = video.videoWidth / video.videoHeight;
		console.log('naturalAspect set for', label, layerData.naturalAspect);
	});

	// Обработчик для перетаскивания (клик по самому слою, но не по ручкам)
	layerDiv.addEventListener('mousedown', (e) => {
		// Если клик по ручке, не начинаем перетаскивание
		if (e.target.classList.contains('resize-handle')) return;
		onLayerMouseDown(e, null); // edge = null означает перетаскивание
	});

	// Обработчики для ручек ресайза
	const handles = layerDiv.querySelectorAll('.resize-handle');
	handles.forEach(handle => {
		handle.addEventListener('mousedown', (e) => {
			e.stopPropagation(); // чтобы не сработал обработчик слоя
			const edge = handle.dataset.edge;
			onLayerMouseDown(e, edge);
		});
	});

	return layerData;
}

// ---------- Удаление слоя ----------
function removeVideoLayer(layerId) {
	const layer = videoLayers.find(l => l.id === layerId);
	if (!layer) return;
	// Останавливаем все треки потока
	layer.stream.getTracks().forEach(t => t.stop());
	// Удаляем из DOM
	const div = document.getElementById(layerId);
	if (div) {
		div.remove();
	}
	// Удаляем из массива
	videoLayers = videoLayers.filter(l => l.id !== layerId);
	// Также удаляем соответствующий источник из mixerState.sources и аудио, если есть
	const sourceIndex = mixerState.sources.findIndex(s => s.id === layer.sourceId);
	if (sourceIndex !== -1) {
		const source = mixerState.sources[sourceIndex];
		// Если у источника было аудио, удаляем из activeSources
		if (activeSources.has(source.id)) {
			const src = activeSources.get(source.id);
			src.stream.getTracks().forEach(t => t.stop());
			src.sourceNode.disconnect();
			activeSources.delete(source.id);
		}
		mixerState.sources.splice(sourceIndex, 1);
	}
	saveState();
	renderSources();
	updateMixer();
}

// ---------- Начало перетаскивания/ресайза ----------
function onLayerMouseDown(e, edge) {
	e.preventDefault();
	const layerDiv = e.currentTarget.closest('.video-layer');
	if (!layerDiv) return;
	const layerId = layerDiv.id;
	const layer = videoLayers.find(l => l.id === layerId);
	if (!layer) return;

	// Сохраняем начальное состояние
	dragState.active = true;
	dragState.layerId = layerId;
	dragState.startMouseX = e.clientX;
	dragState.startMouseY = e.clientY;
	dragState.startLayer = {
		x: layer.x,
		y: layer.y,
		width: layer.width,
		height: layer.height
	};
	dragState.edge = edge;
	dragState.ctrlPressed = e.ctrlKey;

	// Вешаем глобальные обработчики
	window.addEventListener('mousemove', onWindowMouseMove);
	window.addEventListener('mouseup', onWindowMouseUp);
	window.addEventListener('mouseleave', onWindowMouseUp); // на случай выхода за окно
}

// ---------- Обработка движения мыши ----------
function onWindowMouseMove(e) {
	if (!dragState.active) return;

	const layerId = dragState.layerId;
	const layer = videoLayers.find(l => l.id === layerId);
	if (!layer) {
		// Слой мог быть удалён — завершаем операцию
		onWindowMouseUp(e);
		return;
	}

	const start = dragState.startLayer;
	const edge = dragState.edge;

	// Текущие экранные координаты мыши
	const currentX = e.clientX;
	const currentY = e.clientY;

	// Смещение мыши в экранных пикселях
	const deltaX = currentX - dragState.startMouseX;
	const deltaY = currentY - dragState.startMouseY;

	// Переводим смещение в логические единицы
	const deltaLogicalX = deltaX / scale;
	const deltaLogicalY = deltaY / scale;

	// Новые логические параметры (будем изменять)
	let newX = start.x;
	let newY = start.y;
	let newWidth = start.width;
	let newHeight = start.height;

	if (edge) {
		// Изменение размера в зависимости от края
		switch (edge) {
			case 'left':
				newX = start.x + deltaLogicalX;
				newWidth = start.width - deltaLogicalX;
				break;
			case 'right':
				newWidth = start.width + deltaLogicalX;
				break;
			case 'top':
				newY = start.y + deltaLogicalY;
				newHeight = start.height - deltaLogicalY;
				break;
			case 'bottom':
				newHeight = start.height + deltaLogicalY;
				break;
			case 'top-left':
				newX = start.x + deltaLogicalX;
				newY = start.y + deltaLogicalY;
				newWidth = start.width - deltaLogicalX;
				newHeight = start.height - deltaLogicalY;
				break;
			case 'top-right':
				newY = start.y + deltaLogicalY;
				newWidth = start.width + deltaLogicalX;
				newHeight = start.height - deltaLogicalY;
				break;
			case 'bottom-left':
				newX = start.x + deltaLogicalX;
				newWidth = start.width - deltaLogicalX;
				newHeight = start.height + deltaLogicalY;
				break;
			case 'bottom-right':
				newWidth = start.width + deltaLogicalX;
				newHeight = start.height + deltaLogicalY;
				break;
		}

		// Ограничения минимального размера
		const minWidth = 50 / scale;
		const minHeight = 30 / scale;
		if (newWidth < minWidth) {
			if (edge.includes('left')) newX = start.x + start.width - minWidth;
			newWidth = minWidth;
		}
		if (newHeight < minHeight) {
			if (edge.includes('top')) newY = start.y + start.height - minHeight;
			newHeight = minHeight;
		}

		// Если зажат Ctrl и есть naturalAspect, сохраняем пропорции
		if (dragState.ctrlPressed && layer.naturalAspect) {
			const aspect = layer.naturalAspect;
			// Определяем ведущее измерение (то, которое больше изменилось в логических)
			const deltaW = newWidth - start.width;
			const deltaH = newHeight - start.height;
			if (Math.abs(deltaW) > Math.abs(deltaH)) {
				// Изменялась ширина, подгоняем высоту
				newHeight = newWidth / aspect;
				// Корректируем позицию для верхних краёв
				if (edge.includes('top')) {
					newY = start.y + (start.height - newHeight);
				}
			} else {
				// Изменялась высота, подгоняем ширину
				newWidth = newHeight * aspect;
				// Корректируем позицию для левых краёв
				if (edge.includes('left')) {
					newX = start.x + (start.width - newWidth);
				}
			}
		}
	} else {
		// Перетаскивание
		newX = start.x + deltaLogicalX;
		newY = start.y + deltaLogicalY;
	}

	// Применяем привязку (snap)
	const snapped = applySnap(newX, newY, newWidth, newHeight, layerId, edge);
	newX = snapped.x;
	newY = snapped.y;
	newWidth = snapped.width;
	newHeight = snapped.height;

	// Обновляем слой
	layer.x = newX;
	layer.y = newY;
	layer.width = newWidth;
	layer.height = newHeight;

	// Применяем трансформацию к DOM
	applyLayerTransform(layer);
	// Не вызываем renderSources во время движения, чтобы не тормозить
}

// ---------- Привязка (snap) с радиусом 10 экранных пикселей ----------
function applySnap(x, y, width, height, excludeLayerId, edge) {
	const snapRadiusLogical = 10 / scale;

	let snappedX = x;
	let snappedY = y;
	let snappedWidth = width;
	let snappedHeight = height;

	// Функции для привязки сторон
	const snapLeft = (targetLeft) => {
		const dist = Math.abs(x - targetLeft);
		if (dist < snapRadiusLogical) {
			snappedX = targetLeft;
			if (edge && (edge.includes('left') || edge.includes('right'))) {
				snappedWidth = width + (x - targetLeft);
			}
		}
	};
	const snapRight = (targetRight) => {
		const dist = Math.abs(x + width - targetRight);
		if (dist < snapRadiusLogical) {
			if (edge && (edge.includes('right') || edge.includes('left'))) {
				snappedWidth = targetRight - x;
			} else {
				snappedX = targetRight - width;
			}
		}
	};
	const snapTop = (targetTop) => {
		const dist = Math.abs(y - targetTop);
		if (dist < snapRadiusLogical) {
			snappedY = targetTop;
			if (edge && (edge.includes('top') || edge.includes('bottom'))) {
				snappedHeight = height + (y - targetTop);
			}
		}
	};
	const snapBottom = (targetBottom) => {
		const dist = Math.abs(y + height - targetBottom);
		if (dist < snapRadiusLogical) {
			if (edge && (edge.includes('bottom') || edge.includes('top'))) {
				snappedHeight = targetBottom - y;
			} else {
				snappedY = targetBottom - height;
			}
		}
	};

	// Цели: границы контейнера
	const containerLeft = 0;
	const containerRight = stageWidth;
	const containerTop = 0;
	const containerBottom = stageHeight;

	snapLeft(containerLeft);
	snapRight(containerRight);
	snapTop(containerTop);
	snapBottom(containerBottom);

	// Цели: края других слоёв
	videoLayers.forEach(otherLayer => {
		if (otherLayer.id === excludeLayerId || !otherLayer.visible) return;

		const otherLeft = otherLayer.x;
		const otherRight = otherLayer.x + otherLayer.width;
		const otherTop = otherLayer.y;
		const otherBottom = otherLayer.y + otherLayer.height;

		snapLeft(otherLeft);
		snapLeft(otherRight);
		snapRight(otherLeft);
		snapRight(otherRight);
		snapTop(otherTop);
		snapTop(otherBottom);
		snapBottom(otherTop);
		snapBottom(otherBottom);
	});

	return { x: snappedX, y: snappedY, width: snappedWidth, height: snappedHeight };
}

// ---------- Завершение операции ----------
function onWindowMouseUp(e) {
	if (!dragState.active) return;

	// Убираем глобальные обработчики
	window.removeEventListener('mousemove', onWindowMouseMove);
	window.removeEventListener('mouseup', onWindowMouseUp);
	window.removeEventListener('mouseleave', onWindowMouseUp);

	dragState.active = false;

	// Обновляем карточки после завершения операции
	renderSources();
	saveState(); // опционально
}

// ---------- Рендер карточек источников ----------
function renderSources() {
	const container = document.getElementById('sources-list');
	if (!container) return;
	container.innerHTML = '';

	mixerState.sources.forEach(source => {
		const layer = source.layerId ? videoLayers.find(l => l.id === source.layerId) : null;

		const div = document.createElement('div');
		div.className = 'source-card';
		div.innerHTML = `
			<div class="source-header">
				<span class="source-icon">${source.icon || '📌'}</span>
				<span class="source-title">${source.label}</span>
				<button class="remove-source" data-id="${source.id}">✖</button>
			</div>
			<div class="source-details">
				${source.hasAudio ? `
					<div class="source-item">
						<label>Громкость аудио</label>
						<input type="range" min="0" max="100" value="${source.volume}" class="volume-slider" data-id="${source.id}">
						<span class="volume-value">${source.volume}%</span>
					</div>
				` : '<div class="source-item">🔇 Нет звука</div>'}
				${layer ? `
					<div class="video-controls">
						<div class="video-control-group">
							<label>X:</label>
							<input type="number" value="${Math.round(layer.x)}" step="1" class="layer-pos-x" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<label>Y:</label>
							<input type="number" value="${Math.round(layer.y)}" step="1" class="layer-pos-y" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<label>W:</label>
							<input type="number" value="${Math.round(layer.width)}" step="1" class="layer-width" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<label>H:</label>
							<input type="number" value="${Math.round(layer.height)}" step="1" class="layer-height" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<button class="flip-x" data-id="${source.id}">↔ Отр. X</button>
							<button class="flip-y" data-id="${source.id}">↕ Отр. Y</button>
						</div>
						<div class="video-control-group">
							<button class="move-up" data-id="${source.id}">▲</button>
							<button class="move-down" data-id="${source.id}">▼</button>
						</div>
					</div>
				` : ''}
			</div>
		`;
		container.appendChild(div);

		// Обработчики
		const removeBtn = div.querySelector('.remove-source');
		removeBtn.addEventListener('click', () => {
			removeSource(source.id);
		});

		if (source.hasAudio) {
			const slider = div.querySelector('.volume-slider');
			const span = div.querySelector('.volume-value');
			slider.addEventListener('input', (e) => {
				const val = parseInt(e.target.value);
				source.volume = val;
				span.textContent = val + '%';
				if (activeSources.has(source.id)) {
					activeSources.get(source.id).gainNode.gain.value = val / 100;
				}
				saveState();
			});
		}

		if (layer) {
			const xInput = div.querySelector('.layer-pos-x');
			const yInput = div.querySelector('.layer-pos-y');
			const wInput = div.querySelector('.layer-width');
			const hInput = div.querySelector('.layer-height');
			const flipXBtn = div.querySelector('.flip-x');
			const flipYBtn = div.querySelector('.flip-y');
			const moveUpBtn = div.querySelector('.move-up');
			const moveDownBtn = div.querySelector('.move-down');

			xInput.addEventListener('change', () => {
				layer.x = parseInt(xInput.value) || 0;
				applyLayerTransform(layer);
			});
			yInput.addEventListener('change', () => {
				layer.y = parseInt(yInput.value) || 0;
				applyLayerTransform(layer);
			});
			wInput.addEventListener('change', () => {
				layer.width = parseInt(wInput.value) || 50;
				applyLayerTransform(layer);
			});
			hInput.addEventListener('change', () => {
				layer.height = parseInt(hInput.value) || 30;
				applyLayerTransform(layer);
			});

			flipXBtn.addEventListener('click', () => {
				layer.flipX = !layer.flipX;
				applyLayerTransform(layer);
			});
			flipYBtn.addEventListener('click', () => {
				layer.flipY = !layer.flipY;
				applyLayerTransform(layer);
			});

			moveUpBtn.addEventListener('click', () => {
				const layerIdx = videoLayers.findIndex(l => l.id === layer.id);
				if (layerIdx > 0) {
					// Меняем местами слои
					[videoLayers[layerIdx], videoLayers[layerIdx - 1]] = [videoLayers[layerIdx - 1], videoLayers[layerIdx]];
					
					// Находим индекс соответствующего источника в mixerState.sources
					const sourceIdx = mixerState.sources.findIndex(s => s.layerId === layer.id);
					if (sourceIdx > 0) {
						[mixerState.sources[sourceIdx], mixerState.sources[sourceIdx - 1]] = [mixerState.sources[sourceIdx - 1], mixerState.sources[sourceIdx]];
					}
					
					updateLayersZIndex();
					renderSources();  // перерисовываем карточки в новом порядке
				}
			});

			moveDownBtn.addEventListener('click', () => {
				const layerIdx = videoLayers.findIndex(l => l.id === layer.id);
				if (layerIdx < videoLayers.length - 1) {
					[videoLayers[layerIdx], videoLayers[layerIdx + 1]] = [videoLayers[layerIdx + 1], videoLayers[layerIdx]];
					
					const sourceIdx = mixerState.sources.findIndex(s => s.layerId === layer.id);
					if (sourceIdx < mixerState.sources.length - 1) {
						[mixerState.sources[sourceIdx], mixerState.sources[sourceIdx + 1]] = [mixerState.sources[sourceIdx + 1], mixerState.sources[sourceIdx]];
					}
					
					updateLayersZIndex();
					renderSources();
				}
			});
		}
	});
}

function updateLayersZIndex() {
	videoLayers.forEach((layer, index) => {
		const div = document.getElementById(layer.id);
		if (div) {
			div.style.zIndex = index + 1;
		}
	});
}

// ---------- Добавление внешнего источника (аудио + видео) ----------
async function addSourceToMixer(sourceId, stream, metadata) {
	const audioTracks = stream.getAudioTracks();
	if (audioTracks.length > 0) {
		initAudio();
		const audioStream = new MediaStream(audioTracks.map(t => t.clone()));
		const sourceNode = audioContext.createMediaStreamSource(audioStream);
		const gainNode = audioContext.createGain();
		gainNode.gain.value = (metadata.volume || 100) / 100;
		sourceNode.connect(gainNode);
		gainNode.connect(destination);
		activeSources.set(sourceId, { sourceNode, gainNode, stream: audioStream });

		audioTracks[0].addEventListener('ended', () => {
			removeSource(sourceId);
		});
	}

	const videoTracks = stream.getVideoTracks();
	if (videoTracks.length > 0) {
		const videoStream = new MediaStream(videoTracks.map(t => t.clone()));
		const layer = createVideoLayer(videoStream, metadata.label, metadata.icon, sourceId);

		mixerState.sources.push({
			id: sourceId,
			label: metadata.label,
			icon: metadata.icon,
			volume: metadata.volume || 100,
			enabled: true,
			hasAudio: audioTracks.length > 0,
			layerId: layer.id
		});
	} else {
		mixerState.sources.push({
			id: sourceId,
			label: metadata.label,
			icon: metadata.icon,
			volume: metadata.volume || 100,
			enabled: true,
			hasAudio: audioTracks.length > 0,
			layerId: null
		});
	}

	saveState();
	renderSources();
	document.getElementById('preview-video').srcObject = destination.stream;
	refreshCompositeStreamAudio();
}

function removeSource(sourceId) {
	if (activeSources.has(sourceId)) {
		const src = activeSources.get(sourceId);
		src.stream.getTracks().forEach(t => t.stop());
		src.sourceNode.disconnect();
		activeSources.delete(sourceId);
	}

	const source = mixerState.sources.find(s => s.id === sourceId);
	if (source && source.layerId) {
		removeVideoLayer(source.layerId);
	} else {
		mixerState.sources = mixerState.sources.filter(s => s.id !== sourceId);
		saveState();
		renderSources();
	}
	refreshCompositeStreamAudio();
}

// ---------- Захват экрана/окна/вкладки ----------
async function captureScreen() {
	try {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			audio: true,
			video: true
		});

		const videoTracks = stream.getVideoTracks();
		let label = 'Источник';
		let type = 'screen';
		let displaySurface = 'monitor';
		let icon = '🖥️';

		if (videoTracks.length > 0) {
			const settings = videoTracks[0].getSettings();
			displaySurface = settings.displaySurface || 'monitor';
			type = displaySurface;

			const rawLabel = videoTracks[0].label || '';
			if (displaySurface === 'monitor') {
				label = 'Экран';
				icon = '🖥️';
			} else if (displaySurface === 'window') {
				label = rawLabel.replace(/^[\d:]+ - /, '');
				if (!label) label = 'Окно';
				icon = '🪟';
			} else if (displaySurface === 'browser') {
				label = rawLabel.replace(/ - (Google Chrome|Chromium|Яндекс|Firefox|Edge)$/i, '')
								.replace(/ — (Google Chrome|Chromium|Яндекс|Firefox|Edge)$/i, '');
				if (!label) label = 'Вкладка браузера';
				icon = '🌐';
			}
		}

		const sourceId = `source-${Date.now()}`;
		const metadata = { label, icon, volume: 100 };
		await addSourceToMixer(sourceId, stream, metadata);

	} catch (err) {
		if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
			alert('Ошибка при выборе источника: ' + err.message);
		}
	}
}

// ---------- Сохранение состояния ----------
async function loadState() {
	const data = await chrome.storage.sync.get('audioMixerState');
	if (data.audioMixerState) {
		mixerState.devices = data.audioMixerState.devices || [];
	}
	mixerState.sources = []; // источники не восстанавливаем
}

async function saveState() {
	await chrome.storage.sync.set({ audioMixerState: { devices: mixerState.devices } });
}

// ---------- Управление масштабом сцены ----------
function setStageSize() {
	const videoStage = document.getElementById('video-stage');
	const container = document.getElementById('video-layers-container');
	if (!videoStage || !container) return;

	const stageRect = videoStage.getBoundingClientRect();
	const availableWidth = stageRect.width;
	const availableHeight = stageRect.height;

	scale = Math.min(availableWidth / stageWidth, availableHeight / stageHeight);

	const offsetX = (availableWidth - stageWidth * scale) / 2;
	const offsetY = (availableHeight - stageHeight * scale) / 2;

	// containerOffset - это экранные координаты левого верхнего угла логического экрана
	containerOffset.x = stageRect.left + offsetX;
	containerOffset.y = stageRect.top + offsetY;

	container.style.setProperty('--stage-width', stageWidth + 'px');
	container.style.setProperty('--stage-height', stageHeight + 'px');
	container.style.setProperty('--scale', scale);
	container.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

	videoLayers.forEach(layer => applyLayerTransform(layer));
}

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', () => {
	setStageSize();
	initCompositeCanvas();
	loadState().then(async () => {
		await renderDevices();
		updateMixer();
	});
});

window.addEventListener('resize', () => {
	setStageSize();
});

// Обработчики UI
document.getElementById('listen-volume')?.addEventListener('input', (e) => {
	const val = parseInt(e.target.value);
	document.getElementById('listen-volume-value').textContent = val + '%';
	if (listenGainNode) listenGainNode.gain.value = val / 100;
});

document.getElementById('fullscreen-window-btn')?.addEventListener('click', () => {
	window.parent.postMessage({ action: 'enterFullWindow' }, '*');
	document.body.classList.add('fullscreen-mode');
});

document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		window.parent.postMessage({ action: 'exitFullWindow' }, '*');
		document.body.classList.remove('fullscreen-mode');
	}
});

document.getElementById('add-screen-source-btn')?.addEventListener('click', captureScreen);

window.addEventListener('beforeunload', () => {
    if (compositeAnimationFrame) {
        cancelAnimationFrame(compositeAnimationFrame);
        compositeAnimationFrame = null;
    }
});