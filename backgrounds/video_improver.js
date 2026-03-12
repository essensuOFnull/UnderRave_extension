export function init() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'enable-pip',
      title: 'Включить режим картинка в картинке для ближайшего видео',
      contexts: ['all']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка создания меню:', chrome.runtime.lastError);
      }
    });
  });

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