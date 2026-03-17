// viewer.js – окно просмотра

let managerPort = null;
let sources = new Map(); // sourceId -> { stream, video, width, height, transform }
let compositeCanvas = document.getElementById('composite-canvas');
let compositeCtx = compositeCanvas.getContext('2d');
let animationFrame = null;
let stageWidth = 1920;
let stageHeight = 1080;

managerPort = chrome.runtime.connect({ name: 'viewer' });
managerPort.onDisconnect.addListener(() => {
    console.log('Disconnected from manager');
    window.close();
});
managerPort.onMessage.addListener(handleManagerMessage);
managerPort.postMessage({ type: 'VIEWER_READY' });
function reorderSources(order) {
    // Создаём новую Map в нужном порядке
    const newSources = new Map();
    order.forEach(id => {
        if (sources.has(id)) {
            newSources.set(id, sources.get(id));
        }
    });
    // Добавляем оставшиеся (на случай рассинхронизации)
    sources.forEach((value, id) => {
        if (!newSources.has(id)) {
            newSources.set(id, value);
        }
    });
    sources = newSources;
}
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
        default:
            console.log('Unknown message from manager:', msg);
    }
}

async function captureSource(sourceId, sourceType, initialTransform) {
    try {
        let stream;
        if (sourceType === 'screen') {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false  // аудио захватывается отдельно в manager
            });
        } else if (sourceType === 'camera') {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } else {
            throw new Error('Unknown source type');
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

        sources.set(sourceId, {
            stream,
            video,
            width,
            height,
            transform: initialTransform || { x: 0, y: 0, width, height, flipX: false, flipY: false }
        });

        managerPort.postMessage({ type: 'SOURCE_CAPTURED', sourceId, width, height });

        if (!animationFrame) {
            renderLoop();
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
        source.stream.getTracks().forEach(t => t.stop());
        sources.delete(sourceId);
    }
    if (sources.size === 0 && animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function updateTransform(sourceId, transform) {
    const source = sources.get(sourceId);
    if (source) {
        source.transform = transform;
    }
}

function renderLoop() {
    if (compositeCanvas.width !== stageWidth || compositeCanvas.height !== stageHeight) {
        compositeCanvas.width = stageWidth;
        compositeCanvas.height = stageHeight;
    }

    compositeCtx.clearRect(0, 0, stageWidth, stageHeight);

    for (let [sourceId, source] of sources) {
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

    // Отправляем превью (уменьшенное)
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

    animationFrame = requestAnimationFrame(renderLoop);
}

window.addEventListener('beforeunload', () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    sources.forEach(source => source.stream.getTracks().forEach(t => t.stop()));
});