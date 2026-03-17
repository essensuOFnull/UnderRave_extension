export function init() {
  let listenerAdded = false; // флаг, чтобы не добавлять обработчик повторно

  // Сохраняем ссылку на обработчик
  const contextMenuListener = (info, tab) => {
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
  };

  function updatePipMenuItem(enabled) {
    if (enabled) {
      // Создаём пункт меню
      chrome.contextMenus.create({
        id: 'enable-pip',
        title: 'Включить режим картинка в картинке для ближайшего видео',
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
      // Удаляем пункт меню
      chrome.contextMenus.remove('enable-pip', () => {
        if (chrome.runtime.lastError) {
          // пункт не существует – игнорируем
        }
      });

      // Удаляем обработчик, если он был добавлен
      if (listenerAdded) {
        chrome.contextMenus.onClicked.removeListener(contextMenuListener);
        listenerAdded = false;
      }
    }
  }

  // Инициализация при загрузке
  chrome.storage.sync.get('enablePictureInPicture', (data) => {
    updatePipMenuItem(data.enablePictureInPicture !== false);
  });

  // Следим за изменениями в хранилище
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.enablePictureInPicture) {
      updatePipMenuItem(changes.enablePictureInPicture.newValue);
    }
  });
}