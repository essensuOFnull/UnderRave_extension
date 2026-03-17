export function init() {
    let listenerAdded = false; // флаг, чтобы не добавлять обработчик повторно

    // Сохраняем ссылку на обработчик
    const contextMenuListener = (info, tab) => {
        if (info.menuItemId === 'show-original-contextmenu') {
            if (!tab?.id) return;
            chrome.tabs.sendMessage(
                tab.id,
                { action: 'showOriginalContextMenu' },
                { frameId: info.frameId }
            ).catch(err => {
                console.warn('Не удалось отправить сообщение для оригинального меню:', err);
            });
        }
    };

    function updateMenu() {
        chrome.storage.sync.get('enableSiteContextMenu', (data) => {
            if (data.enableSiteContextMenu !== false) {
                // Пункт для показа оригинального меню сайта
                chrome.contextMenus.create({
                    id: 'show-original-contextmenu',
                    title: 'Показать оригинальное меню сайта',
                    contexts: ['all']
                }, () => {
                    if (chrome.runtime.lastError) {
                        // пункт уже существует – игнорируем
                    }
                });

                // Добавляем обработчик, если ещё не добавлен
                if (!listenerAdded) {
                    chrome.contextMenus.onClicked.addListener(contextMenuListener);
                    listenerAdded = true;
                }
            } else {
                try {
                    chrome.contextMenus.remove('show-original-contextmenu');
                } catch {
                    // меню уже отсутствует
                }

                // Удаляем обработчик, если он был добавлен
                if (listenerAdded) {
                    chrome.contextMenus.onClicked.removeListener(contextMenuListener);
                    listenerAdded = false;
                }
            }
        });
    }

    updateMenu();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.enableSiteContextMenu) {
            updateMenu();
        }
    });
}