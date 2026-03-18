import * as tv from './backgrounds/tv.js';
import * as video_improver from './backgrounds/video_improver.js';
import * as context_menu_availabler from './backgrounds/context_menu_availabler.js';
import * as media_mixer from './backgrounds/media_mixer.js';
import * as layout_swapper from './backgrounds/layout_swapper.js';

async function loadInitialConfig() {
	try {
		const response = await fetch(chrome.runtime.getURL('initial_config.json'));
		return await response.json();
	} catch (e) {
		console.error('Failed to load initial config', e);
	}
}

chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason === 'install') {
		const initialConfig = await loadInitialConfig();
		chrome.storage.sync.clear(); // очищаем предыдущие настройки
		chrome.storage.sync.set(initialConfig);
	}
	// При обновлении можно ничего не делать, либо добавить новые ключи
});

video_improver.init();
context_menu_availabler.init();
media_mixer.init();
layout_swapper.init();
/**/
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'openFullscreen') {
		tv.handleTV(message.url);
	}
});
chrome.action.onClicked.addListener(() => {
	chrome.tabs.create({
		url: "./popups/features/index.html",
	});
});