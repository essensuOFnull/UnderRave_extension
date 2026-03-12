(function() {
  let lastContextMenuTarget = null;
  let forceContextMenuEnabled = false; // будет прочитано из storage

  // Единый обработчик контекстного меню на window в фазе захвата
  function handleContextMenu(e) {
    // Всегда запоминаем элемент, на котором кликнули
    lastContextMenuTarget = e.target;
    console.log('contextmenu target saved', e.target);

    // Если включена опция принудительного меню – блокируем дальнейшие обработчики сайта
    if (forceContextMenuEnabled) {
      e.stopImmediatePropagation();
      // Не вызываем preventDefault, чтобы стандартное меню появилось
    }
  }

  // Добавляем обработчик (сработает самым первым)
  window.addEventListener('contextmenu', handleContextMenu, true);

  // Читаем настройку из storage
  chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
    forceContextMenuEnabled = data.contextMenuAvailablerEnabled !== false;
  });

  // Следим за изменениями настройки
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.contextMenuAvailablerEnabled) {
      forceContextMenuEnabled = changes.contextMenuAvailablerEnabled.newValue !== false;
    }
  });

  // Глубокий поиск видео с учётом Shadow DOM
  function findNearestVideo(element) {
    function searchShadow(node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
        const video = node.shadowRoot.querySelector('video');
        if (video) return video;
        for (const child of node.shadowRoot.children) {
          const found = searchShadow(child);
          if (found) return found;
        }
      }
      return null;
    }

    let el = element;
    while (el) {
      if (el.tagName === 'VIDEO') return el;
      const videoInside = el.querySelector('video');
      if (videoInside) return videoInside;
      if (el.shadowRoot) {
        const videoInShadow = el.shadowRoot.querySelector('video');
        if (videoInShadow) return videoInShadow;
        for (const child of el.shadowRoot.children) {
          const found = searchShadow(child);
          if (found) return found;
        }
      }
      el = el.parentElement || el.getRootNode()?.host;
    }
    return null;
  }

  // Обработка сообщения от фонового скрипта (клик по пункту PiP)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enablePip') {
      if (!lastContextMenuTarget) {
        console.warn('No context menu target saved');
        return;
      }
      const video = findNearestVideo(lastContextMenuTarget);
      if (video && !video.disablePictureInPicture) {
        video.requestPictureInPicture().catch(err => {
          console.error('PiP error:', err);
          alert('Не удалось включить режим PiP для этого видео.');
        });
      } else {
        alert('Видео не найдено или не поддерживает PiP.');
      }
    }
  });

  console.log('🎯 Content script loaded');
})();