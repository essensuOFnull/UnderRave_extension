export function init() {
  // Функция обновления пункта меню
  function updatePipMenuItem(enabled) {
	chrome.contextMenus.removeAll(() => {
	  if (enabled) {
		chrome.contextMenus.create({
			id: 'enable-pip',
			title: 'Включить режим картинка в картинке для ближайшего видео',
			contexts: ['all']
		}, () => {
			if (chrome.runtime.lastError) {
				console.error('Ошибка создания меню:', chrome.runtime.lastError);
			}
		});
	  }
	});
  }

  // Инициализация при запуске
  chrome.storage.sync.get('pipMenuItemEnabled', (data) => {
	updatePipMenuItem(data.pipMenuItemEnabled !== false);
  });

  // Следим за изменениями
  chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'sync' && changes.pipMenuItemEnabled) {
	  updatePipMenuItem(changes.pipMenuItemEnabled.newValue !== false);
	}
  });

  // Обработчик клика по пункту меню
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