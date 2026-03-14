let audioContext, destination;
let activeSources = new Map(); // ключ: sourceId
let mixerState = { devices: [], sources: [] };
let listenGainNode;
let isListening = true;

// Регистрируем эту вкладку как микшер
chrome.runtime.sendMessage({ action: 'registerMixerTab' });

// ---------- Вспомогательные функции ----------
function initAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        destination = audioContext.createMediaStreamDestination();
        listenGainNode = audioContext.createGain();
        listenGainNode.gain.value = 1.0;
        const listenSource = audioContext.createMediaStreamSource(destination.stream);
        listenSource.connect(listenGainNode);
        listenGainNode.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') audioContext.resume();
}

// ---------- Работа с микрофонами (без изменений) ----------
async function getDevices() {
    let tempStream;
    try {
        tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (tempStream) tempStream.getTracks().forEach(t => t.stop());
    return devices.filter(d => d.kind === 'audioinput');
}

// Обновление микшера (применение громкостей и подключение потоков)
async function updateMixer() {
    initAudio();

    // Останавливаем потоки для отключенных микрофонов
    for (let [key, src] of activeSources.entries()) {
        if (!key.startsWith('source-')) {
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

    // Обновляем громкость всех активных источников
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

// ---------- Рендер микрофонов (без изменений) ----------
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

// ---------- Добавление источника (общая функция) ----------
async function addSourceToMixer(sourceId, stream, metadata) {
    initAudio();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = (metadata.volume || 100) / 100;
    sourceNode.connect(gainNode);
    gainNode.connect(destination);
    activeSources.set(sourceId, { sourceNode, gainNode, stream });

    // Сохраняем метаданные в mixerState.sources
    mixerState.sources.push({
        id: sourceId,
        label: metadata.label,
        type: metadata.type,     // 'tab' или 'screen'
        icon: metadata.icon,     // favicon для вкладки или стандартная
        volume: metadata.volume || 100,
        enabled: true
    });
    saveState();
    renderSources();
    document.getElementById('preview-video').srcObject = destination.stream;
}

function removeSource(sourceId) {
    if (activeSources.has(sourceId)) {
        const src = activeSources.get(sourceId);
        src.stream.getTracks().forEach(t => t.stop());
        src.sourceNode.disconnect();
        activeSources.delete(sourceId);
    }
    mixerState.sources = mixerState.sources.filter(s => s.id !== sourceId);
    saveState();
    renderSources();
}

// ---------- Рендер списка источников (с иконками) ----------
function renderSources() {
    const container = document.getElementById('sources-list');
    container.innerHTML = '';

    mixerState.sources.forEach(source => {
        const div = document.createElement('div');
        div.className = 'device-item';
        div.innerHTML = `
            <div class="device-header">
                <span style="font-size: 1.4rem; margin-right: 0.5rem;">${source.icon || '📌'}</span>
                <input type="checkbox" ${source.enabled ? 'checked' : ''} data-id="${source.id}">
                <label style="flex:1;">${source.label}</label>
                <button class="remove-source" data-id="${source.id}" style="background: none; border: none; cursor: pointer; color: #e53e3e;">✖</button>
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

        checkbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                // Повторно захватываем поток (пользователь должен дать разрешение)
                alert('Для повторного включения источника добавьте его заново. Текущий источник будет удалён.');
                removeSource(source.id);
            } else {
                source.enabled = false;
                sourceList.style.display = 'none';
                if (activeSources.has(source.id)) {
                    const src = activeSources.get(source.id);
                    src.stream.getTracks().forEach(t => t.stop());
                    src.sourceNode.disconnect();
                    activeSources.delete(source.id);
                }
                saveState();
            }
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

// ---------- Захват экрана/окна (улучшенный) ----------
async function captureScreen() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
        });

        const videoTracks = stream.getVideoTracks();
        let label = 'Источник';
        let type = 'screen';
        let displaySurface = 'monitor';
        let tabInfo = null;

        if (videoTracks.length > 0) {
            const settings = videoTracks[0].getSettings();
            displaySurface = settings.displaySurface || 'monitor';
            type = displaySurface; // 'monitor', 'window', 'browser'

            // Сырая метка трека
            const rawLabel = videoTracks[0].label || '';

            // Пытаемся извлечь человеко-читаемое название
            if (displaySurface === 'monitor') {
                label = 'Экран';
            } else if (displaySurface === 'window') {
                // Для окон: убираем технический префикс (например, "0:0:0:0:0:0:0:1 - ")
                label = rawLabel.replace(/^[\d:]+ - /, '');
                if (!label) label = 'Окно';
            } else if (displaySurface === 'browser') {
                // Для вкладок: удаляем суффикс браузера
                label = rawLabel
                    .replace(/ - (Google Chrome|Chromium|Яндекс|Firefox|Edge)$/i, '')
                    .replace(/ — (Google Chrome|Chromium|Яндекс|Firefox|Edge)$/i, '');
                if (!label) label = 'Вкладка браузера';

                // Пытаемся найти вкладку с похожим заголовком, чтобы получить favicon
                try {
                    const tabs = await chrome.tabs.query({});
                    // Ищем вкладку, заголовок которой начинается с label (без учёта регистра)
                    const matchedTab = tabs.find(tab => 
                        tab.title && tab.title.toLowerCase().startsWith(label.toLowerCase())
                    );
                    if (matchedTab) {
                        tabInfo = {
                            title: matchedTab.title,
                            favIconUrl: matchedTab.favIconUrl
                        };
                    }
                } catch (e) {
                    console.warn('Не удалось получить список вкладок', e);
                }
            }
        }

        // Останавливаем видео (нам нужно только аудио)
        videoTracks.forEach(track => track.stop());

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            alert('Выбранный источник не содержит аудио');
            return;
        }

        const sourceId = `source-${Date.now()}`;
        const metadata = {
            // Используем найденный заголовок вкладки, если есть, иначе сформированный label
            label: tabInfo ? tabInfo.title : label,
            type: type,
            // Иконка: favicon для вкладки, иначе эмодзи
            icon: tabInfo?.favIconUrl || 
                   (type === 'browser' ? '🌐' : 
                    type === 'window' ? '🪟' : 
                    type === 'monitor' ? '🖥️' : '📌'),
            volume: 100
        };
        await addSourceToMixer(sourceId, stream, metadata);

        // При остановке пользователем удаляем источник
        audioTracks[0].addEventListener('ended', () => {
            console.log('Источник остановлен пользователем:', sourceId);
            removeSource(sourceId);
        });
    } catch (err) {
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
            alert('Ошибка при выборе источника: ' + err.message);
        }
    }
}

// ---------- Сохранение состояния (только микрофоны, источники не сохраняем) ----------
async function loadState() {
    const data = await chrome.storage.sync.get('audioMixerState');
    if (data.audioMixerState) {
        mixerState.devices = data.audioMixerState.devices || [];
        // источники не восстанавливаем
        mixerState.sources = [];
    }
}

async function saveState() {
    await chrome.storage.sync.set({ audioMixerState: { devices: mixerState.devices, sources: [] } });
}

// ---------- Инициализация ----------
loadState().then(async () => {
    await renderDevices();
    updateMixer();
});

document.getElementById('listen-volume').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('listen-volume-value').textContent = val + '%';
    if (listenGainNode) listenGainNode.gain.value = val / 100;
});

// Новые обработчики кнопок
document.getElementById('add-screen-source-btn').addEventListener('click', captureScreen);

// Обработчик кнопки «На всё окно»
const fullscreenWindowBtn = document.getElementById('fullscreen-window-btn');
fullscreenWindowBtn.addEventListener('click', () => {
    document.body.classList.add('fullscreen-mode');
    window.parent.postMessage({ action: 'enterFullWindow' }, '*');
});

// Выход по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) {
        document.body.classList.remove('fullscreen-mode');
        window.parent.postMessage({ action: 'exitFullWindow' }, '*');
    }
});