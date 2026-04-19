(function() {

    // Функция проверки, находимся ли мы в разделе "Картинки"
    function isGoogleImages() {
        // По URL
        if (window.location.search.includes('tbm=isch')) return true;
        // По наличию активной кнопки "Картинки" в навигации
        const activeTab = document.querySelector('a[aria-current="page"][href*="tbm=isch"]');
        if (activeTab) return true;
        // По наличию элемента, характерного только для страницы картинок
        if (document.querySelector('[data-hveid*="CAcQ"], [jsname="j93WEe"]')) return true;
        return false;
    }

    // Если не картинки — выходим
    if (!isGoogleImages()) return;

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
                        --offset: 0px;
                        width: 100vw !important;
                        height: calc(100vh - var(--offset)) !important;
                        position: fixed !important;
                        left: 0 !important;
                        top: var(--offset) !important;
                        z-index:2147483647 !imprtant;
                    }
                    body:has(div[role="dialog"]) form[action="/search"], body:has(div[role="dialog"]) span:has(form[action="/search"]){
                        position:fixed !important;
                        bottom:0 !important;
                        right:0 !important;
                        width:100% !important;
                        z-index:9999999 !important;
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