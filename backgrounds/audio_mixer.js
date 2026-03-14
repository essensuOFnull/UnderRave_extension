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

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let desktopAudioTracks = [];
    let streamEnded = false;

    navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
        .then(stream => {
            // Оставляем только аудио, видео останавливаем
            desktopAudioTracks = stream.getAudioTracks();
            stream.getVideoTracks().forEach(track => track.stop());

            if (desktopAudioTracks.length === 0) {
                console.warn('No audio tracks in selected source');
                return;
            }

            desktopAudioTracks.forEach(track => {
                track.addEventListener('ended', () => {
                    console.log('Desktop capture stopped by user');
                    streamEnded = true;
                });
            });

            navigator.mediaDevices.getUserMedia = async function(constraints) {
                if (constraints && constraints.audio && !streamEnded && desktopAudioTracks.length > 0) {
                    try {
                        const clonedTracks = desktopAudioTracks.map(track => track.clone());
                        return new MediaStream(clonedTracks);
                    } catch (e) {
                        console.warn('Failed to clone audio tracks, fallback to original', e);
                        return originalGetUserMedia(constraints);
                    }
                }
                return originalGetUserMedia(constraints);
            };
        })
        .catch(err => {
            console.error('getDisplayMedia failed or cancelled:', err);
            window.__desktopCaptureReplaced = false;
        });
}