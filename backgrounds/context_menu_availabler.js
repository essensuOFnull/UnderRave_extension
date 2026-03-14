export function init() {
	chrome.runtime.onInstalled.addListener(() => {
		chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
			if (data.contextMenuAvailablerEnabled === undefined) {
				chrome.storage.sync.set({ contextMenuAvailablerEnabled: true });
			}
		});
	});
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
	chrome.contextMenus.onClicked.addListener((info, tab) => {
			if (info.menuItemId === 'show-original-contextmenu') {
					if (!tab?.id) return;
					chrome.tabs.sendMessage(
							tab.id,
							{ action: 'showOriginalContextMenu' },
							{ frameId: info.frameId } // отправляем в тот же фрейм, где был клик
					).catch(err => {
							console.warn('Не удалось отправить сообщение для оригинального меню:', err);
					});
			}
	});
}