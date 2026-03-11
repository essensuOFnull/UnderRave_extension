// Функция открытия вкладки и внедрения скрипта
export async function handleTV(url) {
	try {
		const tab = await chrome.tabs.create({ url: url, active: true });
		console.log('Вкладка создана, ID:', tab.id);

		// Слушаем полную загрузку
		const listener = (tabId, changeInfo) => {
		if (tabId === tab.id && changeInfo.status === 'complete') {
			console.log('Событие complete для вкладки', tabId);
			chrome.tabs.onUpdated.removeListener(listener);

			chrome.scripting.insertCSS({
				target: { tabId: tab.id },
				css: `
				* {
					all: unset !important;
					box-sizing: border-box !important;
				}
				/* Скрываем полосы прокрутки (для WebKit) – дополнительная мера */
				::-webkit-scrollbar {
					display: none !important;
					width: 0 !important;
					height: 0 !important;
				}
				iframe, video {
					position: fixed !important;
					top: 0 !important;
					left: 0 !important;
					width: 100vw !important;
					height: 100vh !important;
					object-fit: contain !important;
					margin: 0 !important;
					padding: 0 !important;
					border: none !important;
					outline: none !important;
					box-shadow: none !important;
					overflow: hidden !important;
					z-index:2147483647 !important;
				}
				html,body{
					overflow: hidden !important;
				}
				`
			})
			.then(() => console.log('CSS внедрён'))
			.catch(err => console.error('Ошибка внедрения CSS после complete:', err));
			// Внедряем скрипт-наблюдатель с поддержкой controls и PiP
			chrome.scripting.executeScript({
				target: { tabId: tab.id },
				func: () => {
					const makeFullscreen = () => {
						document.querySelectorAll('iframe, video').forEach(el => {

							// Дополнительные настройки для видео
							if (el.tagName === 'VIDEO') {
								// Включаем стандартные элементы управления
								el.playsinline=true;
								el.controls = true;
								el.disabled=false;
							}
						});
					};

					// Первоначальный запуск
					makeFullscreen();

					// Наблюдаем за изменениями в DOM, чтобы применять стили и настройки к новым элементам
					const observer = new MutationObserver(makeFullscreen);
					observer.observe(document.body, { childList: true, subtree: true });
				}
			})
			.then(() => console.log('Скрипт выполнен'))
			.catch(err => console.error('Ошибка внедрения скрипта:', err));
		}
		};
		chrome.tabs.onUpdated.addListener(listener);
	} catch (error) {
		console.error('Ошибка при открытии вкладки:', error);
	}
}