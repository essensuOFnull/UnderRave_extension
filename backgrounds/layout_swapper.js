export function init() {
    let listenerAdded = false;

    const contextMenuListener = (info, tab) => {
        if (info.menuItemId === 'swap-layout') {
            if (!tab?.id) return;
            chrome.tabs.sendMessage(tab.id, { action: 'swapLayout' }, { frameId: info.frameId })
                .catch(err => console.warn('Не удалось отправить сообщение для смены раскладки:', err));
        }
    };

    function updateMenuItem(enabled) {
        if (enabled) {
            chrome.contextMenus.create({
                id: 'swap-layout',
                title: 'Поменять раскладку',
                contexts: ['selection']
            }, () => chrome.runtime.lastError && null);

            if (!listenerAdded) {
                chrome.contextMenus.onClicked.addListener(contextMenuListener);
                listenerAdded = true;
            }
        } else {
            chrome.contextMenus.remove('swap-layout', () => chrome.runtime.lastError && null);
            if (listenerAdded) {
                chrome.contextMenus.onClicked.removeListener(contextMenuListener);
                listenerAdded = false;
            }
        }
    }

    chrome.storage.sync.get('enableLayoutSwap', (data) => {
        updateMenuItem(data.enableLayoutSwap !== false);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.enableLayoutSwap) {
            updateMenuItem(changes.enableLayoutSwap.newValue);
        }
    });
}