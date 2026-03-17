import * as tv from './backgrounds/tv.js';
import * as video_improver from './backgrounds/video_improver.js';
import * as context_menu_availabler from './backgrounds/context_menu_availabler.js';
import * as media_mixer from './backgrounds/media_mixer.js';
/*инициализация частей расширения*/
video_improver.init();
context_menu_availabler.init();
media_mixer.init();
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