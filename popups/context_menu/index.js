// Загрузка состояния переключателей
chrome.storage.sync.get(['contextMenuAvailablerEnabled', 'pipMenuItemEnabled'], (data) => {
  const forceCheckbox = document.getElementById('forceContextMenuCheckbox');
  if (forceCheckbox) {
    forceCheckbox.checked = data.contextMenuAvailablerEnabled !== false;
  }

  const pipCheckbox = document.getElementById('pipMenuItemCheckbox');
  if (pipCheckbox) {
    pipCheckbox.checked = data.pipMenuItemEnabled !== false; // по умолчанию включено
  }
});

// Сохранение при изменении
document.getElementById('forceContextMenuCheckbox')?.addEventListener('change', (e) => {
  chrome.storage.sync.set({ contextMenuAvailablerEnabled: e.target.checked });
});

document.getElementById('pipMenuItemCheckbox')?.addEventListener('change', (e) => {
  chrome.storage.sync.set({ pipMenuItemEnabled: e.target.checked });
});