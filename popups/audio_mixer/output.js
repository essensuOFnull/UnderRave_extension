(async () => {
    const video = document.getElementById('output-video');

    // Получаем ID текущей вкладки (output)
    const consumerTab = await new Promise(resolve => chrome.tabs.getCurrent(resolve));
    if (!consumerTab) {
        console.error('Не удалось получить ID текущей вкладки');
        return;
    }
    const consumerTabId = consumerTab.id;

    async function getStreamIdWithRetry(maxAttempts = 5, delay = 500) {
        for (let i = 0; i < maxAttempts; i++) {
            const response = await chrome.runtime.sendMessage({ 
                action: 'getMixerTabStreamId',
                consumerTabId: consumerTabId 
            });
            if (response?.streamId) return response.streamId;
            await new Promise(r => setTimeout(r, delay));
        }
        return null;
    }

    const streamId = await getStreamIdWithRetry();
    if (!streamId) {
        console.error('Не удалось получить streamId для микшера после нескольких попыток');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        });
        video.srcObject = stream;
        console.log('Аудиопоток из микшера захвачен');
    } catch (e) {
        console.error('Ошибка захвата аудио из микшера:', e);
    }
})();