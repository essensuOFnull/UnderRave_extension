// content/context_menu.js
(function() {
  window.lastContextMenuTarget = null;
  window.forceContextMenuEnabled = false;

  function handleContextMenu(e) {
    window.lastContextMenuTarget = e.target;
    console.log('contextmenu target saved', e.target);
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
})();