export function init() {
  function updatePipMenuItem(enabled) {
    if (enabled) {
      chrome.contextMenus.create({
        id: 'enable-pip',
        title: 'Включить режим картинка в картинке для ближайшего видео',
        contexts: ['all']
      }, () => {
        if (chrome.runtime.lastError) {
          // Пункт уже существует – игнорируем
        }
      });
    } else {
      chrome.contextMenus.remove('enable-pip', () => {
        if (chrome.runtime.lastError) {
          // Пункт не существует – игнорируем
        }
      });
    }
  }

  chrome.storage.sync.get('pipMenuItemEnabled', (data) => {
    updatePipMenuItem(data.pipMenuItemEnabled !== false);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.pipMenuItemEnabled) {
      updatePipMenuItem(changes.pipMenuItemEnabled.newValue !== false);
    }
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'enable-pip') {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'enablePip' },
        { frameId: info.frameId }
      ).catch(err => {
        console.warn('Не удалось отправить сообщение в контентный скрипт:', err);
      });
    }
  });
}