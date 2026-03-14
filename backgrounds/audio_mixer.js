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
            chrome.tabs.sendMessage(tab.id, { action: 'start-desktop-audio' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Content script not available:', chrome.runtime.lastError);
                } else {
                    console.log('Content script response:', response);
                }
            });
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