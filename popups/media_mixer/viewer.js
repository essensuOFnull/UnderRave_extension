// viewer.js – окно просмотра (композит через video)

let managerPort = null;
let sources = new Map();           // sourceId -> { stream, video, width, height, transform, hasAudio, audioGainNode?, audioSourceNode? }
let devices = new Map();           // deviceId -> { stream, sourceNode, gainNode, enabled, volume }
let audioCtx = null;
let masterGain = null;
let destination = null;            // MediaStreamAudioDestinationNode
let silentSource = null;
let animationFrame = null;
let renderInterval = null;
let stageWidth = 1920;
let stageHeight = 1080;

async function setupSourceAudio(sourceId, initialVolume) {
	const source = sources.get(sourceId);
	if (!source || !source.hasAudio || source.audioGainNode) return;
	await ensureAudioContext();
	const sourceNode = audioCtx.createMediaStreamSource(source.stream);
	const gainNode = audioCtx.createGain();
	gainNode.gain.value = initialVolume / 100;
	sourceNode.connect(gainNode);
	gainNode.connect(masterGain);
	source.audioGainNode = gainNode;
	source.audioSourceNode = sourceNode;
}
// Элементы
const outputVideo = document.getElementById('output-video');
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = stageWidth;
offscreenCanvas.height = stageHeight;
offscreenCanvas.style.position = 'absolute';
offscreenCanvas.style.left = '-9999px';
offscreenCanvas.style.top = '-9999px';
document.body.appendChild(offscreenCanvas);
const offscreenCtx = offscreenCanvas.getContext('2d');

// Поток для вывода
let outputStream = null;

// ---------- Аудио инициализация ----------
function initAudio() {
	if (audioCtx) return;
	audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	masterGain = audioCtx.createGain();
	destination = audioCtx.createMediaStreamDestination();
	masterGain.connect(destination);
}

async function ensureAudioContext() {
	if (audioCtx && audioCtx.state === 'suspended') {
		await audioCtx.resume();
		if (!silentSource && audioCtx.state === 'running') {
			silentSource = audioCtx.createConstantSource();
			silentSource.offset.value = 0;
			silentSource.connect(masterGain);
			silentSource.start();
		}
	}
}

// ---------- Инициализация видеопотока ----------
function initOutputStream() {
	if (outputStream) {
		outputStream.getTracks().forEach(t => t.stop());
	}
	const videoTrack = offscreenCanvas.captureStream(30).getVideoTracks()[0];
	const audioTracks = destination ? destination.stream.getAudioTracks() : [];
	outputStream = new MediaStream([videoTrack, ...audioTracks]);
	outputVideo.srcObject = outputStream;
	outputVideo.play().catch(e => console.warn('play error', e));
}

// ---------- Связь с менеджером ----------
managerPort = chrome.runtime.connect({ name: 'viewer' });
managerPort.onDisconnect.addListener(() => {
	console.log('Disconnected from manager');
	window.close();
});
managerPort.onMessage.addListener(handleManagerMessage);
managerPort.postMessage({ type: 'VIEWER_READY' });

function handleManagerMessage(msg) {
	switch (msg.type) {
		case 'ADD_SOURCE':
			captureSource(msg.sourceId, msg.sourceType, msg.transform);
			break;
		case 'REMOVE_SOURCE':
			removeSource(msg.sourceId);
			break;
		case 'UPDATE_TRANSFORM':
			updateTransform(msg.sourceId, msg.transform);
			break;
		case 'REORDER_SOURCES':
			reorderSources(msg.order);
			break;
		case 'SET_MIXER_STATE':
			applyMixerState(msg.devices, msg.sources);
			break;
		case 'SET_MASTER_VOLUME':
			if (masterGain) masterGain.gain.value = msg.volume;
			break;
		case 'TOGGLE_PIP':
			togglePictureInPicture();
			break;
		default:
			console.log('Unknown message from manager:', msg);
	}
}

// ---------- PiP ----------
async function togglePictureInPicture() {
	if (!outputVideo) return;
	try {
		if (document.pictureInPictureElement) {
			await document.exitPictureInPicture();
		} else {
			await outputVideo.requestPictureInPicture();
		}
	} catch (err) {
		console.error('PiP error:', err);
	}
}

// ---------- Применение состояния микрофонов и громкости источников ----------
async function applyMixerState(devicesList, sourcesList) {
	initAudio();
	await ensureAudioContext();

	// 1. Обрабатываем микрофоны
	const newDeviceIds = new Set(devicesList.filter(d => d.enabled).map(d => d.id));
	const currentDeviceIds = new Set(devices.keys());

	for (let id of currentDeviceIds) {
		if (!newDeviceIds.has(id)) {
			const dev = devices.get(id);
			dev.stream.getTracks().forEach(t => t.stop());
			dev.sourceNode.disconnect();
			devices.delete(id);
		}
	}

	for (let dev of devicesList) {
		if (dev.enabled) {
			if (!devices.has(dev.id)) {
				try {
					await ensureAudioContext();
					const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev.id } });
					const sourceNode = audioCtx.createMediaStreamSource(stream);
					const gainNode = audioCtx.createGain();
					gainNode.gain.value = dev.volume / 100;
					sourceNode.connect(gainNode);
					gainNode.connect(masterGain);
					devices.set(dev.id, { stream, sourceNode, gainNode, enabled: true, volume: dev.volume });
				} catch (e) {
					console.warn('Failed to capture microphone', dev, e);
				}
			} else {
				const existing = devices.get(dev.id);
				if (existing.volume !== dev.volume) {
					existing.gainNode.gain.value = dev.volume / 100;
					existing.volume = dev.volume;
				}
			}
		}
	}

	// 2. Обрабатываем громкость источников (screen/camera)
	for (let src of sourcesList) {
		if (!src.hasAudio) continue;
		const source = sources.get(src.id);
		if (!source) continue;

		if (!source.audioGainNode && source.stream.getAudioTracks().length > 0) {
			// Если узел ещё не создан (например, из-за гонки) – создаём
			await setupSourceAudio(src.id, src.volume);
		} else if (source.audioGainNode) {
			source.audioGainNode.gain.value = src.volume / 100;
		}
	}

	// При первом запуске инициализируем выходной поток
	if (!outputStream) {
		initOutputStream();
	}
}

