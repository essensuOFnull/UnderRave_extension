// Список всех настроек модуля
const settings = [
    'removeDisablePictureInPicture',
    'removeControlsList',
    'removeDisableRemotePlayback',
    'removeContextMenuBlock',
    'removeXWebkitAirplay'
];

// Загрузка состояний
chrome.storage.sync.get(settings, (data) => {
    settings.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            // По умолчанию все опции включены (true), если не задано иное
            checkbox.checked = data[id] !== false;
        }
    });
});

// Сохранение при изменении
settings.forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
        chrome.storage.sync.set({ [id]: e.target.checked });
    });
});