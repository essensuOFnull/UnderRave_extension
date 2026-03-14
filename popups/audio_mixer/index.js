let audioContext, destination;
let activeSources = new Map(); // ключ: sourceId (для аудио)
let mixerState = { devices: [], sources: [] };
let listenGainNode;

// Хранилище видеослоёв
let videoLayers = []; // массив объектов { id, stream, videoElement, x, y, width, height, flipX, flipY, visible }
let nextLayerId = 1;
let isDraggingOrResizing = false; // для предотвращения лишних обновлений

// Регистрируем эту вкладку как микшер
chrome.runtime.sendMessage({ action: 'registerMixerTab' });

// ---------- Инициализация аудио ----------
function initAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        destination = audioContext.createMediaStreamDestination();
        listenGainNode = audioContext.createGain();
        listenGainNode.gain.value = 1.0;
        const listenSource = audioContext.createMediaStreamSource(destination.stream);
        listenSource.connect(listenGainNode);
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

    // Останавливаем отключенные микрофоны
    for (let [key, src] of activeSources.entries()) {
        if (!key.startsWith('source-')) {
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

    // Обновляем громкость аудиоисточников (внешних)
    for (let [key, src] of activeSources.entries()) {
        if (key.startsWith('source-')) {
            const source = mixerState.sources.find(s => s.id === key);
            if (source && src.gainNode) {
                src.gainNode.gain.value = source.volume / 100;
            }
        }
    }

    document.getElementById('preview-video').srcObject = destination.stream;
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
            saveState();
            updateMixer();
        });
    });
}

// ---------- Работа с видеослоями ----------
function createVideoLayer(stream, label, icon, sourceId) {
    const layerId = `layer-${nextLayerId++}`;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false;
    video.style.pointerEvents = 'none';

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
        naturalAspect: null // будет заполнено после загрузки метаданных
    };
    videoLayers.push(layerData);

    video.addEventListener('loadedmetadata', () => {
        layerData.naturalAspect = video.videoWidth / video.videoHeight;
    });

    // Инициализация interact.js
    interact(layerDiv)
        .draggable({
            inertia: false,
            modifiers: [
                interact.modifiers.snap({
                    targets: getSnapTargets, // функция будет вызываться каждый раз
                    range: 5,
                    relativePoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
                })
            ],
            listeners: {
                move(event) {
                    const target = event.target;
                    const x = (parseFloat(target.style.left) || 0) + event.dx;
                    const y = (parseFloat(target.style.top) || 0) + event.dy;

                    target.style.left = x + 'px';
                    target.style.top = y + 'px';

                    updateLayerDataFromDiv(target);
                }
            }
        })
        .resizable({
            edges: { left: true, right: true, bottom: true, top: true },
            inertia: false,
            modifiers: [
                interact.modifiers.snap({
                    targets: getSnapTargets,
                    range: 5,
                    relativePoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
                }),
                interact.modifiers.restrictSize({
                    min: { width: 50, height: 30 }
                })
            ],
            listeners: {
                move(event) {
                    const target = event.target;
                    const layer = videoLayers.find(l => l.id === target.id);
                    if (!layer) return;

                    // Текущие координаты (в пикселях)
                    let left = parseFloat(target.style.left) || 0;
                    let top = parseFloat(target.style.top) || 0;

                    // Применяем изменения от ресайза (для левого и верхнего краёв)
                    left += event.deltaRect.left;
                    top += event.deltaRect.top;

                    // Базовые размеры после модификаторов (snap и restrict)
                    let width = event.rect.width;
                    let height = event.rect.height;

                    // Если зажат Ctrl – восстанавливаем исходное соотношение сторон
                    if (event.ctrlKey && layer.naturalAspect) {
                        // Определяем, какое измерение изменилось сильнее
                        const deltaWidth = event.deltaRect.right - event.deltaRect.left;
                        const deltaHeight = event.deltaRect.bottom - event.deltaRect.top;
                        if (Math.abs(deltaWidth) > Math.abs(deltaHeight)) {
                            // Менялась ширина – подгоняем высоту
                            height = width / layer.naturalAspect;
                        } else {
                            // Менялась высота – подгоняем ширину
                            width = height * layer.naturalAspect;
                        }
                    }

                    // Применяем новые размеры и позицию
                    target.style.left = left + 'px';
                    target.style.top = top + 'px';
                    target.style.width = width + 'px';
                    target.style.height = height + 'px';

                    // Обновляем данные слоя и карточки
                    updateLayerDataFromDiv(target);
                }
            }
        });

    applyLayerTransform(layerData);
    return layerData;
}

// Обновляем getSnapTargets для работы с динамическими координатами
function getSnapTargets() {
    const targets = [
        // Границы контейнера
        { x: 0, range: 5 },
        { x: stageWidth, range: 5 },
        { y: 0, range: 5 },
        { y: stageHeight, range: 5 },
        // Углы
        { x: 0, y: 0 },
        { x: stageWidth, y: 0 },
        { x: 0, y: stageHeight },
        { x: stageWidth, y: stageHeight }
    ];

    // Добавляем края других слоёв
    videoLayers.forEach(layer => {
        if (!layer.visible) return;
        const el = document.getElementById(layer.id);
        if (!el) return;
        // Координаты уже относительно контейнера (layer.x, layer.y)
        const left = layer.x;
        const right = left + layer.width;
        const top = layer.y;
        const bottom = top + layer.height;

        targets.push({ x: left, range: 5 });
        targets.push({ x: right, range: 5 });
        targets.push({ y: top, range: 5 });
        targets.push({ y: bottom, range: 5 });
    });

    return targets;
}
// Обновление данных слоя из DOM
function updateLayerDataFromDiv(div) {
    const id = div.id;
    const layer = videoLayers.find(l => l.id === id);
    if (!layer) return;
    layer.x = parseFloat(div.style.left) || 0;
    layer.y = parseFloat(div.style.top) || 0;
    layer.width = parseFloat(div.style.width) || 0;
    layer.height = parseFloat(div.style.height) || 0;
    // transform для отражения не трогаем
    renderSources(); // обновляем карточки
}