// ---------- Захват видео (и аудио для screen) ----------
async function captureSource(sourceId, sourceType, initialTransform) {
	try {
		let stream;
		if (sourceType === 'screen') {
			stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
		} else {
			stream = await navigator.mediaDevices.getUserMedia({ video: true });
		}

		const video = document.createElement('video');
		video.srcObject = stream;
		video.autoplay = true;
		video.playsInline = true;
		video.muted = true;
		await video.play();

		const track = stream.getVideoTracks()[0];
		const settings = track.getSettings();
		const width = settings.width || 640;
		const height = settings.height || 480;

		const hasAudio = stream.getAudioTracks().length > 0;
		sources.set(sourceId, {
			stream,
			video,
			width,
			height,
			transform: initialTransform || { x: 0, y: 0, width, height, flipX: false, flipY: false },
			hasAudio
		});

		if (hasAudio) {
			// Начальная громкость 100% (будет скорректирована позже из SET_MIXER_STATE)
			setupSourceAudio(sourceId, 100);
		}

		managerPort.postMessage({ type: 'SOURCE_CAPTURED', sourceId, width, height });

		if (!animationFrame && !renderInterval) {
			startRendering();
		}

		track.addEventListener('ended', () => {
			managerPort.postMessage({ type: 'SOURCE_ENDED', sourceId });
			removeSource(sourceId);
		});

	} catch (err) {
		managerPort.postMessage({ type: 'CAPTURE_ERROR', sourceId, error: err.message });
	}
}

function removeSource(sourceId) {
	const source = sources.get(sourceId);
	if (source) {
		if (source.audioSourceNode) source.audioSourceNode.disconnect();
		source.stream.getTracks().forEach(t => t.stop());
		sources.delete(sourceId);
	}
	if (sources.size === 0 && devices.size === 0) {
		stopRendering();
		if (audioCtx) audioCtx.close();
	}
}

function updateTransform(sourceId, transform) {
	const source = sources.get(sourceId);
	if (source) source.transform = transform;
}

function reorderSources(order) {
	const newSources = new Map();
	order.forEach(id => { if (sources.has(id)) newSources.set(id, sources.get(id)); });
	sources.forEach((v, id) => { if (!newSources.has(id)) newSources.set(id, v); });
	sources = newSources;
}

// ---------- Рендеринг ----------
function startRendering() {
	stopRendering();
	if (document.hidden) {
		renderInterval = setInterval(renderFrame, 16); // 5 fps в фоне
	} else {
		renderLoop();
	}
}

function stopRendering() {
	if (animationFrame) {
		cancelAnimationFrame(animationFrame);
		animationFrame = null;
	}
	if (renderInterval) {
		clearInterval(renderInterval);
		renderInterval = null;
	}
}

function renderLoop() {
	renderFrame();
	animationFrame = requestAnimationFrame(renderLoop);
}

function renderFrame() {
	offscreenCtx.clearRect(0, 0, stageWidth, stageHeight);

	for (let source of sources.values()) {
		const t = source.transform;
		const x = t.x;
		const y = t.y;
		const w = t.width;
		const h = t.height;

		offscreenCtx.save();
		offscreenCtx.translate(x + w/2, y + h/2);
		offscreenCtx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
		offscreenCtx.drawImage(source.video, -w/2, -h/2, w, h);
		offscreenCtx.restore();
	}

	// Отправляем превью в менеджер
	const previewCanvas = document.createElement('canvas');
	previewCanvas.width = 320;
	previewCanvas.height = 180;
	const previewCtx = previewCanvas.getContext('2d');
	previewCtx.drawImage(offscreenCanvas, 0, 0, stageWidth, stageHeight, 0, 0, 320, 180);
	previewCanvas.toBlob(blob => {
		const reader = new FileReader();
		reader.onloadend = () => {
			managerPort.postMessage({
				type: 'PREVIEW_FRAME',
				data: reader.result,
				width: 320,
				height: 180
			});
		};
		reader.readAsDataURL(blob);
	}, 'image/jpeg', 0.5);
}

document.addEventListener('visibilitychange', () => {
	if (sources.size > 0 || devices.size > 0) {
		startRendering();
	}
});

window.addEventListener('beforeunload', () => {
	stopRendering();
	if (audioCtx) audioCtx.close();
	sources.forEach(s => s.stream.getTracks().forEach(t => t.stop()));
	devices.forEach(d => d.stream.getTracks().forEach(t => t.stop()));
	if (outputStream) outputStream.getTracks().forEach(t => t.stop());
});