// Список всех настроек модуля
const settings = [
    'enablePictureInPicture',
    'enableControlsList',
    'enableRemotePlayback',
    'enableXWebkitAirplay'
];

// Загрузка состояний
chrome.storage.sync.get(settings, (data) => {
    settings.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = data[id]!==false;
        }
    });
});

// Сохранение при изменении
settings.forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
        chrome.storage.sync.set({ [id]: e.target.checked });
    });
});