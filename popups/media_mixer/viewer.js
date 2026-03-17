// viewer.js – окно просмотра (захват и композитинг)

let managerPort = null;
let sources = new Map();           // sourceId -> { stream, video, width, height, transform, hasAudio, audioGainNode?, audioSourceNode? }
let devices = new Map();           // deviceId -> { stream, sourceNode, gainNode, enabled, volume }
let audioCtx = null;
let masterGain = null;
let silentSource = null;
let animationFrame = null;
let renderInterval = null;
let compositeCanvas = document.getElementById('composite-canvas');
let compositeCtx = compositeCanvas.getContext('2d');
let stageWidth = 1920;
let stageHeight = 1080;

// ---------- Аудио инициализация ----------
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.connect(audioCtx.destination);
}

async function ensureAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    await audioCtx.resume();
    // После первого запуска создаём тихий источник для поддержания активности
    if (!silentSource && audioCtx.state === 'running') {
      silentSource = audioCtx.createConstantSource();
      silentSource.offset.value = 0;
      silentSource.connect(masterGain);
      silentSource.start();
    }
  }
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
    default:
      console.log('Unknown message from manager:', msg);
  }
}

// ---------- Применение состояния микрофонов и громкости источников ----------
async function applyMixerState(devicesList, sourcesList) {
  initAudio();
  await ensureAudioContext();

  // 1. Обрабатываем микрофоны
  const newDeviceIds = new Set(devicesList.filter(d => d.enabled).map(d => d.id));
  const currentDeviceIds = new Set(devices.keys());

  // Удаляем отключённые
  for (let id of currentDeviceIds) {
    if (!newDeviceIds.has(id)) {
      const dev = devices.get(id);
      dev.stream.getTracks().forEach(t => t.stop());
      dev.sourceNode.disconnect();
      devices.delete(id);
    }
  }

  // Добавляем новые / обновляем громкость
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
    if (!source) continue; // источник ещё не захвачен

    // Если аудио ещё не подключено, но поток содержит аудио – создаём
    if (!source.audioGainNode && source.stream.getAudioTracks().length > 0) {
      await ensureAudioContext();
      const sourceNode = audioCtx.createMediaStreamSource(source.stream);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = src.volume / 100;
      sourceNode.connect(gainNode);
      gainNode.connect(masterGain);
      source.audioGainNode = gainNode;
      source.audioSourceNode = sourceNode;
    } else if (source.audioGainNode) {
      // Обновляем громкость
      source.audioGainNode.gain.value = src.volume / 100;
    }
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

// ---------- Рендеринг (с поддержкой фоновой активности) ----------
function startRendering() {
  stopRendering();
  if (document.hidden) {
    renderInterval = setInterval(renderFrame, 200); // 5 fps в фоне
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
  if (compositeCanvas.width !== stageWidth || compositeCanvas.height !== stageHeight) {
    compositeCanvas.width = stageWidth;
    compositeCanvas.height = stageHeight;
  }

  compositeCtx.clearRect(0, 0, stageWidth, stageHeight);

  for (let source of sources.values()) {
    const t = source.transform;
    const x = t.x;
    const y = t.y;
    const w = t.width;
    const h = t.height;

    compositeCtx.save();
    compositeCtx.translate(x + w/2, y + h/2);
    compositeCtx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
    compositeCtx.drawImage(source.video, -w/2, -h/2, w, h);
    compositeCtx.restore();
  }

  // Отправляем превью в менеджер
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 320;
  previewCanvas.height = 180;
  const previewCtx = previewCanvas.getContext('2d');
  previewCtx.drawImage(compositeCanvas, 0, 0, stageWidth, stageHeight, 0, 0, 320, 180);
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

// Следим за видимостью страницы
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
});