// Загрузка состояния переключателя
chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
  const checkbox = document.getElementById('forceContextMenuCheckbox');
  if (checkbox) {
    checkbox.checked = data.contextMenuAvailablerEnabled !== false;
  }
});

// Сохранение при изменении
document.getElementById('forceContextMenuCheckbox')?.addEventListener('change', (e) => {
  chrome.storage.sync.set({ contextMenuAvailablerEnabled: e.target.checked });
});