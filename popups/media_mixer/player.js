(async function() {
    const video = document.getElementById('player');
    const urlParams = new URLSearchParams(window.location.search);
    const streamId = urlParams.get('streamId');

    if (!streamId) {
        console.error('Нет streamId');
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
            video: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        });
        video.srcObject = stream;
    } catch (error) {
        console.error('Ошибка получения потока:', error);
    }
})();