let audioContext, destination;
let activeSources = new Map();
let mixerState = { devices: [], tabs: [] };
let mixerTabId;

chrome.tabs.getCurrent(tab => {
    mixerTabId = tab.id;
    chrome.runtime.sendMessage({ action: 'registerMixerTab', tabId: mixerTabId });
});

async function getDevices() {
    let tempStream;
    try {
        tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        // Пользователь отказал в доступе или нет микрофона
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (tempStream) {
        tempStream.getTracks().forEach(t => t.stop());
    }
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
    // Обновляем громкость уже активных источников
    for (let [id, src] of activeSources) {
        if (id.startsWith('tab-')) {
            const tabId = parseInt(id.slice(4));
            const tabState = mixerState.tabs.find(t => t.tabId === tabId);
            if (tabState && tabState.enabled) {
                src.gainNode.gain.value = (tabState.volume || 100) / 100;
            } else {
                // источник стал неактивным – останавливаем
                src.stream.getTracks().forEach(t => t.stop());
                src.sourceNode.disconnect();
                activeSources.delete(id);
            }
        } else {
            // устройство
            const devState = mixerState.devices.find(d => d.id === id);
            if (devState && devState.enabled) {
                src.gainNode.gain.value = devState.volume / 100;
            } else {
                src.stream.getTracks().forEach(t => t.stop());
                src.sourceNode.disconnect();
                activeSources.delete(id);
            }
        }
    }

    // Добавляем новые источники, которые ещё не активны
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

    for (let tab of mixerState.tabs) {
        if (tab.enabled && !activeSources.has(`tab-${tab.tabId}`)) {
            try {
                const stream = await new Promise((resolve, reject) => {
                    chrome.tabCapture.capture({ audio: true, video: false }, s => {
                        if (chrome.runtime.lastError || !s) reject(chrome.runtime.lastError);
                        else resolve(s);
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
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: () => {
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
                return sources;
            }
        });
        // results – массив объектов {frameId, result} для каждого фрейма
        const allSources = results.flatMap(r => r.result || []);
        return allSources;
    } catch (e) {
        console.warn('Ошибка получения источников через scripting.executeScript:', e);
        return [];
    }
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

async function loadTabSources(tabId, sourceListElement) {
    try {
        const sources = await fetchTabSources(tabId);
        const tabState = mixerState.tabs.find(t => t.tabId === tabId);
        if (tabState) {
            tabState.sources = sources.map(s => ({
                ...s,
                enabled: false,
                volume: 100
            }));
            saveState();
            renderSources(tabState, sourceListElement);
        }
    } catch (e) {
        console.warn('Ошибка получения источников из вкладки', e);
        sourceListElement.innerHTML = '<p class="setting-description">Ошибка загрузки.</p>';
    }
}

function renderSources(tabState, container) {
    container.innerHTML = '';
    if (!tabState.sources || tabState.sources.length === 0) {
        container.innerHTML = '<p class="setting-description">Нет видео/аудио элементов на этой странице.</p>';
        return;
    }
    tabState.sources.forEach(source => {
        const div = document.createElement('div');
        div.className = 'source-item';
        div.dataset.sourceId = source.id;
        div.innerHTML = `
            <input type="checkbox" ${source.enabled ? 'checked' : ''} data-source-id="${source.id}">
            <label>${source.label}</label>
            <input type="range" min="0" max="100" value="${source.volume}" class="volume-slider" data-source-id="${source.id}">
            <span class="volume-value">${source.volume}%</span>
        `;
        container.appendChild(div);

        const checkbox = div.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            source.enabled = e.target.checked;
            saveState();
            // Здесь можно будет применить захват конкретного элемента
        });

        const slider = div.querySelector('.volume-slider');
        const span = div.querySelector('.volume-value');
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            source.volume = val;
            span.textContent = val + '%';
            saveState();
            // Здесь можно изменить громкость конкретного элемента
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
    // Удаляем состояния для закрытых вкладок
    mixerState.tabs = mixerState.tabs.filter(t => validTabs.some(tab => tab.id === t.tabId));

    // Добавляем новые вкладки
    for (let tab of validTabs) {
        if (!mixerState.tabs.some(t => t.tabId === tab.id)) {
            mixerState.tabs.push({
                tabId: tab.id,
                title: tab.title || 'Вкладка',
                enabled: false,
                expanded: false,
                sources: [],
                volume: 100
            });
        }
    }

    // Сортируем по id
    mixerState.tabs.sort((a, b) => a.tabId - b.tabId);

    // Рендерим каждую вкладку
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
                <div class="individual-sources"></div>
            </div>
        `;
        container.appendChild(tabDiv);

        const header = tabDiv.querySelector('.tab-header');
        const expandIcon = tabDiv.querySelector('.expand-icon');
        const sourceListDiv = tabDiv.querySelector('.source-list');
        const checkbox = tabDiv.querySelector('input[type="checkbox"]');
        const individualSourcesDiv = tabDiv.querySelector('.individual-sources');

        header.addEventListener('click', async (e) => {
            if (e.target.tagName === 'INPUT') return;
            tabState.expanded = !tabState.expanded;
            tabDiv.classList.toggle('expanded', tabState.expanded);
            sourceListDiv.style.display = tabState.expanded ? 'block' : 'none';
            if (tabState.expanded && (!tabState.sources || tabState.sources.length === 0)) {
                await loadTabSources(tabState.tabId, individualSourcesDiv);
            } else if (tabState.expanded && tabState.sources && tabState.sources.length > 0) {
                renderSources(tabState, individualSourcesDiv);
            }
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
    }
}

// Инициализация
loadState().then(() => {
    renderDevices();
    renderTabs();
    applyMixerState();
});