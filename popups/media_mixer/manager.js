// manager.js – окно управления микшером (полная версия с UI)

let mixerState = { devices: [], sources: [] };
let videoLayers = [];           // { id, sourceId, div, transform, naturalAspect }
let nextLayerId = 1;
let dragState = { active: false };
let stageWidth = 1920;
let stageHeight = 1080;
let scale = 1;
let containerOffset = { x: 0, y: 0 };

let viewerPort = null;
let viewerTabId = null;
let pendingCommands = [];

const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');

// ---------- Связь с вьювером ----------
chrome.runtime.onConnect.addListener((port) => {
	if (port.name === 'viewer' && port.sender?.tab?.id === viewerTabId) {
		viewerPort = port;
		viewerPort.onMessage.addListener(handleViewerMessage);
		viewerPort.onDisconnect.addListener(() => {
			viewerPort = null;
			console.log('Viewer disconnected');
		});
		while (pendingCommands.length) {
			viewerPort.postMessage(pendingCommands.shift());
		}
		sendStateToViewer();
		sendMasterVolume();
	}
});

function handleViewerMessage(msg) {
	switch (msg.type) {
		case 'VIEWER_READY':
			console.log('Viewer ready');
			break;
		case 'PREVIEW_FRAME':
			const img = new Image();
			img.onload = () => {
				previewCanvas.width = msg.width;
				previewCanvas.height = msg.height;
				previewCtx.drawImage(img, 0, 0);
			};
			img.src = msg.data;
			break;
		case 'SOURCE_CAPTURED':
			console.log('Source captured:', msg.sourceId, msg.width, msg.height);
			const layer = videoLayers.find(l => l.sourceId === msg.sourceId);
			if (layer) layer.naturalAspect = msg.width / msg.height;
			break;
		case 'CAPTURE_ERROR':
			console.error('Capture error:', msg.error);
			alert('Ошибка захвата: ' + msg.error);
			removeSource(msg.sourceId);
			break;
		case 'SOURCE_ENDED':
			removeSource(msg.sourceId);
			break;
		default:
			console.log('Unknown message from viewer:', msg);
	}
}

function sendToViewer(message) {
	if (viewerPort) {
		viewerPort.postMessage(message);
	} else {
		pendingCommands.push(message);
	}
}

function sendStateToViewer() {
	sendToViewer({
		type: 'SET_MIXER_STATE',
		devices: mixerState.devices,
		sources: mixerState.sources
	});
}

function sendMasterVolume() {
	const val = parseInt(document.getElementById('listen-volume').value);
	sendToViewer({ type: 'SET_MASTER_VOLUME', volume: val / 100 });
}

async function launchViewer() {
	if (viewerTabId) {
		chrome.tabs.update(viewerTabId, { active: true });
		return;
	}
	viewerPort = null;
	pendingCommands = [];
	try {
		const viewerTab = await chrome.tabs.create({
			url: chrome.runtime.getURL('popups/media_mixer/viewer.html'),
			active: true
		});
		viewerTabId = viewerTab.id;
	} catch (err) {
		console.error('Failed to launch viewer:', err);
	}
}

// ---------- Микрофоны (UI) ----------
async function getDevices() {
	let tempStream;
	try {
		tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch (e) {}
	const devices = await navigator.mediaDevices.enumerateDevices();
	if (tempStream) tempStream.getTracks().forEach(t => t.stop());
	return devices.filter(d => d.kind === 'audioinput');
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
			sendStateToViewer();
			// Если микрофон включён, а viewer ещё не открыт – открываем
			if (devState.enabled && !viewerTabId) {
				launchViewer();
			}
		});

		slider.addEventListener('input', (e) => {
			const val = parseInt(e.target.value);
			devState.volume = val;
			span.textContent = val + '%';
			saveState();
			sendStateToViewer();
			// Если микрофон уже включён, но viewer почему-то закрыт – открываем
			if (devState.enabled && !viewerTabId) {
				launchViewer();
			}
		});
	});
}

