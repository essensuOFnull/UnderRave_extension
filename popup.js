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

// Данные каналов
const federalChannels = [
	{ name: 'Первый канал', url: 'https://www.1tv.ru/live' },
	{ name: 'Матч ТВ', url: 'https://matchtv.ru/video/channel/matchtv' },
	{ name: 'НТВ', url: 'https://www.ntv.ru/air/' },
	{ name: 'Пятый канал', url: 'https://www.5-tv.ru/online/' },
	{ name: 'Карусель', url: 'https://www.karusel-tv.ru/live' },
	{ name: 'ОТР', url: 'https://otr-online.ru/online/' },
	{ name: 'ТВ Центр', url: 'https://www.tvc.ru/live' }
];

const entertainmentChannels = [
	{ name: 'СТС', url: 'https://ctc.ru/online/' },
	{ name: 'ТНТ', url: 'https://tnt-online.ru/live' },
	{ name: 'РЕН ТВ', url: 'https://ren.tv/' },
	{ name: 'Домашний', url: 'https://domashniy.ru/online' },
	{ name: 'ТВ-3', url: 'https://tv3.ru/live' },
	{ name: 'Пятница', url: 'https://friday.ru/live' },
	{ name: 'Звезда', url: 'https://tvzvezda.ru/video' },
	{ name: 'МИР', url: 'https://mir24.tv/live' },
	{ name: 'Муз-ТВ', url: 'https://muz-tv.ru/online/' },
	{ name: 'Спас', url: 'https://spastv.ru/efir/' }
];

const miscChannels = [
	{ name: 'Москва 24', url: 'https://www.m24.ru/live' },
	{ name: 'РБК ТВ', url: 'https://tv.rbc.ru' },
	{ name: 'Известия', url: 'https://iz.ru/live' }
];

// Вспомогательная функция: получить домен из URL
function getDomainFromUrl(url) {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, ''); // убираем www
	} catch (e) {
		return url;
	}
}

// Функция для отрисовки карточек
function renderChannels(channelsArray, containerId) {
	const container = document.getElementById(containerId);
	if (!container) return;
	container.innerHTML = '';

	channelsArray.forEach(ch => {
		const domain = getDomainFromUrl(ch.url);
		const cardDiv = document.createElement('div');
		cardDiv.className = 'card';

		const link = document.createElement('a');
		link.href = ch.url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';

		const faviconDiv = document.createElement('div');
		faviconDiv.className = 'favicon';
		const img = document.createElement('img');
		img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
		img.alt = 'icon';
		img.onerror = function() { this.parentElement.innerHTML = '📺'; };
		faviconDiv.appendChild(img);

		const infoDiv = document.createElement('div');
		infoDiv.className = 'channel-info';
		const nameSpan = document.createElement('span');
		nameSpan.className = 'channel-name';
		nameSpan.textContent = ch.name;
		const urlSpan = document.createElement('span');
		urlSpan.className = 'channel-url';
		urlSpan.textContent = domain;

		infoDiv.appendChild(nameSpan);
		infoDiv.appendChild(urlSpan);

		link.appendChild(faviconDiv);
		link.appendChild(infoDiv);
		cardDiv.appendChild(link);
		container.appendChild(cardDiv);

		link.addEventListener('click', function(event) {
			event.preventDefault();
			chrome.runtime.sendMessage({ action: 'openFullscreen', url: ch.url });
		});
	});
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
	renderChannels(federalChannels, 'federal-grid');
	renderChannels(entertainmentChannels, 'entertain-grid');
	renderChannels(miscChannels, 'misc-grid');
});