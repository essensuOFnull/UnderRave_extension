let mixerTabId = null;

export function init() {
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