// ---------- Внешние источники (видео) ----------
async function addSource(type) {
	await launchViewer();

	const sourceId = `source-${Date.now()}-${Math.random()}`;
	const initialTransform = { x: 20, y: 20, width: 320, height: 180, flipX: false, flipY: false };

	sendToViewer({ type: 'ADD_SOURCE', sourceId, sourceType: type, transform: initialTransform });

	const layer = createLocalLayer(sourceId, type, initialTransform);
	mixerState.sources.push({
		id: sourceId,
		label: type === 'screen' ? 'Экран' : 'Камера',
		icon: type === 'screen' ? '🖥️' : '📷',
		volume: 100,
		hasAudio: type === 'screen',
		layerId: layer.id
	});
	renderSources();
	sendStateToViewer();
}

function removeSource(sourceId) {
	sendToViewer({ type: 'REMOVE_SOURCE', sourceId });

	const layerIndex = videoLayers.findIndex(l => l.sourceId === sourceId);
	if (layerIndex !== -1) {
		videoLayers[layerIndex].div.remove();
		videoLayers.splice(layerIndex, 1);
	}

	const sourceIndex = mixerState.sources.findIndex(s => s.id === sourceId);
	if (sourceIndex !== -1) mixerState.sources.splice(sourceIndex, 1);

	renderSources();
	updateLayersZIndex();
	sendStateToViewer();
}

// ---------- Создание слоя в менеджере ----------
function createLocalLayer(sourceId, type, transform) {
	const container = document.getElementById('video-layers-container');
	const layerId = `layer-${nextLayerId++}`;
	const layerDiv = document.createElement('div');
	layerDiv.className = 'video-layer';
	layerDiv.id = layerId;
	layerDiv.dataset.sourceId = sourceId;
	layerDiv.style.background = 'rgba(0,100,200,0.3)';
	layerDiv.style.border = '2px solid #4f9eff';
	layerDiv.style.display = 'flex';
	layerDiv.style.alignItems = 'center';
	layerDiv.style.justifyContent = 'center';
	layerDiv.style.color = 'white';
	layerDiv.style.fontSize = '14px';
	layerDiv.textContent = type === 'screen' ? '🖥️ Экран' : '📷 Камера';

	const closeBtn = document.createElement('div');
	closeBtn.className = 'layer-close-btn';
	closeBtn.innerHTML = '✕';
	closeBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		removeSource(sourceId);
	});
	layerDiv.appendChild(closeBtn);

	createResizeHandles(layerDiv);
	container.appendChild(layerDiv);

	const layer = {
		id: layerId,
		sourceId,
		div: layerDiv,
		transform: { ...transform },
		naturalAspect: null
	};
	videoLayers.push(layer);

	applyLayerTransform(layer);
	updateLayersZIndex();

	layerDiv.addEventListener('mousedown', (e) => {
		if (e.target.classList.contains('resize-handle')) return;
		onLayerMouseDown(e, null, layerId, sourceId);
	});

	const handles = layerDiv.querySelectorAll('.resize-handle');
	handles.forEach(handle => {
		handle.addEventListener('mousedown', (e) => {
			e.stopPropagation();
			const edge = handle.dataset.edge;
			onLayerMouseDown(e, edge, layerId, sourceId);
		});
	});

	return layer;
}

function onLayerMouseDown(e, edge, layerId, sourceId) {
	e.preventDefault();
	const layer = videoLayers.find(l => l.id === layerId);
	if (!layer) return;

	dragState.active = true;
	dragState.layerId = layerId;
	dragState.sourceId = sourceId;
	dragState.startMouseX = e.clientX;
	dragState.startMouseY = e.clientY;
	dragState.startLayer = { ...layer.transform };
	dragState.edge = edge;
	dragState.ctrlPressed = e.ctrlKey;

	window.addEventListener('mousemove', onWindowMouseMove);
	window.addEventListener('mouseup', onWindowMouseUp);
}

