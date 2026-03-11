import * as tv from './modules/tv.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openFullscreen') {
        tv.handleTV(message.url);
    }
});