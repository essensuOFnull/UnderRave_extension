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
        } catch (e) {
            console.warn('getCaptureStream error:', e);
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

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getMediaSources') {
            console.log('getMediaSources called in tab', sender.tab ? sender.tab.id : 'unknown');
            const sources = [];
            function collectMedia(root) {
                if (!root || !root.querySelectorAll) return;
                root.querySelectorAll('video, audio').forEach((el, index) => {
                    sources.push({
                        id: `${el.tagName}-${index}-${Date.now()}`,
                        type: el.tagName,
                        label: el.title || el.src || el.currentSrc || `${el.tagName} элемент`,
                    });
                });
                // Shadow DOM
                const hosts = root.querySelectorAll('*');
                hosts.forEach(host => {
                    if (host.shadowRoot) {
                        collectMedia(host.shadowRoot);
                    }
                });
            }
            collectMedia(document);
            console.log('Found sources:', sources);
            sendResponse({ sources });
        }
    });
})();