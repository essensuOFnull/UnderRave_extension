(function() {
	window.lastContextMenuTarget = null;
	window.forceContextMenuEnabled = false;
	window.lastContextMenuEvent = null;

	function handleContextMenu(e) {
		window.lastContextMenuTarget = e.target;
		window.lastContextMenuEvent = e;
		console.log('contextmenu target saved', e.target);
		// Если это наше специальное событие для вызова оригинального меню – пропускаем без блокировки
		if (e.isExtensionForcedOriginal) {
			return; // не мешаем событию идти дальше
		}
		if (window.forceContextMenuEnabled) {
			e.stopImmediatePropagation();
		}
	}

	window.addEventListener('contextmenu', handleContextMenu, true);

	chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
		window.forceContextMenuEnabled = data.contextMenuAvailablerEnabled !== false;
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'sync' && changes.contextMenuAvailablerEnabled) {
		window.forceContextMenuEnabled = changes.contextMenuAvailablerEnabled.newValue !== false;
		}
	});

	// Слушаем команду от background
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === 'showOriginalContextMenu') {
		// Определяем элемент, на котором показывать меню (используем последний сохранённый)
		const target = window.lastContextMenuTarget || document.body;
		const lastEvent = window.lastContextMenuEvent;

		// Создаём новое событие контекстного меню с координатами из сохранённого события
		const options = {
			bubbles: true,
			cancelable: true,
			button: 2, // правая кнопка
			buttons: 2
		};
		if (lastEvent) {
			options.clientX = lastEvent.clientX;
			options.clientY = lastEvent.clientY;
			options.screenX = lastEvent.screenX;
			options.screenY = lastEvent.screenY;
		}

		const newEvent = new MouseEvent('contextmenu', options);

		// Устанавливаем флаг, чтобы наша блокировка не сработала на это событие
		newEvent.isExtensionForcedOriginal = true;

		// Диспатчим событие на сохранённый элемент
		target.dispatchEvent(newEvent);
		}
	});
})();