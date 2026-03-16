// contents/encrypt/index.js
(function() {
    'use strict';

    // ==================== Утилиты из оригинального VKEncrypt ====================
    window.arrayEquality = function(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    };

    window.toInt32 = function(number) {
        return (number + 0x100000000) % 0x100000000;
    };

    window.toBytesInt32 = function(num, size = 4) {
        const arr = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            arr[i] = (num >> (8 * (size - 1 - i))) & 0xff;
        }
        return arr;
    };

    // ==================== Состояние расширения ====================
    let config = {
        encryptKey: '',
        decryptKey: '',
        encryptEnabled: true,
        decryptEnabled: true
    };
    const fieldMap = new WeakMap(); // original -> { host, shadowInput, realText }

    // Загрузка настроек
    chrome.storage.local.get(['encryptKey', 'decryptKey', 'encryptEnabled', 'decryptEnabled'], (result) => {
        config = { ...config, ...result };
        init();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.encryptKey) config.encryptKey = changes.encryptKey.newValue;
        if (changes.decryptKey) config.decryptKey = changes.decryptKey.newValue;
        if (changes.encryptEnabled) config.encryptEnabled = changes.encryptEnabled.newValue;
        if (changes.decryptEnabled) config.decryptEnabled = changes.decryptEnabled.newValue;
    });

    function init() {
        if (config.encryptEnabled) observeInputs();
        if (config.decryptEnabled) observeDecryption();
    }

    // ==================== НАБЛЮДЕНИЕ ЗА ПОЯВЛЕНИЕМ ПОЛЕЙ ====================
    function observeInputs() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        findInputs(node).forEach(setupField);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Обрабатываем уже существующие поля
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')
            .forEach(setupField);
    }

    function findInputs(root) {
        const inputs = [];
        const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';
        if (root.matches && root.matches(selector) && !fieldMap.has(root)) {
            inputs.push(root);
        }
        root.querySelectorAll(selector).forEach(el => {
            if (!fieldMap.has(el)) inputs.push(el);
        });
        return inputs;
    }

    // ==================== СОЗДАНИЕ SHADOW HOST ====================
    function setupField(original) {
        if (fieldMap.has(original)) return;

        // 1. Создаём хост (будет позиционироваться поверх оригинала)
        const host = document.createElement('div');
        host.style.setProperty('position', 'absolute', 'important');
        host.style.setProperty('z-index', '10000', 'important');
        host.style.setProperty('background', 'transparent', 'important');
        host.style.setProperty('border', 'none', 'important');
        host.style.setProperty('box-shadow', 'none', 'important');
        host.style.setProperty('outline', 'none', 'important');
        host.style.setProperty('margin', '0', 'important');
        host.style.setProperty('padding', '0', 'important');

        // 2. Прикрепляем closed shadow root
        const shadow = host.attachShadow({ mode: 'closed' });

        // 3. Создаём поле ввода внутри shadow
        let shadowInput;
        if (original.isContentEditable) {
            shadowInput = document.createElement('div');
            shadowInput.contentEditable = 'true';
        } else if (original.tagName === 'TEXTAREA') {
            shadowInput = document.createElement('textarea');
        } else {
            shadowInput = document.createElement('input');
            shadowInput.type = original.type || 'text';
        }

        // Копируем атрибуты (placeholder, disabled и т.д.)
        copyAttributes(original, shadowInput);

        // Копируем стили, влияющие на внешний вид
        copyInputStyles(original, shadowInput);

        // Устанавливаем начальное значение
        if (original.isContentEditable) {
            shadowInput.innerText = original.innerText;
        } else {
            shadowInput.value = original.value;
        }

        shadow.appendChild(shadowInput);

        // Сохраняем данные
        const realText = original.isContentEditable ? original.innerText : original.value;
        fieldMap.set(original, { host, shadowInput, realText });

        // Позиционируем host над оригиналом
        updateHostPosition(original, host);

        // Добавляем host в body
        document.body.appendChild(host);

        // Скрываем оригинал
        original.style.setProperty('opacity', '0', 'important');
        original.style.setProperty('pointer-events', 'none', 'important');
        // Также можно добавить user-select: none для надёжности

        // Настраиваем обработку ввода
        setupInputSync(original, shadowInput);

        // Обработка отправки и Enter
        setupSubmitHandlers(original, shadowInput);

        // Наблюдение за изменениями оригинала
        observeOriginalChanges(original, host, shadowInput);

        // Перенаправление фокуса
        setupFocusHandling(original, host, shadowInput);
    }

    // --- Копирование атрибутов ---
    function copyAttributes(source, target) {
        const attrs = ['placeholder', 'disabled', 'readOnly', 'maxLength', 'minLength', 'pattern', 'inputMode', 'autocomplete', 'spellcheck', 'autocapitalize', 'autocorrect'];
        attrs.forEach(attr => {
            if (source[attr] !== undefined) {
                if (attr === 'maxLength' && source.maxLength < 0) return;
                if (attr === 'minLength' && source.minLength < 0) return;
                target[attr] = source[attr];
            }
        });
    }

    // --- Копирование вычислимых стилей (только для оформления) ---
    function copyInputStyles(source, target) {
        const styles = window.getComputedStyle(source);
        const props = [
            'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height',
            'color', 'background-color', 'background-image', 'background-size', 'background-repeat',
            'border', 'border-radius', 'padding', 'margin', 'box-sizing', 'text-align', 'text-decoration',
            'text-transform', 'letter-spacing', 'word-spacing', 'white-space', 'word-wrap', 'overflow-wrap',
            'overflow', 'resize', 'box-shadow', 'outline', 'cursor', 'user-select', 'caret-color'
        ];
        props.forEach(prop => {
            const value = styles.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto') {
                target.style.setProperty(prop, value, 'important');
            }
        });
        // Заставляем поле занимать весь хост
        target.style.setProperty('width', '100%', 'important');
        target.style.setProperty('height', '100%', 'important');
        target.style.setProperty('box-sizing', 'border-box', 'important');
    }

    // --- Обновление позиции хоста ---
    function updateHostPosition(original, host) {
        const rect = original.getBoundingClientRect();
        const styles = window.getComputedStyle(original);
        const isFixed = styles.position === 'fixed';

        if (isFixed) {
            host.style.setProperty('position', 'fixed', 'important');
            host.style.setProperty('top', rect.top + 'px', 'important');
            host.style.setProperty('left', rect.left + 'px', 'important');
        } else {
            host.style.setProperty('position', 'absolute', 'important');
            host.style.setProperty('top', (rect.top + window.scrollY) + 'px', 'important');
            host.style.setProperty('left', (rect.left + window.scrollX) + 'px', 'important');
        }
        host.style.setProperty('width', rect.width + 'px', 'important');
        host.style.setProperty('height', rect.height + 'px', 'important');
    }

    // --- Синхронизация ввода ---
    function setupInputSync(original, shadowInput) {
        shadowInput.addEventListener('input', () => {
            const data = fieldMap.get(original);
            if (data) {
                data.realText = original.isContentEditable ? shadowInput.innerText : shadowInput.value;
            }
        });
    }

    // --- Обработка отправки и Enter ---
    function setupSubmitHandlers(original, shadowInput) {
        // Enter для одиночных полей (не в форме)
        shadowInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const form = original.closest('form');
                if (!form) {
                    e.preventDefault();
                    e.stopPropagation();
                    submitEncrypted(original);
                }
            }
        });

        // Перехват submit формы
        const form = original.closest('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                const data = fieldMap.get(original);
                if (data) {
                    if (config.encryptEnabled && config.encryptKey) {
                        original.value = encryptMessage(data.realText, config.encryptKey);
                    } else {
                        original.value = data.realText;
                    }
                }
            }, { capture: true }); // Важно: перехватываем до других обработчиков
        }
    }

    // --- Обработка фокуса ---
    function setupFocusHandling(original, host, shadowInput) {
        // Клик по хосту → фокус на shadowInput
        host.addEventListener('click', () => {
            shadowInput.focus();
        });

        // Если сайт программно фокусирует оригинал, перенаправляем
        original.addEventListener('focus', () => {
            shadowInput.focus();
        });
    }

    // --- Наблюдение за изменениями оригинала ---
    function observeOriginalChanges(original, host, shadowInput) {
        // Изменения атрибутов
        const attrObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    const attr = mutation.attributeName;
                    if (attr === 'placeholder') {
                        shadowInput.placeholder = original.placeholder;
                    } else if (attr === 'disabled') {
                        shadowInput.disabled = original.disabled;
                    } else if (attr === 'readonly') {
                        shadowInput.readOnly = original.readOnly;
                    } else if (attr === 'value') {
                        if (!original.isContentEditable) {
                            shadowInput.value = original.value;
                            const data = fieldMap.get(original);
                            if (data) data.realText = original.value;
                        }
                    } else if (attr === 'style') {
                        updateHostPosition(original, host);
                        copyInputStyles(original, shadowInput);
                    }
                }
            });
        });
        attrObserver.observe(original, { attributes: true, attributeFilter: ['placeholder', 'disabled', 'readonly', 'value', 'style'] });

        // Изменения размера/позиции (ResizeObserver)
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                updateHostPosition(original, host);
            });
            resizeObserver.observe(original);
            resizeObserver.observe(original.parentElement);
        }

        // Прокрутка и ресайз окна
        window.addEventListener('scroll', () => {
            updateHostPosition(original, host);
        }, { passive: true, capture: true });
        window.addEventListener('resize', () => {
            updateHostPosition(original, host);
        }, { passive: true });
    }

    // ==================== ОТПРАВКА ЗАШИФРОВАННЫХ ДАННЫХ ====================
    function submitEncrypted(original) {
        const data = fieldMap.get(original);
        if (!data) return;

        if (config.encryptEnabled && config.encryptKey) {
            const encrypted = encryptMessage(data.realText, config.encryptKey);
            if (original.isContentEditable) {
                original.innerText = encrypted;
            } else {
                original.value = encrypted;
            }
        } else {
            if (original.isContentEditable) {
                original.innerText = data.realText;
            } else {
                original.value = data.realText;
            }
        }

        const form = original.closest('form');
        const submitBtn = form?.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
            submitBtn.click();
        } else if (form) {
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.submit();
            }
        } else {
            original.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Очищаем поле после отправки
        setTimeout(() => {
            if (original.isContentEditable) {
                data.shadowInput.innerText = '';
            } else {
                data.shadowInput.value = '';
            }
            data.realText = '';
        }, 100);
    }

    // ==================== ШИФРОВАНИЕ (оставлено как есть) ====================
    // Предполагается, что следующие модули определены в глобальной области:
    // encryptModule, premodule, base64module, headerModule, storage
    function encryptMessage(text, password) {
        encryptModule.generateKey(new TextEncoder().encode(password), 'global');
        const prepared = premodule.prepare(new TextEncoder().encode(text));
        const encrypted = encryptModule.encrypt(prepared, storage.getKey('global'));
        const b64 = base64module.toBase64(encrypted.encrypted);
        return headerModule.addHeader(b64.message);
    }

    // ==================== РАСШИФРОВКА (оставлено как есть) ====================
    function observeDecryption() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && !node.hasAttribute('data-encrypt-overlay')) {
                            node.querySelectorAll('*').forEach(el => {
                                Array.from(el.childNodes).forEach(child => {
                                    if (child.nodeType === Node.TEXT_NODE) decryptNode(child);
                                });
                            });
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            decryptNode(node);
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    decryptNode(mutation.target);
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        document.body.querySelectorAll('*').forEach(el => {
            Array.from(el.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) decryptNode(node);
            });
        });
    }

    function decryptNode(textNode) {
        if (!config.decryptEnabled || !config.decryptKey) return;
        const text = textNode.textContent;
        const headerCheck = headerModule.checkHeader(text);
        if (!headerCheck.result) return;

        try {
            const decoded = base64module.fromBase64(headerCheck.message);
            if (!decoded.result) return;

            encryptModule.generateKey(new TextEncoder().encode(config.decryptKey), 'global');
            encryptModule.prepareForDecryption(headerCheck, 'global');
            const decrypted = encryptModule.decrypt(decoded.bytes, storage.getKey('global'));
            if (!decrypted.result) return;

            const checked = premodule.check(decrypted.decrypted);
            if (!checked) return;

            const plainText = new TextDecoder().decode(checked);
            textNode.textContent = plainText;
        } catch (e) {}
    }
})();