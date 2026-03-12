export function init() {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
      if (data.contextMenuAvailablerEnabled === undefined) {
        chrome.storage.sync.set({ contextMenuAvailablerEnabled: true });
      }
    });
  });
}