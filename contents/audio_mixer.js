// content.js – выполняется на всех страницах с самого начала
(function() {
    if (window.__desktopCaptureInjected) return;
    window.__desktopCaptureInjected = true;

    console.log('[DesktopCapture] Content script loaded');

    let desktopAudioStream = null;
    let streamEnded = false;

    // Переопределяем getUserMedia сразу
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function(constraints) {
        console.log('[DesktopCapture] Intercepted getUserMedia', constraints);

        // Если есть десктопный аудиопоток и запрашивается аудио
        if (constraints && constraints.audio && desktopAudioStream && !streamEnded) {
            const audioTracks = desktopAudioStream.getAudioTracks().map(t => t.clone());
            
            // Если запрашивается и видео
            if (constraints.video) {
                try {
                    const videoStream = await originalGetUserMedia({ ...constraints, audio: false });
                    const combined = new MediaStream([
                        ...videoStream.getVideoTracks(),
                        ...audioTracks
                    ]);
                    console.log('[DesktopCapture] Returning combined stream');
                    return combined;
                } catch (e) {
                    console.warn('[DesktopCapture] Failed to get video, returning only audio', e);
                    return new MediaStream(audioTracks);
                }
            } else {
                console.log('[DesktopCapture] Returning desktop audio stream');
                return new MediaStream(audioTracks);
            }
        }

        return originalGetUserMedia(constraints);
    };

    // Патчим устаревший navigator.getUserMedia
    if (navigator.getUserMedia) {
        navigator.getUserMedia = function(constraints, success, error) {
            navigator.mediaDevices.getUserMedia(constraints).then(success).catch(error);
        };
    }

    // Слушаем команды из background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'start-desktop-audio') {
            console.log('[DesktopCapture] Received start-desktop-audio');
            if (desktopAudioStream) {
                // Уже есть поток, просто сообщаем
                sendResponse({ status: 'already-running' });
                return;
            }

            navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
                .then(stream => {
                    stream.getVideoTracks().forEach(t => t.stop());
                    const audioTracks = stream.getAudioTracks();
                    if (audioTracks.length === 0) {
                        throw new Error('No audio tracks');
                    }
                    desktopAudioStream = new MediaStream(audioTracks.map(t => t.clone()));
                    
                    audioTracks.forEach(t => {
                        t.addEventListener('ended', () => {
                            console.log('[DesktopCapture] Desktop capture stopped by user');
                            streamEnded = true;
                            desktopAudioStream = null;
                        });
                    });

                    console.log('[DesktopCapture] Desktop audio stream ready');
                    sendResponse({ status: 'success' });
                })
                .catch(err => {
                    console.error('[DesktopCapture] Failed to get display media:', err);
                    sendResponse({ status: 'error', error: err.message });
                });
            return true; // асинхронный ответ
        }
    });
})();