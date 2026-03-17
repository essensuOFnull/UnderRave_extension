(function() {
    window.extensionConfig = {};

    // Загрузка значений по умолчанию из JSON
    async function loadDefaultConfig() {
        try {
            const response = await fetch(chrome.runtime.getURL('initial_config.json'));
            const defaults = await response.json();
            for (let key in defaults) {
                if (!(key in window.extensionConfig)) {
                    window.extensionConfig[key] = defaults[key];
                }
            }
			window.dispatchEvent(new Event('extensionConfigDefaultsLoaded'));
        } catch (e) {
            console.error('Failed to load default config, using hardcoded fallback', e);
        }
    }

    loadDefaultConfig();

    // Загрузка сохранённых настроек из storage
    chrome.storage.sync.get(null, (data) => {
        for (let key in data) {
            window.extensionConfig[key] = data[key];
        }
        window.dispatchEvent(new Event('extensionConfigReady'));
    });

    // Отслеживание изменений
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            for (let key in changes) {
                window.extensionConfig[key] = changes[key].newValue;
            }
            window.dispatchEvent(new CustomEvent('extensionConfigChanged', { detail: changes }));
        }
    });
})();