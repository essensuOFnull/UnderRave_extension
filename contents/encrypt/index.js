// contents/encrypt/index.js
(function() {
    let config = {
        encryptKey: '',
        decryptKey: '',
        encryptEnabled: true,
        decryptEnabled: true
    };

    const replacedFields = new WeakMap(); // original -> { clone, value }

    // Загружаем настройки
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
        if (config.encryptEnabled) {
            observeInputs();
        }
        if (config.decryptEnabled) {
            observeDecryption();
        }
    }

    // ---------- ЗАМЕНА ПОЛЕЙ ВВОДА ----------
    function observeInputs() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        findInputs(node).forEach(replaceInput);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Обрабатываем уже существующие поля
        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')
            .forEach(replaceInput);
    }

    function findInputs(root) {
        const inputs = [];
        if (root.matches && root.matches('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')) {
            if (!root.hasAttribute('data-encrypt-clone')) {
                inputs.push(root);
            }
        }
        root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')
            .forEach(el => {
                if (!el.hasAttribute('data-encrypt-clone')) {
                    inputs.push(el);
                }
            });
        return inputs;
    }

    function replaceInput(original) {
        if (replacedFields.has(original)) return;

        // Создаём клон
        let clone;
        if (original.isContentEditable) {
            clone = document.createElement('div');
            clone.contentEditable = 'true';
            clone.innerText = original.innerText;
        } else if (original.tagName === 'TEXTAREA') {
            clone = document.createElement('textarea');
            clone.value = original.value;
        } else {
            clone = document.createElement('input');
            clone.type = original.type || 'text';
            clone.value = original.value;
        }

        // Копируем все атрибуты, кроме тех, что могут вызвать проблемы
        Array.from(original.attributes).forEach(attr => {
            if (attr.name !== 'id' && attr.name !== 'name') { // id и name могут быть уникальны, но оставляем как есть
                clone.setAttribute(attr.name, attr.value);
            }
        });
        // Если нужно сохранить id/name, можно скопировать, но тогда надо убедиться, что они уникальны.
        // Для простоты копируем всё, но при конфликтах id можно добавить суффикс.
        // Однако большинство сайтов не используют id для критических скриптов, кроме как для форм.
        // Лучше скопировать id, но если он уже есть у другого элемента – это проблема, но маловероятно.
        // Для надёжности скопируем все, включая id и name.
        clone.id = original.id; // возможно дублирование, но оригинал скрыт
        clone.name = original.name;

        // Копируем классы
        clone.className = original.className;

        // Копируем inline стили (если есть)
        if (original.style.length > 0) {
            clone.style.cssText = original.style.cssText;
        }

        // Копируем вычисленные стили (чтобы клон выглядел так же, даже если стили заданы через классы)
        const computed = window.getComputedStyle(original);
        // Применяем все вычисленные стили как inline, чтобы переопределить возможные классы
        // Но не все стили нужно копировать, только те, что влияют на внешний вид и размеры.
        // Можно скопировать все, но это может быть избыточно. Для простоты скопируем ключевые.
        const styleProps = [
            'font-family', 'font-size', 'font-weight', 'font-style', 'color', 'background-color',
            'border', 'border-radius', 'padding', 'margin', 'width', 'height',
            'line-height', 'text-align', 'box-shadow', 'outline', 'box-sizing',
            'display', 'position', 'top', 'left', 'right', 'bottom', 'float', 'clear',
            'vertical-align', 'white-space', 'word-wrap', 'overflow', 'text-overflow'
        ];
        styleProps.forEach(prop => {
            const val = computed.getPropertyValue(prop);
            if (val && val !== '') {
                clone.style.setProperty(prop, val, computed.getPropertyPriority(prop));
            }
        });

        // Помечаем клон, чтобы не обрабатывать его повторно
        clone.setAttribute('data-encrypt-clone', 'true');

        // Вставляем клон сразу после оригинала
        original.insertAdjacentElement('afterend', clone);

        // Скрываем оригинал
        original.style.display = 'none';

        // Сохраняем связь
        replacedFields.set(original, { clone, value: original.value });

        // Синхронизируем ввод
        const eventType = original.isContentEditable ? 'input' : 'input';
        clone.addEventListener(eventType, () => {
            const data = replacedFields.get(original);
            if (data) {
                if (original.isContentEditable) {
                    data.value = clone.innerText;
                } else {
                    data.value = clone.value;
                }
            }
        });

        // Обработка отправки
        setupSubmitHandler(original);
    }

    function setupSubmitHandler(original) {
        const form = original.closest('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                const data = replacedFields.get(original);
                if (data && config.encryptEnabled && config.encryptKey) {
                    original.value = encryptMessage(data.value, config.encryptKey);
                }
            }, { capture: true });
        } else {
            const clone = replacedFields.get(original).clone;
            clone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (original.tagName === 'INPUT' || (original.tagName === 'TEXTAREA' && e.ctrlKey))) {
                    e.preventDefault();
                    const submitBtn = findSubmitButton(original);
                    if (submitBtn) {
                        const data = replacedFields.get(original);
                        if (data && config.encryptEnabled && config.encryptKey) {
                            original.value = encryptMessage(data.value, config.encryptKey);
                        }
                        submitBtn.click();
                    } else {
                        const data = replacedFields.get(original);
                        if (data && config.encryptEnabled && config.encryptKey) {
                            original.value = encryptMessage(data.value, config.encryptKey);
                            original.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            });
        }
    }

    function findSubmitButton(field) {
        const parent = field.parentElement;
        if (parent) {
            const btn = parent.querySelector('button[type="submit"], input[type="submit"], button.submit, button.send');
            if (btn) return btn;
        }
        const siblings = field.parentElement?.children;
        if (siblings) {
            for (let sibling of siblings) {
                if (sibling.matches && sibling.matches('button[type="submit"], input[type="submit"], button.submit, button.send')) {
                    return sibling;
                }
            }
        }
        return null;
    }

    function encryptMessage(text, password) {
        encryptModule.generateKey(new TextEncoder().encode(password), 'global');
        const prepared = premodule.prepare(new TextEncoder().encode(text));
        const encrypted = encryptModule.encrypt(prepared, storage.getKey('global'));
        const b64 = base64module.toBase64(encrypted.encrypted);
        return headerModule.addHeader(b64.message);
    }

    // ---------- РАСШИФРОВКА ----------
    function observeDecryption() {
        const decryptObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            decryptNode(node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            node.querySelectorAll('*').forEach(el => {
                                Array.from(el.childNodes).forEach(child => {
                                    if (child.nodeType === Node.TEXT_NODE) decryptNode(child);
                                });
                            });
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    decryptNode(mutation.target);
                }
            });
        });

        decryptObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

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