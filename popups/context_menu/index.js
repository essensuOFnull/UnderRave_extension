// Загрузка состояния переключателей
chrome.storage.sync.get(['enableDefaultContextMenu','enableSiteContextMenu', 'enablePictureInPicture'], (data) => {
  const enableDefaultContextMenuCheckbox = document.getElementById('enableDefaultContextMenuCheckbox');
  if (enableDefaultContextMenuCheckbox) {
    enableDefaultContextMenuCheckbox.checked = data.enableDefaultContextMenu!==false;
  }
  const enableSiteContextMenuCheckbox = document.getElementById('enableSiteContextMenuCheckbox');
  if (enableSiteContextMenuCheckbox) {
    enableSiteContextMenuCheckbox.checked = data.enableSiteContextMenu!==false;
  }
  const enablePictureInPictureCheckbox = document.getElementById('enablePictureInPictureCheckbox');
  if (enablePictureInPictureCheckbox) {
    enablePictureInPictureCheckbox.checked = data.enablePictureInPicture!==false;
  }
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