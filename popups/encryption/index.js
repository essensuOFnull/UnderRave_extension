// Загрузка сохранённых настроек
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['encryptKey', 'decryptKey', 'encryptEnabled', 'decryptEnabled'], (result) => {
        document.getElementById('encryptKey').value = result.encryptKey || '';
        document.getElementById('decryptKey').value = result.decryptKey || '';
        document.getElementById('encryptEnabled').checked = result.encryptEnabled !== false; // по умолчанию true
        document.getElementById('decryptEnabled').checked = result.decryptEnabled !== false;
    });
});

// Сохранение настроек
document.getElementById('saveSettings').addEventListener('click', () => {
    const encryptKey = document.getElementById('encryptKey').value;
    const decryptKey = document.getElementById('decryptKey').value;
    const encryptEnabled = document.getElementById('encryptEnabled').checked;
    const decryptEnabled = document.getElementById('decryptEnabled').checked;

    chrome.storage.local.set({
        encryptKey,
        decryptKey: decryptKey || encryptKey, // если пусто, использовать ключ шифрования
        encryptEnabled,
        decryptEnabled
    }, () => {
        alert('Настройки сохранены');
    });
});