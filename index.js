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
// Обработка сообщений от iframe
window.addEventListener('message', (event) => {
    if (event.data.action === 'enterFullWindow') {
        document.body.classList.add('fullscreen-mode');
    }else if (event.data.action === 'exitFullWindow') {
        document.body.classList.remove('fullscreen-mode');
    }
});