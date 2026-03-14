let audioContext, destination;
let activeSources = new Map(); // ключ: deviceId или `tab-${tabId}`
let mixerState = { devices: [], tabs: [] };
let listenGainNode; // узел для регулировки громкости прослушивания
let isListening = true;
let listenSourceNode; // для сохранения источника прослушивания
let isCapturePending = false; // защита от одновременных диалогов

// Регистрируем эту вкладку как микшер (используем sender.tab.id в фоне)
chrome.runtime.sendMessage({ action: 'registerMixerTab' });

async function captureTabAudio(tabState) {
    if (isCapturePending) {
        alert('Подождите завершения текущего выбора источника');
        // Сбрасываем чекбокс
        tabState.enabled = false;
        const checkbox = document.querySelector(`input[data-tab-id="${tabState.tabId}"]`);
        if (checkbox) checkbox.checked = false;
        return;
    }

    const key = `tab-${tabState.tabId}`;
    if (activeSources.has(key)) return;

    isCapturePending = true;
    try {
        const streamId = await new Promise((resolve, reject) => {
            chrome.desktopCapture.chooseDesktopMedia(
                ['tab', 'audio'], // можно добавить 'window', 'screen'
                (streamId) => {
                    if (chrome.runtime.lastError || !streamId) {
                        reject(chrome.runtime.lastError || new Error('No streamId'));
                    } else {
                        resolve(streamId);
                    }
                }
            );
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        });

        if (stream.getAudioTracks().length === 0) {
            throw new Error('Выбранный источник не содержит аудиодорожек');
        }

        const sourceNode = audioContext.createMediaStreamSource(stream);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = (tabState.volume || 100) / 100;
        sourceNode.connect(gainNode);
        gainNode.connect(destination);
        activeSources.set(key, { sourceNode, gainNode, stream });

        // Обновляем видео-превью (на всякий случай)
        document.getElementById('preview-video').srcObject = destination.stream;
    } catch (err) {
        console.error('Ошибка захвата вкладки:', err);
        tabState.enabled = false;
        saveState();
        const checkbox = document.querySelector(`input[data-tab-id="${tabState.tabId}"]`);
        if (checkbox) checkbox.checked = false;
        alert('Не удалось захватить аудио из выбранного источника. Возможно, источник не содержит звука.');
    } finally {
        isCapturePending = false;
    }
}

// ---------- Загрузка/сохранение состояния ----------
async function loadState() {
    const data = await chrome.storage.sync.get('audioMixerState');
    if (data.audioMixerState) mixerState = data.audioMixerState;
    mixerState.devices = mixerState.devices || [];
    mixerState.tabs = mixerState.tabs || [];
}

async function saveState() {
    await chrome.storage.sync.set({ audioMixerState: mixerState });
}

// ---------- Инициализация AudioContext ----------
function initAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        destination = audioContext.createMediaStreamDestination();

        listenGainNode = audioContext.createGain();
        listenGainNode.gain.value = 1.0;
        
        listenSourceNode = audioContext.createMediaStreamSource(destination.stream);
        listenSourceNode.connect(listenGainNode);
        listenGainNode.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume();
}

// ---------- Получение списка микрофонов ----------
async function getDevices() {
    let tempStream;
    try {
        tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { /* нет доступа */ }
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (tempStream) tempStream.getTracks().forEach(t => t.stop());
    return devices.filter(d => d.kind === 'audioinput');
}

// ---------- Основная функция обновления микшера ----------
async function updateMixer() {
    initAudio();

    // 1. Удаляем источники, которые больше не включены
    for (let [key, src] of activeSources.entries()) {
        let shouldKeep = false;
        if (key.startsWith('tab-')) {
            const tabId = parseInt(key.slice(4));
            shouldKeep = mixerState.tabs.some(t => t.tabId === tabId && t.enabled);
        } else {
            shouldKeep = mixerState.devices.some(d => d.id === key && d.enabled);
        }
        if (!shouldKeep) {
            src.stream.getTracks().forEach(t => t.stop());
            src.sourceNode.disconnect();
            activeSources.delete(key);
        }
    }

    // 2. Обновляем громкость у существующих
    for (let [key, src] of activeSources.entries()) {
        let volume = 100;
        if (key.startsWith('tab-')) {
            const tabId = parseInt(key.slice(4));
            const tab = mixerState.tabs.find(t => t.tabId === tabId);
            if (tab) volume = tab.volume;
        } else {
            const dev = mixerState.devices.find(d => d.id === key);
            if (dev) volume = dev.volume;
        }
        src.gainNode.gain.value = volume / 100;
    }

    // 3. Добавляем новые микрофоны (они не требуют диалога)
    for (let dev of mixerState.devices) {
        if (dev.enabled && !activeSources.has(dev.id)) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: dev.id }
                });
                const sourceNode = audioContext.createMediaStreamSource(stream);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = dev.volume / 100;
                sourceNode.connect(gainNode);
                gainNode.connect(destination);
                activeSources.set(dev.id, { sourceNode, gainNode, stream });
            } catch (e) {
                console.warn('Не удалось захватить микрофон', dev, e);
            }
        }
    }

    document.getElementById('preview-video').srcObject = destination.stream;
}

