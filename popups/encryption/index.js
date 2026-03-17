// Функция сохранения всех настроек
function saveSettings() {
    const encryptKey = document.getElementById('encryptKey').value;
    const decryptKey = document.getElementById('decryptKey').value;
    const encryptEnabled = document.getElementById('encryptEnabled').checked;
    const decryptEnabled = document.getElementById('decryptEnabled').checked;
    const protectInput = document.getElementById('protectInput').checked;

    chrome.storage.local.set({
        encryptKey,
        decryptKey: decryptKey || encryptKey,
        encryptEnabled,
        decryptEnabled,
        protectInput
    });
}

// Загрузка при старте
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['encryptKey', 'decryptKey', 'encryptEnabled', 'decryptEnabled', 'protectInput'], (result) => {
        document.getElementById('encryptKey').value = result.encryptKey || '';
        document.getElementById('decryptKey').value = result.decryptKey || '';
        document.getElementById('encryptEnabled').checked = result.encryptEnabled !== false;
        document.getElementById('decryptEnabled').checked = result.decryptEnabled !== false;
        document.getElementById('protectInput').checked = result.protectInput !== false; // по умолчанию true
    });

    // Добавляем обработчики
    document.getElementById('encryptKey').addEventListener('input', saveSettings);
    document.getElementById('decryptKey').addEventListener('input', saveSettings);
    document.getElementById('encryptEnabled').addEventListener('change', saveSettings);
    document.getElementById('decryptEnabled').addEventListener('change', saveSettings);
    document.getElementById('protectInput').addEventListener('change', saveSettings);
});