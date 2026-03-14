let audioContext, destination;
let activeSources = new Map(); // ключ: deviceId или `tab-${tabId}`
let mixerState = { devices: [], sources: [] };
let listenGainNode; // узел для регулировки громкости прослушивания
let isListening = true;
let listenSourceNode; // для сохранения источника прослушивания
let isCapturePending = false; // защита от одновременных диалогов

// Регистрируем эту вкладку как микшер (используем sender.tab.id в фоне)
chrome.runtime.sendMessage({ action: 'registerMixerTab' });

async function captureTabAudio(tabState) {
    if (isCapturePending) {
        alert('Подождите завершения текущего выбора источника');
        tabState.enabled = false;
        updateCheckbox(tabState.tabId, false);
        return;
    }

    const key = `tab-${tabState.tabId}`;
    if (activeSources.has(key)) return;

    isCapturePending = true;
    try {
        console.log('Запрос выбора источника для вкладки через getDisplayMedia');
        
        // Запрашиваем поток с видео и аудио (видео потом отключим)
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: {
                displaySurface: 'browser' // подсказка, что хотим вкладку
            }
        });

        console.log('Получен stream из getDisplayMedia', stream);

        // Останавливаем видео-треки, оставляем только аудио
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach(track => {
            track.stop();
            console.log('Видео-трек остановлен:', track.label);
        });

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            throw new Error('Выбранный источник не содержит аудиодорожек');
        }

        console.log('Аудио-треки:', audioTracks.map(t => t.label));

        // Проверяем состояние AudioContext
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const sourceNode = audioContext.createMediaStreamSource(stream);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = (tabState.volume || 100) / 100;
        sourceNode.connect(gainNode);
        gainNode.connect(destination);
        activeSources.set(key, { sourceNode, gainNode, stream });

        document.getElementById('preview-video').srcObject = destination.stream;
        console.log('Источник успешно добавлен в микшер');
    } catch (err) {
        console.error('Ошибка в captureTabAudio:', err);
        tabState.enabled = false;
        saveState();
        updateCheckbox(tabState.tabId, false);
        alert('Не удалось захватить аудио: ' + err.message);
    } finally {
        isCapturePending = false;
    }
}

// Вспомогательная функция для обновления чекбокса
function updateCheckbox(tabId, checked) {
    const checkbox = document.querySelector(`input[data-tab-id="${tabId}"]`);
    if (checkbox) checkbox.checked = checked;
}