function onWindowMouseMove(e) {
	if (!dragState.active) return;
	const layer = videoLayers.find(l => l.id === dragState.layerId);
	if (!layer) return;

	const deltaX = (e.clientX - dragState.startMouseX) / scale;
	const deltaY = (e.clientY - dragState.startMouseY) / scale;
	const start = dragState.startLayer;
	let newX = start.x, newY = start.y, newW = start.width, newH = start.height;

	if (dragState.edge) {
		switch (dragState.edge) {
			case 'left':
				newX = start.x + deltaX;
				newW = start.width - deltaX;
				break;
			case 'right':
				newW = start.width + deltaX;
				break;
			case 'top':
				newY = start.y + deltaY;
				newH = start.height - deltaY;
				break;
			case 'bottom':
				newH = start.height + deltaY;
				break;
			case 'top-left':
				newX = start.x + deltaX;
				newY = start.y + deltaY;
				newW = start.width - deltaX;
				newH = start.height - deltaY;
				break;
			case 'top-right':
				newY = start.y + deltaY;
				newW = start.width + deltaX;
				newH = start.height - deltaY;
				break;
			case 'bottom-left':
				newX = start.x + deltaX;
				newW = start.width - deltaX;
				newH = start.height + deltaY;
				break;
			case 'bottom-right':
				newW = start.width + deltaX;
				newH = start.height + deltaY;
				break;
		}

		const minWidth = 50 / scale;
		const minHeight = 30 / scale;
		if (newW < minWidth) {
			if (dragState.edge.includes('left')) newX = start.x + start.width - minWidth;
			newW = minWidth;
		}
		if (newH < minHeight) {
			if (dragState.edge.includes('top')) newY = start.y + start.height - minHeight;
			newH = minHeight;
		}

		if (dragState.ctrlPressed && layer.naturalAspect) {
			const aspect = layer.naturalAspect;
			const deltaW = newW - start.width;
			const deltaH = newH - start.height;
			if (Math.abs(deltaW) > Math.abs(deltaH)) {
				newH = newW / aspect;
				if (dragState.edge.includes('top')) newY = start.y + (start.height - newH);
			} else {
				newW = newH * aspect;
				if (dragState.edge.includes('left')) newX = start.x + (start.width - newW);
			}
		}
	} else {
		newX = start.x + deltaX;
		newY = start.y + deltaY;
	}

	const snapped = applySnap(newX, newY, newW, newH, layer.id, dragState.edge);
	newX = snapped.x;
	newY = snapped.y;
	newW = snapped.width;
	newH = snapped.height;

	layer.transform = { x: newX, y: newY, width: newW, height: newH, flipX: false, flipY: false };
	applyLayerTransform(layer);

	sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: dragState.sourceId, transform: layer.transform });
}

function applySnap(x, y, width, height, excludeLayerId, edge) {
	const snapRadiusLogical = 10 / scale;
	let snappedX = x, snappedY = y, snappedW = width, snappedH = height;

	const snapLeft = (targetLeft) => {
		const dist = Math.abs(x - targetLeft);
		if (dist < snapRadiusLogical) {
			snappedX = targetLeft;
			if (edge && (edge.includes('left') || edge.includes('right'))) {
				snappedW = width + (x - targetLeft);
			}
		}
	};
	const snapRight = (targetRight) => {
		const dist = Math.abs(x + width - targetRight);
		if (dist < snapRadiusLogical) {
			if (edge && (edge.includes('right') || edge.includes('left'))) {
				snappedW = targetRight - x;
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
				snappedH = height + (y - targetTop);
			}
		}
	};
	const snapBottom = (targetBottom) => {
		const dist = Math.abs(y + height - targetBottom);
		if (dist < snapRadiusLogical) {
			if (edge && (edge.includes('bottom') || edge.includes('top'))) {
				snappedH = targetBottom - y;
			} else {
				snappedY = targetBottom - height;
			}
		}
	};

	snapLeft(0);
	snapRight(stageWidth);
	snapTop(0);
	snapBottom(stageHeight);

	videoLayers.forEach(other => {
		if (other.id === excludeLayerId) return;
		const ol = other.transform;
		snapLeft(ol.x);
		snapLeft(ol.x + ol.width);
		snapRight(ol.x);
		snapRight(ol.x + ol.width);
		snapTop(ol.y);
		snapTop(ol.y + ol.height);
		snapBottom(ol.y);
		snapBottom(ol.y + ol.height);
	});

	return { x: snappedX, y: snappedY, width: snappedW, height: snappedH };
}

