(function() {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    async function getCaptureStream() {
        const response = await chrome.runtime.sendMessage({ action: 'getCurrentCaptureStreamId' });
        if (!response?.streamId) return null;
        try {
            return await originalGetUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'tab',
                        chromeMediaSourceId: response.streamId
                    }
                },
                video: false
            });
        } catch {
            return null;
        }
    }

    navigator.mediaDevices.getUserMedia = async function(constraints) {
        if (constraints?.audio) {
            const captureStream = await getCaptureStream();
            if (captureStream && !constraints.video) return captureStream;
        }
        return originalGetUserMedia(constraints);
    };

    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices;
    navigator.mediaDevices.enumerateDevices = async function() {
        const devices = await originalEnumerateDevices.call(navigator.mediaDevices);
        devices.push({
            deviceId: 'mixer-capture',
            kind: 'audioinput',
            label: '🎚️ Микшер (захват)',
            groupId: 'mixer'
        });
        return devices;
    };

    // Обработчик запроса списка медиаэлементов
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getMediaSources') {
            const sources = [];
            document.querySelectorAll('video, audio').forEach((el, index) => {
                sources.push({
                    id: `${el.tagName}-${index}-${Date.now()}`,
                    type: el.tagName,
                    label: el.title || el.src || `${el.tagName} элемент ${index+1}`,
                    enabled: false,
                    volume: 100
                });
            });
            sendResponse({ sources });
        }
    });
})();