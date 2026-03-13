let audioContext, destination;
let activeSources = new Map();
let mixerState = { devices: [], tabs: [] };
let mixerTabId;

chrome.tabs.getCurrent(tab => {
    mixerTabId = tab.id;
    chrome.runtime.sendMessage({ action: 'registerMixerTab', tabId: mixerTabId });
});

async function getDevices() {
    await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
}

async function loadState() {
    const data = await chrome.storage.sync.get('audioMixerState');
    if (data.audioMixerState) mixerState = data.audioMixerState;
}

async function saveState() {
    await chrome.storage.sync.set({ audioMixerState: mixerState });
}

function initAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
        destination = audioContext.createMediaStreamDestination();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
}

function isSourceActive(id) {
    if (id.startsWith('tab-')) {
        const tabId = parseInt(id.slice(4));
        return mixerState.tabs.some(t => t.tabId === tabId && t.enabled);
    } else if (id.startsWith('source-')) {
        // отдельный источник внутри вкладки, пока не поддерживаем захват отдельных элементов
        return false;
    } else {
        return mixerState.devices.some(d => d.id === id && d.enabled);
    }
}

async function applyMixerState() {
    initAudio();
    // Остановка неактивных источников
    for (let [id, src] of activeSources) {
        if (!isSourceActive(id)) {
            src.stream.getTracks().forEach(t => t.stop());
            src.sourceNode.disconnect();
            activeSources.delete(id);
        }
    }
    // Захват устройств
    for (let dev of mixerState.devices) {
        if (dev.enabled && !activeSources.has(dev.id)) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev.id } });
                const sourceNode = audioContext.createMediaStreamSource(stream);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = dev.volume / 100;
                sourceNode.connect(gainNode).connect(destination);
                activeSources.set(dev.id, { sourceNode, gainNode, stream });
            } catch (e) {
                console.warn('Не удалось захватить устройство', dev, e);
            }
        }
    }
    // Захват вкладок (пока целиком)
    for (let tab of mixerState.tabs) {
        if (tab.enabled && !activeSources.has(`tab-${tab.tabId}`)) {
            try {
                const stream = await new Promise((resolve, reject) => {
                    chrome.tabCapture.capture({ audio: true, video: false }, s => {
                        if (chrome.runtime.lastError || !s) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(s);
                        }
                    });
                });
                const sourceNode = audioContext.createMediaStreamSource(stream);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = (tab.volume || 100) / 100;
                sourceNode.connect(gainNode).connect(destination);
                activeSources.set(`tab-${tab.tabId}`, { sourceNode, gainNode, stream });
            } catch (e) {
                console.warn('Не удалось захватить вкладку', tab, e);
            }
        }
    }
    document.getElementById('preview-video').srcObject = destination.stream;
}

// Запрос списка медиаэлементов из вкладки
async function fetchTabSources(tabId) {
    return new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: 'getMediaSources' }, response => {
            if (chrome.runtime.lastError || !response) {
                resolve([]);
            } else {
                resolve(response.sources);
            }
        });
    });
}

// Рендер устройств
async function renderDevices() {
    const devices = await getDevices();
    const container = document.getElementById('devices-section');
    container.innerHTML = '';

    devices.forEach(device => {
        let devState = mixerState.devices.find(d => d.id === device.deviceId);
        if (!devState) {
            devState = { id: device.deviceId, label: device.label || 'Микрофон', enabled: false, volume: 100 };
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
            applyMixerState();
        });

        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            devState.volume = val;
            span.textContent = val + '%';
            saveState();
            applyMixerState();
        });
    });
}