// ---------- Загрузка/сохранение состояния ----------
async function loadState() {
    const data = await chrome.storage.sync.get('audioMixerState');
    if (data.audioMixerState) {
        mixerState = data.audioMixerState;
        // Очищаем источники, так как они не могут быть восстановлены
        mixerState.sources = [];
    }
    mixerState.devices = mixerState.devices || [];
    mixerState.sources = mixerState.sources || [];
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

    // Удаляем микрофоны, которые отключены
    for (let [key, src] of activeSources.entries()) {
        if (!key.startsWith('source-')) { // предполагаем, что ключи микрофонов – это deviceId, а не source-*
            let shouldKeep = mixerState.devices.some(d => d.id === key && d.enabled);
            if (!shouldKeep) {
                src.stream.getTracks().forEach(t => t.stop());
                src.sourceNode.disconnect();
                activeSources.delete(key);
            }
        }
    }

    // Добавляем новые микрофоны
    for (let dev of mixerState.devices) {
        if (dev.enabled && !activeSources.has(dev.id)) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev.id } });
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

    // Обновляем громкость всех активных (и микрофонов, и источников)
    for (let [key, src] of activeSources.entries()) {
        let volume = 100;
        if (key.startsWith('source-')) {
            const source = mixerState.sources.find(s => s.id === key);
            if (source) volume = source.volume;
        } else {
            const dev = mixerState.devices.find(d => d.id === key);
            if (dev) volume = dev.volume;
        }
        src.gainNode.gain.value = volume / 100;
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
/*функции источников*/
async function addSourceToMixer(sourceId, stream, volume = 100) {
    initAudio();

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume / 100;
    sourceNode.connect(gainNode);
    gainNode.connect(destination);

    activeSources.set(sourceId, { sourceNode, gainNode, stream });
    document.getElementById('preview-video').srcObject = destination.stream;
}
function removeSource(sourceId) {
    // Удаляем из активных
    if (activeSources.has(sourceId)) {
        const src = activeSources.get(sourceId);
        src.stream.getTracks().forEach(t => t.stop());
        src.sourceNode.disconnect();
        activeSources.delete(sourceId);
    }

    // Удаляем из состояния
    mixerState.sources = mixerState.sources.filter(s => s.id !== sourceId);
    saveState();
    renderSources();
}
function renderSources() {
    const container = document.getElementById('sources-list');
    container.innerHTML = '';

    mixerState.sources.forEach(source => {
        const div = document.createElement('div');
        div.className = 'device-item';
        div.innerHTML = `
            <div class="device-header">
                <input type="checkbox" ${source.enabled ? 'checked' : ''} data-id="${source.id}">
                <label>${source.label}</label>
                <button class="remove-source" data-id="${source.id}">✖</button>
            </div>
            <div class="source-list" style="display: ${source.enabled ? 'block' : 'none'};">
                <div class="source-item">
                    <label>Громкость</label>
                    <input type="range" min="0" max="100" value="${source.volume}" class="volume-slider" data-id="${source.id}">
                    <span class="volume-value">${source.volume}%</span>
                </div>
            </div>
        `;

        container.appendChild(div);

        const checkbox = div.querySelector('input[type="checkbox"]');
        const sourceList = div.querySelector('.source-list');
        const slider = div.querySelector('.volume-slider');
        const span = div.querySelector('.volume-value');
        const removeBtn = div.querySelector('.remove-source');

        checkbox.addEventListener('change', (e) => {
            source.enabled = e.target.checked;
            if (source.enabled) {
                // Включаем – если поток ещё жив, просто обновляем громкость
                // Если поток был остановлен, нужно заново запросить? Лучше не давать включать, если поток мёртв.
                // В упрощённом варианте: при включении проверяем, есть ли активный источник, если нет – показываем ошибку.
                if (activeSources.has(source.id)) {
                    sourceList.style.display = 'block';
                } else {
                    alert('Источник недоступен. Попробуйте добавить его заново.');
                    source.enabled = false;
                    checkbox.checked = false;
                }
            } else {
                sourceList.style.display = 'none';
                // Останавливаем поток
                if (activeSources.has(source.id)) {
                    const src = activeSources.get(source.id);
                    src.stream.getTracks().forEach(t => t.stop());
                    src.sourceNode.disconnect();
                    activeSources.delete(source.id);
                }
            }
            saveState();
        });

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            source.volume = val;
            span.textContent = val + '%';
            if (activeSources.has(source.id)) {
                activeSources.get(source.id).gainNode.gain.value = val / 100;
            }
            saveState();
        });

        removeBtn.addEventListener('click', () => {
            removeSource(source.id);
        });
    });
}
// ---------- Инициализация ----------
loadState().then(async () => {
    await renderDevices();
    await restoreEnabledTabs();
    updateMixer();
});

document.getElementById('listen-volume').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('listen-volume-value').textContent = val + '%';
    if (listenGainNode) listenGainNode.gain.value = val / 100;
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
    document.getElementById('preview-video').requestFullscreen();
});

document.getElementById('listen-volume').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('listen-volume-value').textContent = val + '%';
    if (listenGainNode) listenGainNode.gain.value = val / 100;
});

document.getElementById('add-source-btn').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true // видео нужно, чтобы получить аудио из некоторых источников; потом остановим
        });

        // Останавливаем видео, оставляем только аудио
        stream.getVideoTracks().forEach(track => track.stop());
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            alert('Выбранный источник не содержит аудио');
            return;
        }

        // Получаем метку для отображения (берём из первого аудиотрека)
        const label = audioTracks[0].label || 'Источник';
        const sourceId = `source-${Date.now()}`;

        // Добавляем в состояние
        mixerState.sources.push({
            id: sourceId,
            label: label,
            enabled: true,
            volume: 100,
            stream: stream // сохраняем поток в состоянии (но осторожно: поток не сериализуется, его нельзя сохранить в storage)
        });

        // Сохраняем состояние (без потока) в storage
        saveState();

        // Добавляем в активные источники
        await addSourceToMixer(sourceId, stream, 100);

        // Рендерим обновлённый список
        renderSources();

        // Следим за остановкой пользователем
        audioTracks[0].addEventListener('ended', () => {
            console.log('Источник остановлен пользователем:', sourceId);
            removeSource(sourceId);
        });

    } catch (err) {
        console.error('Ошибка при выборе источника:', err);
    }
});