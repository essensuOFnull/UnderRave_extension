let mixerTabId = null;
let currentCaptureStreamId = null;

export function init() {
    chrome.contextMenus.create({
        id: 'capture-mixer-result',
        title: 'Захватить результат микширования (аудио)',
        contexts: ['all']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'capture-mixer-result') {
            chrome.desktopCapture.chooseDesktopMedia(['tab', 'audio'], (streamId) => {
                if (!chrome.runtime.lastError && streamId) {
                    currentCaptureStreamId = streamId;
                    console.log('StreamId для захвата сохранён:', streamId);
                } else {
                    console.error('Ошибка выбора источника:', chrome.runtime.lastError);
                }
            });
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'registerMixerTab') {
            mixerTabId = message.tabId;
            console.log('Зарегистрирована вкладка микшера:', mixerTabId);
            sendResponse({ ok: true });
        } else if (message.action === 'getMixerTabStreamId') {
            if (!mixerTabId) {
                console.warn('Микшер не зарегистрирован');
                sendResponse({ streamId: null });
                return;
            }
            chrome.tabCapture.getMediaStreamId({ targetTabId: mixerTabId }, (streamId) => {
                if (chrome.runtime.lastError) {
                    console.error('Ошибка получения streamId:', chrome.runtime.lastError);
                    sendResponse({ streamId: null });
                } else {
                    console.log('Получен streamId для вкладки микшера:', streamId);
                    sendResponse({ streamId: streamId || null });
                }
            });
            return true;
        } else if (message.action === 'getCurrentCaptureStreamId') {
            sendResponse({ streamId: currentCaptureStreamId });
        }
    });
}