function onWindowMouseUp(e) {
	if (!dragState.active) return;
	window.removeEventListener('mousemove', onWindowMouseMove);
	window.removeEventListener('mouseup', onWindowMouseUp);
	dragState.active = false;
	renderSources(); // обновляем поля ввода
}

function applyLayerTransform(layer) {
	const div = layer.div;
	const t = layer.transform;
	const screenX = t.x * scale;
	const screenY = t.y * scale;
	const screenWidth = t.width * scale;
	const screenHeight = t.height * scale;

	div.style.left = screenX + 'px';
	div.style.top = screenY + 'px';
	div.style.width = screenWidth + 'px';
	div.style.height = screenHeight + 'px';

	let scaleX = t.flipX ? -1 : 1;
	let scaleY = t.flipY ? -1 : 1;
	div.style.transform = `scale(${scaleX}, ${scaleY})`;
}

function createResizeHandles(layerDiv) {
	const positions = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
	positions.forEach(pos => {
		const handle = document.createElement('div');
		handle.className = `resize-handle ${pos}`;
		handle.dataset.edge = pos;
		layerDiv.appendChild(handle);
	});
}

function updateLayersZIndex() {
	videoLayers.forEach((layer, index) => {
		const div = document.getElementById(layer.id);
		if (div) div.style.zIndex = index + 1;
	});
}

function syncLayerOrder() {
	const order = videoLayers.map(l => l.sourceId);
	sendToViewer({ type: 'REORDER_SOURCES', order });
}

