(function() {
    let clickHandler = null;
    let styleElement = null;

    function updateGoogleFeatures() {
        chrome.storage.sync.get(['googleFullscreenImage', 'googleHideExtraElements', 'googleOpenImageDirectly'], (data) => {
            const fullscreen = data.googleFullscreenImage !== false;
            const hideExtra = data.googleHideExtraElements !== false;
            const openDirect = data.googleOpenImageDirectly !== false;

            // ===== Управление стилями =====
            if (styleElement) {
                styleElement.remove();
                styleElement = null;
            }

            let css = '';
            if (fullscreen) {
                css += `
                    div[role="dialog"] {
                        --offset: 70px;
                        width: 100vw !important;
                        height: calc(100vh - var(--offset)) !important;
                        position: fixed !important;
                        left: 0 !important;
                        top: var(--offset) !important;
                    }
                `;
            }
            if (hideExtra) {
                css += `
                    div[role="dialog"] div[data-viewer-group="1"] {
                        display: none !important;
                    }
                    div:empty {
                        display: none !important;
                    }
                `;
            }

            if (css) {
                styleElement = document.createElement('style');
                styleElement.textContent = css;
                document.head.appendChild(styleElement);
            }

            // ===== Управление обработчиком кликов =====
            if (clickHandler) {
                document.removeEventListener('click', clickHandler, true);
                clickHandler = null;
            }
            if (openDirect) {
                clickHandler = (e) => {
                    const img = e.target.closest('img');
                    if (img && !img.id) {
                        const src = img.src;
                        if (src && src.startsWith('http')) {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(src, '_blank');
                        }
                    }
                };
                document.addEventListener('click', clickHandler, true);
            }
        });
    }

    // Инициализация при загрузке скрипта
    updateGoogleFeatures();

    // Следим за изменениями в настройках
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            const relevantKeys = ['googleFullscreenImage', 'googleHideExtraElements', 'googleOpenImageDirectly'];
            if (relevantKeys.some(key => changes[key])) {
                updateGoogleFeatures();
            }
        }
    });
})();