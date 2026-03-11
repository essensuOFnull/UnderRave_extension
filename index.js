// --- Переключение вкладок ---
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        // Деактивируем все кнопки и контент
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Активируем выбранное
        button.classList.add('active');
        const tabId = button.dataset.tab;
        document.getElementById(tabId).classList.add('active');
    });
});