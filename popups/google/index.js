const settings = ['googleFullscreenImage', 'googleHideExtraElements', 'googleOpenImageDirectly'];

// Загрузка текущих значений
chrome.storage.sync.get(settings, (data) => {
    settings.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = data[id] !== false; // по умолчанию true
        }
    });
});

// Сохранение при изменении
settings.forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
        chrome.storage.sync.set({ [id]: e.target.checked });
    });
});