// Применить трансформацию (отражение)
function applyLayerTransform(layer) {
    const div = document.getElementById(layer.id);
    if (!div) return;
    div.style.left = layer.x + 'px';
    div.style.top = layer.y + 'px';
    div.style.width = layer.width + 'px';
    div.style.height = layer.height + 'px';
    let scaleX = layer.flipX ? -1 : 1;
    let scaleY = layer.flipY ? -1 : 1;
    div.style.transform = `scale(${scaleX}, ${scaleY})`;
}

// Удаление слоя
function removeVideoLayer(layerId) {
    const layer = videoLayers.find(l => l.id === layerId);
    if (!layer) return;
    // Останавливаем все треки потока
    layer.stream.getTracks().forEach(t => t.stop());
    // Удаляем из DOM
    const div = document.getElementById(layerId);
    if (div) div.remove();
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

// ---------- Добавление внешнего источника (аудио + видео) ----------
async function addSourceToMixer(sourceId, stream, metadata) {
    // Аудио: если есть дорожки, добавляем в аудиомикшер
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

        // Следим за остановкой (если пользователь завершит демонстрацию)
        audioTracks[0].addEventListener('ended', () => {
            removeSource(sourceId);
        });
    }

    // Видео: если есть дорожки, создаём слой
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
        const videoStream = new MediaStream(videoTracks.map(t => t.clone()));
        // Создаём слой
        const layer = createVideoLayer(videoStream, metadata.label, metadata.icon, sourceId);

        // Сохраняем метаданные источника
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
        // Если нет видео, просто сохраняем как аудиоисточник
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
}

function removeSource(sourceId) {
    // Удаляем из активных аудио
    if (activeSources.has(sourceId)) {
        const src = activeSources.get(sourceId);
        src.stream.getTracks().forEach(t => t.stop());
        src.sourceNode.disconnect();
        activeSources.delete(sourceId);
    }

    // Удаляем связанный видеослой
    const source = mixerState.sources.find(s => s.id === sourceId);
    if (source && source.layerId) {
        removeVideoLayer(source.layerId);
    } else {
        // Просто удаляем из массива источников
        mixerState.sources = mixerState.sources.filter(s => s.id !== sourceId);
        saveState();
        renderSources();
    }
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
                // Переместить слой выше в списке (ниже по z-index)
                const idx = videoLayers.findIndex(l => l.id === layer.id);
                if (idx > 0) {
                    [videoLayers[idx], videoLayers[idx-1]] = [videoLayers[idx-1], videoLayers[idx]];
                    updateLayersZIndex();
                }
            });

            moveDownBtn.addEventListener('click', () => {
                const idx = videoLayers.findIndex(l => l.id === layer.id);
                if (idx < videoLayers.length - 1) {
                    [videoLayers[idx], videoLayers[idx+1]] = [videoLayers[idx+1], videoLayers[idx]];
                    updateLayersZIndex();
                }
            });
        }
    });
}

function updateLayersZIndex() {
    videoLayers.forEach((layer, index) => {
        const div = document.getElementById(layer.id);
        if (div) {
            div.style.zIndex = index + 1; // Больше индекс = выше
        }
    });
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

        // Генерируем ID источника
        const sourceId = `source-${Date.now()}`;

        // Метаданные
        const metadata = {
            label: label,
            icon: icon,
            volume: 100
        };

        // Добавляем в микшер
        await addSourceToMixer(sourceId, stream, metadata);

    } catch (err) {
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
            alert('Ошибка при выборе источника: ' + err.message);
        }
    }
}

// ---------- Сохранение состояния (только микрофоны) ----------
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

let stageWidth, stageHeight, scale;

function setStageSize() {
    stageWidth = window.innerWidth;
    stageHeight = window.innerHeight;
    const stage = document.getElementById('video-stage');
    const container = document.getElementById('video-layers-container');
    if (!stage || !container) return;

    const stageRect = stage.getBoundingClientRect();
    const availableWidth = stageRect.width;
    const availableHeight = stageRect.height;

    // Масштаб, чтобы вписать логическую область в доступную
    scale = Math.min(availableWidth / stageWidth, availableHeight / stageHeight);

    container.style.setProperty('--stage-width', stageWidth + 'px');
    container.style.setProperty('--stage-height', stageHeight + 'px');
    container.style.setProperty('--scale', scale);
    container.style.transform = `scale(${scale})`;
}

// Вызываем при загрузке и изменении размера окна
document.addEventListener('DOMContentLoaded', setStageSize);
window.addEventListener('resize', setStageSize);

document.addEventListener('DOMContentLoaded', () => {
    setStageSize();
});

window.addEventListener('resize', () => {
    setStageSize();
});

// ---------- Инициализация ----------
loadState().then(async () => {
    await renderDevices();
    updateMixer();
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

// Выход по Escape внутри iframe
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.parent.postMessage({ action: 'exitFullWindow' }, '*');
        document.body.classList.remove('fullscreen-mode');
    }
});

document.getElementById('add-screen-source-btn')?.addEventListener('click', captureScreen);