// Рендер вкладок
async function renderTabs() {
    const tabs = await chrome.tabs.query({});
    const validTabs = tabs.filter(t => !t.url.startsWith(chrome.runtime.getURL('')));
    const container = document.getElementById('tabs-section');
    container.innerHTML = '';

    // Синхронизируем состояние с существующими вкладками
    mixerState.tabs = mixerState.tabs.filter(t => validTabs.some(tab => tab.id === t.tabId));
    for (let tab of validTabs) {
        let tabState = mixerState.tabs.find(t => t.tabId === tab.id);
        if (!tabState) {
            tabState = { tabId: tab.id, title: tab.title || 'Вкладка', enabled: false, expanded: false, sources: [], volume: 100 };
            mixerState.tabs.push(tabState);
        }
        // Загружаем источники (если ещё не загружены)
        if (tabState.sources.length === 0) {
            tabState.sources = await fetchTabSources(tab.id);
        }
    }

    mixerState.tabs.sort((a, b) => a.tabId - b.tabId);

    for (let tabState of mixerState.tabs) {
        const tabDiv = document.createElement('div');
        tabDiv.className = `tab-item ${tabState.expanded ? 'expanded' : ''}`;
        tabDiv.innerHTML = `
            <div class="tab-header" data-tab-id="${tabState.tabId}">
                <span class="expand-icon">▶</span>
                <input type="checkbox" ${tabState.enabled ? 'checked' : ''} data-tab-id="${tabState.tabId}">
                <span>${tabState.title}</span>
            </div>
            <div class="source-list" style="display: ${tabState.expanded ? 'block' : 'none'};">
                <div class="source-item">
                    <label>Громкость всей вкладки</label>
                    <input type="range" min="0" max="100" value="${tabState.volume || 100}" class="tab-volume" data-tab-id="${tabState.tabId}">
                    <span class="volume-value">${tabState.volume || 100}%</span>
                </div>
                <div class="separator"></div>
                ${tabState.sources.map(src => `
                    <div class="source-item" data-source-id="${src.id}">
                        <input type="checkbox" ${src.enabled ? 'checked' : ''} data-source-id="${src.id}">
                        <label>${src.label}</label>
                        <input type="range" min="0" max="100" value="${src.volume || 100}" class="volume-slider" data-source-id="${src.id}">
                        <span class="volume-value">${src.volume || 100}%</span>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(tabDiv);

        const header = tabDiv.querySelector('.tab-header');
        const expandIcon = tabDiv.querySelector('.expand-icon');
        const sourceList = tabDiv.querySelector('.source-list');
        const checkbox = tabDiv.querySelector('input[type="checkbox"]');

        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            tabState.expanded = !tabState.expanded;
            tabDiv.classList.toggle('expanded', tabState.expanded);
            sourceList.style.display = tabState.expanded ? 'block' : 'none';
        });

        checkbox.addEventListener('change', (e) => {
            tabState.enabled = e.target.checked;
            saveState();
            applyMixerState();
        });

        const tabVolumeSlider = tabDiv.querySelector('.tab-volume');
        const tabVolumeSpan = tabDiv.querySelector('.volume-value');
        if (tabVolumeSlider) {
            tabVolumeSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                tabVolumeSpan.textContent = val + '%';
                tabState.volume = val;
                saveState();
                applyMixerState();
            });
        }

        // Обработчики для отдельных источников
        tabState.sources.forEach(src => {
            const sourceDiv = tabDiv.querySelector(`[data-source-id="${src.id}"]`);
            if (!sourceDiv) return;
            const srcCheckbox = sourceDiv.querySelector('input[type="checkbox"]');
            const srcSlider = sourceDiv.querySelector('.volume-slider');
            const srcSpan = sourceDiv.querySelector('.volume-value');

            srcCheckbox.addEventListener('change', (e) => {
                src.enabled = e.target.checked;
                saveState();
                // TODO: при включении отдельного источника нужно захватывать его, а не всю вкладку
                // Пока просто обновим общий захват, но в будущем можно расширить
                applyMixerState();
            });

            srcSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                src.volume = val;
                srcSpan.textContent = val + '%';
                saveState();
                applyMixerState();
            });
        });
    }
}

// Обработчик на весь экран
document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const video = document.getElementById('preview-video');
    if (video.requestFullscreen) {
        video.requestFullscreen();
    }
});

// Инициализация
loadState().then(() => {
    renderDevices();
    renderTabs();
    applyMixerState();
});