(function() {
	// === Модуль принудительного контекстного меню ===
	let contextMenuHandler = null;

	function enableContextMenuAvailabler(enable) {
	if (enable) {
		if (!contextMenuHandler) {
		contextMenuHandler = (e) => {
			// Прерываем дальнейшую обработку события сайтом, но не отменяем стандартное меню
			e.stopImmediatePropagation();
			// Не вызываем preventDefault!
		};
		window.addEventListener('contextmenu', contextMenuHandler, true); // capture
		console.log('Context menu avalabler enabled');
		}
	} else {
		if (contextMenuHandler) {
		window.removeEventListener('contextmenu', contextMenuHandler, true);
		contextMenuHandler = null;
		console.log('Context menu avalabler disabled');
		}
	}
	}

	// Инициализация при загрузке страницы
	chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
	enableContextMenuAvailabler(data.contextMenuAvailablerEnabled !== false);
	});

	// Слушаем изменения настройки
	chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && changes.contextMenuAvailablerEnabled) {
		enableContextMenuAvailabler(changes.contextMenuAvailablerEnabled.newValue !== false);
	}
	});
	// ==============================================

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

  let lastContextMenuTarget = null;

  // Запоминаем элемент при каждом правом клике (даже если не блокируем меню)
  document.addEventListener('contextmenu', (e) => {
    lastContextMenuTarget = e.target;
    console.log('contextmenu target saved', e.target);
  }, true);

  // Обработка сообщения от фонового скрипта
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