function renderSources() {
	const container = document.getElementById('sources-list');
	if (!container) return;
	container.innerHTML = '';

	mixerState.sources.forEach(source => {
		const layer = videoLayers.find(l => l.sourceId === source.id);
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
							<input type="number" value="${Math.round(layer.transform.x)}" step="1" class="layer-pos-x" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<label>Y:</label>
							<input type="number" value="${Math.round(layer.transform.y)}" step="1" class="layer-pos-y" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<label>W:</label>
							<input type="number" value="${Math.round(layer.transform.width)}" step="1" class="layer-width" data-id="${source.id}">
						</div>
						<div class="video-control-group">
							<label>H:</label>
							<input type="number" value="${Math.round(layer.transform.height)}" step="1" class="layer-height" data-id="${source.id}">
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

		const removeBtn = div.querySelector('.remove-source');
		removeBtn.addEventListener('click', () => removeSource(source.id));

		if (source.hasAudio) {
			const slider = div.querySelector('.volume-slider');
			const span = div.querySelector('.volume-value');
			slider.addEventListener('input', (e) => {
				const val = parseInt(e.target.value);
				source.volume = val;
				span.textContent = val + '%';
				sendStateToViewer();
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
				layer.transform.x = parseInt(xInput.value) || 0;
				applyLayerTransform(layer);
				sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: source.id, transform: layer.transform });
			});
			yInput.addEventListener('change', () => {
				layer.transform.y = parseInt(yInput.value) || 0;
				applyLayerTransform(layer);
				sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: source.id, transform: layer.transform });
			});
			wInput.addEventListener('change', () => {
				layer.transform.width = parseInt(wInput.value) || 50;
				applyLayerTransform(layer);
				sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: source.id, transform: layer.transform });
			});
			hInput.addEventListener('change', () => {
				layer.transform.height = parseInt(hInput.value) || 30;
				applyLayerTransform(layer);
				sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: source.id, transform: layer.transform });
			});

			flipXBtn.addEventListener('click', () => {
				layer.transform.flipX = !layer.transform.flipX;
				applyLayerTransform(layer);
				sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: source.id, transform: layer.transform });
			});
			flipYBtn.addEventListener('click', () => {
				layer.transform.flipY = !layer.transform.flipY;
				applyLayerTransform(layer);
				sendToViewer({ type: 'UPDATE_TRANSFORM', sourceId: source.id, transform: layer.transform });
			});

			moveUpBtn.addEventListener('click', () => {
				const layerIdx = videoLayers.findIndex(l => l.sourceId === source.id);
				if (layerIdx > 0) {
					[videoLayers[layerIdx], videoLayers[layerIdx-1]] = [videoLayers[layerIdx-1], videoLayers[layerIdx]];
					const sourceIdx = mixerState.sources.findIndex(s => s.id === source.id);
					if (sourceIdx > 0) {
						[mixerState.sources[sourceIdx], mixerState.sources[sourceIdx-1]] = [mixerState.sources[sourceIdx-1], mixerState.sources[sourceIdx]];
					}
					updateLayersZIndex();
					renderSources();
					syncLayerOrder();
				}
			});

			moveDownBtn.addEventListener('click', () => {
				const layerIdx = videoLayers.findIndex(l => l.sourceId === source.id);
				if (layerIdx < videoLayers.length - 1) {
					[videoLayers[layerIdx], videoLayers[layerIdx+1]] = [videoLayers[layerIdx+1], videoLayers[layerIdx]];
					const sourceIdx = mixerState.sources.findIndex(s => s.id === source.id);
					if (sourceIdx < mixerState.sources.length - 1) {
						[mixerState.sources[sourceIdx], mixerState.sources[sourceIdx+1]] = [mixerState.sources[sourceIdx+1], mixerState.sources[sourceIdx]];
					}
					updateLayersZIndex();
					renderSources();
					syncLayerOrder();
				}
			});
		}
	});
}

// ---------- Сохранение состояния ----------
async function loadState() {
	const data = await chrome.storage.sync.get('audioMixerState');
	if (data.audioMixerState) {
		mixerState.devices = data.audioMixerState.devices || [];
	}
	mixerState.sources = [];
}

async function saveState() {
	await chrome.storage.sync.set({ audioMixerState: { devices: mixerState.devices } });
}

// ---------- Инициализация и размеры сцены ----------
document.addEventListener('DOMContentLoaded', async () => {
	await loadState();
	await renderDevices();
	setStageSize();
});

document.getElementById('listen-volume')?.addEventListener('input', (e) => {
	const val = parseInt(e.target.value);
	document.getElementById('listen-volume-value').textContent = val + '%';
	sendMasterVolume();
});

document.getElementById('fullscreen-window-btn')?.addEventListener('click', launchViewer);
document.getElementById('add-screen-source-btn')?.addEventListener('click', () => addSource('screen'));
document.getElementById('add-camera-source-btn')?.addEventListener('click', () => addSource('camera'));

function setStageSize() {
	const container = document.getElementById('video-layers-container');
	if (!container) return;
	const rect = container.getBoundingClientRect();
	scale = Math.min(rect.width / stageWidth, rect.height / stageHeight);
	containerOffset.x = rect.left;
	containerOffset.y = rect.top;
	videoLayers.forEach(layer => applyLayerTransform(layer));
}

window.addEventListener('resize', setStageSize);

document.getElementById('pip-btn')?.addEventListener('click', () => {
	launchViewer();
	sendToViewer({ type: 'TOGGLE_PIP' });
});