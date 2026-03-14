let mixerTabId = null;

export function init() {
    // Контекстное меню (как было с getDisplayMedia)
    chrome.contextMenus.remove('replace-mic-with-desktop', () => {});
    chrome.contextMenus.create({
        id: 'replace-mic-with-desktop',
        title: 'Заменить микрофон на трансляцию',
        contexts: ['all']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'replace-mic-with-desktop') {
            chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                world: 'MAIN',
                func: injectMainScriptWithGetDisplayMedia,
                args: []
            }).catch(err => console.error('Ошибка внедрения скрипта:', err));
        }
    });

    // Регистрация вкладки микшера
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'registerMixerTab') {
            if (sender.tab) {
                mixerTabId = sender.tab.id;
                console.log('Mixer tab registered:', mixerTabId);
                sendResponse({ ok: true });
            } else {
                sendResponse({ ok: false });
            }
        }
        // Другие сообщения не нужны
    });
}

// Новая функция, внедряемая в целевую страницу – использует getDisplayMedia
function injectMainScriptWithGetDisplayMedia() {
    if (window.__desktopCaptureReplaced) return;
    window.__desktopCaptureReplaced = true;

    console.log('[DesktopAudio] Starting desktop capture replacement');

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let desktopAudioStream = null;
    let streamEnded = false;

    // Запрашиваем трансляцию с аудио и видео (видео потом отключим)
    navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
        .then(stream => {
            console.log('[DesktopAudio] getDisplayMedia success', stream);

            // Останавливаем видеодорожки, они не нужны
            stream.getVideoTracks().forEach(track => {
                track.stop();
                console.log('[DesktopAudio] Video track stopped:', track.label);
            });

            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.warn('[DesktopAudio] No audio tracks in selected source');
                return;
            }

            // Клонируем аудиодорожки для долговременного использования
            desktopAudioStream = new MediaStream(audioTracks.map(t => t.clone()));
            console.log('[DesktopAudio] Desktop audio tracks:', audioTracks.map(t => t.label));

            // Следим за остановкой трансляции пользователем
            audioTracks.forEach(track => {
                track.addEventListener('ended', () => {
                    console.log('[DesktopAudio] Desktop capture stopped by user');
                    streamEnded = true;
                    desktopAudioStream = null;
                });
            });

            // Переопределяем getUserMedia
            navigator.mediaDevices.getUserMedia = async function(constraints) {
                console.log('[DesktopAudio] Intercepted getUserMedia with constraints:', constraints);

                // Если запрашивается аудио и у нас есть десктопный поток
                if (constraints && constraints.audio && desktopAudioStream && !streamEnded) {
                    // Если также запрашивается видео
                    if (constraints.video) {
                        try {
                            // Запрашиваем только видео через оригинальный метод
                            const videoConstraints = { ...constraints, audio: false };
                            const videoStream = await originalGetUserMedia(videoConstraints);
                            // Комбинируем: видео из videoStream, аудио из нашего потока
                            const combinedTracks = [
                                ...videoStream.getVideoTracks(),
                                ...desktopAudioStream.getAudioTracks().map(t => t.clone())
                            ];
                            console.log('[DesktopAudio] Returning combined stream (video + desktop audio)');
                            return new MediaStream(combinedTracks);
                        } catch (e) {
                            console.warn('[DesktopAudio] Failed to get video, returning only desktop audio', e);
                            return new MediaStream(desktopAudioStream.getAudioTracks().map(t => t.clone()));
                        }
                    } else {
                        // Только аудио
                        console.log('[DesktopAudio] Returning desktop audio stream');
                        return new MediaStream(desktopAudioStream.getAudioTracks().map(t => t.clone()));
                    }
                }

                // Если нет десктопного аудио или запрос не содержит audio, идём по стандартному пути
                console.log('[DesktopAudio] Falling back to original getUserMedia');
                return originalGetUserMedia(constraints);
            };

            console.log('[DesktopAudio] getUserMedia successfully overridden');
        })
        .catch(err => {
            console.error('[DesktopAudio] getDisplayMedia failed or cancelled:', err);
            window.__desktopCaptureReplaced = false;
        });

    // Также переопределяем устаревший navigator.getUserMedia для совместимости
    if (navigator.getUserMedia) {
        const originalLegacy = navigator.getUserMedia.bind(navigator);
        navigator.getUserMedia = function(constraints, successCallback, errorCallback) {
            navigator.mediaDevices.getUserMedia(constraints)
                .then(successCallback)
                .catch(errorCallback);
        };
        console.log('[DesktopAudio] Legacy getUserMedia patched');
    }
}