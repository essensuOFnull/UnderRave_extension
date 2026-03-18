// Загрузка состояния переключателей
chrome.storage.sync.get(['enableDefaultContextMenu','enableSiteContextMenu', 'enablePictureInPicture','enableLayoutSwap'], (data) => {
	document.getElementById('enableDefaultContextMenuCheckbox').checked = data.enableDefaultContextMenu !== false;
	document.getElementById('enableSiteContextMenuCheckbox').checked = data.enableSiteContextMenu !== false;
	document.getElementById('enablePictureInPictureCheckbox').checked = data.enablePictureInPicture !== false;
	document.getElementById('enableLayoutSwapCheckbox').checked = data.enableLayoutSwap !== false;
});

// Сохранение при изменении
document.getElementById('enableDefaultContextMenuCheckbox')?.addEventListener('change', (e) => {
	chrome.storage.sync.set({ enableDefaultContextMenu: e.target.checked });
});
document.getElementById('enableSiteContextMenuCheckbox')?.addEventListener('change', (e) => {
	chrome.storage.sync.set({ enableSiteContextMenu: e.target.checked });
});
document.getElementById('enablePictureInPictureCheckbox')?.addEventListener('change', (e) => {
	chrome.storage.sync.set({ enablePictureInPicture: e.target.checked });
});
document.getElementById('enableLayoutSwapCheckbox')?.addEventListener('change', (e) => {
		chrome.storage.sync.set({ enableLayoutSwap: e.target.checked });
});