// ---------- Рендер устройств ----------
async function renderDevices() {
    const devices = await getDevices();
    const container = document.getElementById('devices-section');
    container.innerHTML = '';

    devices.forEach(device => {
        let devState = mixerState.devices.find(d => d.id === device.deviceId);
        if (!devState) {
            devState = {
                id: device.deviceId,
                label: device.label || 'Микрофон',
                enabled: false,
                volume: 100
            };
            mixerState.devices.push(devState);
        }

        const div = document.createElement('div');
        div.className = 'device-item';
        div.innerHTML = `
            <div class="device-header">
                <input type="checkbox" ${devState.enabled ? 'checked' : ''} data-id="${device.deviceId}">
                <label>${devState.label}</label>
            </div>
            <div class="source-list" style="display: ${devState.enabled ? 'block' : 'none'};">
                <div class="source-item">
                    <label>Громкость</label>
                    <input type="range" min="0" max="100" value="${devState.volume}" class="volume-slider" data-id="${device.deviceId}">
                    <span class="volume-value">${devState.volume}%</span>
                </div>
            </div>
        `;
        container.appendChild(div);

        const checkbox = div.querySelector('input[type="checkbox"]');
        const sourceList = div.querySelector('.source-list');
        const slider = div.querySelector('.volume-slider');
        const span = div.querySelector('.volume-value');

        checkbox.addEventListener('change', (e) => {
            devState.enabled = e.target.checked;
            sourceList.style.display = devState.enabled ? 'block' : 'none';
            saveState();
            updateMixer();
        });

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            devState.volume = val;
            span.textContent = val + '%';
            saveState();
            updateMixer();
        });
    });
}

async function restoreEnabledTabs() {
    for (let tabState of mixerState.tabs) {
        if (tabState.enabled) {
            await captureTabAudio(tabState);
        }
    }
}

// ---------- Рендер вкладок ----------
async function renderTabs() {
    const tabs = await chrome.tabs.query({});
    const validTabs = tabs.filter(t => !t.url.startsWith(chrome.runtime.getURL('')));

    mixerState.tabs = mixerState.tabs.filter(t => validTabs.some(tab => tab.id === t.tabId));

    for (let tab of validTabs) {
        if (!mixerState.tabs.some(t => t.tabId === tab.id)) {
            mixerState.tabs.push({
                tabId: tab.id,
                title: tab.title || 'Вкладка',
                enabled: false,
                volume: 100
            });
        }
    }

    mixerState.tabs.sort((a, b) => a.tabId - b.tabId);

    const container = document.getElementById('tabs-section');
    container.innerHTML = '';

    for (let tabState of mixerState.tabs) {
        const tabDiv = document.createElement('div');
        tabDiv.className = 'tab-item';
        tabDiv.innerHTML = `
            <div class="tab-header">
                <input type="checkbox" ${tabState.enabled ? 'checked' : ''} data-tab-id="${tabState.tabId}">
                <span>${tabState.title}</span>
            </div>
            <div class="source-list" style="display: ${tabState.enabled ? 'block' : 'none'};">
                <div class="source-item">
                    <label>Громкость всей вкладки</label>
                    <input type="range" min="0" max="100" value="${tabState.volume}" class="volume-slider" data-tab-id="${tabState.tabId}">
                    <span class="volume-value">${tabState.volume}%</span>
                </div>
            </div>
        `;
        container.appendChild(tabDiv);

        const checkbox = tabDiv.querySelector('input[type="checkbox"]');
        const sourceList = tabDiv.querySelector('.source-list');
        const slider = tabDiv.querySelector('.volume-slider');
        const span = tabDiv.querySelector('.volume-value');

        checkbox.addEventListener('change', async (e) => {
            tabState.enabled = e.target.checked;
            if (tabState.enabled) {
                await captureTabAudio(tabState);
            } else {
                const key = `tab-${tabState.tabId}`;
                if (activeSources.has(key)) {
                    const src = activeSources.get(key);
                    src.stream.getTracks().forEach(t => t.stop());
                    src.sourceNode.disconnect();
                    activeSources.delete(key);
                }
            }
            sourceList.style.display = tabState.enabled ? 'block' : 'none';
            saveState();
            // Не вызываем updateMixer – активные источники уже обновлены
        });

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            tabState.volume = val;
            span.textContent = val + '%';
            saveState();
            updateMixer();
        });
    }
}

// ---------- Инициализация ----------
loadState().then(async () => {
    await renderDevices();
    await renderTabs();
    await restoreEnabledTabs(); // <-- добавить
    updateMixer(); // обновит микрофоны и громкость
});

document.getElementById('listen-volume').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('listen-volume-value').textContent = val + '%';
    if (listenGainNode) listenGainNode.gain.value = val / 100;
});

isListening = true;
document.getElementById('toggle-listen').addEventListener('click', (e) => {
    if (isListening) {
        listenGainNode.disconnect();
        e.target.textContent = '▶️ Возобновить';
    } else {
        listenGainNode.connect(audioContext.destination);
        e.target.textContent = '⏸️ Приостановить';
    }
    isListening = !isListening;
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
    document.getElementById('preview-video').requestFullscreen();
});

document.getElementById('listen-volume').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('listen-volume-value').textContent = val + '%';
    if (listenGainNode) listenGainNode.gain.value = val / 100;
});

document.getElementById('toggle-listen').addEventListener('click', (e) => {
    if (isListening) {
        listenGainNode.disconnect();
        e.target.textContent = '▶️ Возобновить';
    } else {
        listenGainNode.connect(audioContext.destination);
        e.target.textContent = '⏸️ Приостановить';
    }
    isListening = !isListening;
});
