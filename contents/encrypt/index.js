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
        decryptEnabled: true,
        protectInput: true // новая опция
    };
    const fieldData = new WeakMap(); // поле -> { realText, isContentEditable, handlers }

    let inputObserver = null;
    let decryptObserver = null;

    // Загрузка настроек
    chrome.storage.local.get(['encryptKey', 'decryptKey', 'encryptEnabled', 'decryptEnabled', 'protectInput'], (result) => {
        config = { ...config, ...result };
        startObservers();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.encryptKey) config.encryptKey = changes.encryptKey.newValue;
        if (changes.decryptKey) config.decryptKey = changes.decryptKey.newValue;
        if (changes.encryptEnabled) config.encryptEnabled = changes.encryptEnabled.newValue;
        if (changes.decryptEnabled) config.decryptEnabled = changes.decryptEnabled.newValue;
        if (changes.protectInput) config.protectInput = changes.protectInput.newValue;

        // При изменении protectInput можно переинициализировать поля (здесь не реализовано для простоты)
    });

    function startObservers() {
        if (config.encryptEnabled) startInputObserver();
        if (config.decryptEnabled) startDecryptObserver();
    }

    // ==================== НАБЛЮДЕНИЕ ЗА ПОЛЯМИ ВВОДА ====================
    function startInputObserver() {
        if (inputObserver) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startInputObserver);
            return;
        }

        inputObserver = new MutationObserver((mutations) => {
            if (!config.encryptEnabled) return;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        findInputs(node).forEach(setupInputHandler);
                    }
                });
            });
        });
        inputObserver.observe(document.body, { childList: true, subtree: true });

        document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]')
            .forEach(setupInputHandler);
    }

    function findInputs(root) {
        const inputs = [];
        const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';
        if (root.matches && root.matches(selector) && !fieldData.has(root) && !root.hasAttribute('data-encrypt-input')) {
            inputs.push(root);
        }
        root.querySelectorAll(selector).forEach(el => {
            if (!fieldData.has(el) && !el.hasAttribute('data-encrypt-input')) {
                inputs.push(el);
            }
        });
        return inputs;
    }

    // ==================== НАСТРОЙКА ПОЛЯ ====================
    function setupInputHandler(field) {
        if (fieldData.has(field) || !config.encryptEnabled) return;
        if (field.hasAttribute('data-encrypt-input')) return;
        field.setAttribute('data-encrypt-input', 'true');

        const isContentEditable = field.isContentEditable || field.getAttribute('contenteditable') === 'true';

        // Сохраняем начальный текст (для protectInput)
        const initialText = isContentEditable ? field.innerText : field.value;
        fieldData.set(field, {
            realText: initialText,
            isContentEditable
        });

        // Всегда вешаем обработчик Enter (нужен для отправки)
        field.addEventListener('keydown', handleKeyDown, { capture: true });

        // Если защита ввода включена — блокируем все изменения
        if (config.protectInput) {
            if (!isContentEditable) {
                field.addEventListener('beforeinput', (e) => {
                    if (e.inputType !== 'insertReplacementText') {
                        e.preventDefault();
                    }
                }, { capture: true });
                field.addEventListener('paste', handlePaste, { capture: true });
                field.addEventListener('cut', handleCut, { capture: true });
                field.addEventListener('drop', handleDrop, { capture: true });
            }
        } else {
            // Без защиты — разрешаем обычный ввод, но отслеживаем изменения через input
            field.addEventListener('input', (e) => {
                const data = fieldData.get(field);
                if (data) {
                    data.realText = isContentEditable ? field.innerText : field.value;
                }
            }, { capture: true });
        }

        // Полностью отключаем событие change (нам не нужно)
        field.addEventListener('change', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
        }, { capture: true });
    }

    // ==================== ОБРАБОТКА КЛАВИШ ====================
    function handleKeyDown(e) {
        const field = e.currentTarget;
        const data = fieldData.get(field);
        if (!data) return;

        // Enter без Shift — отправка
        if (e.key === 'Enter' && !e.shiftKey) {
            let textToEncrypt;
            if (config.protectInput) {
                textToEncrypt = data.realText;
            } else {
                textToEncrypt = data.isContentEditable ? field.innerText : field.value;
            }

            const encrypted = encryptMessage(textToEncrypt, config.encryptKey);
            if (data.isContentEditable) {
                field.innerText = encrypted;
            } else {
                field.value = encrypted;
            }

            // Очищаем сохранённый текст, если защита включена
            if (config.protectInput) {
                data.realText = '';
            }
            return; // не блокируем — событие уходит дальше, форма отправится
        }

        // Если защита отключена — пропускаем все остальные клавиши без блокировки
        if (!config.protectInput) return;

        // Защита включена — блокируем и обрабатываем ввод для input/textarea
        if (data.isContentEditable) {
            // Для contenteditable ничего не блокируем, но обновляем realText через input (уже есть)
            return;
        }

        // Блокируем только клавиши, изменяющие текст
        const isModifier = e.ctrlKey || e.altKey || e.metaKey;
        const isNavigation = e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown';
        const isSystem = isModifier || isNavigation || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'CapsLock' || e.key === 'Tab';

        if (isSystem) return; // не блокируем системные

        e.preventDefault();

        const start = field.selectionStart;
        const end = field.selectionEnd;
        let newText = data.realText;
        let newStart = start, newEnd = end;

        if (e.key === 'Backspace') {
            if (start === end) {
                if (start > 0) {
                    newText = newText.slice(0, start - 1) + newText.slice(end);
                    newStart = start - 1;
                    newEnd = start - 1;
                }
            } else {
                newText = newText.slice(0, start) + newText.slice(end);
                newStart = start;
                newEnd = start;
            }
        } else if (e.key === 'Delete') {
            if (start === end) {
                if (start < newText.length) {
                    newText = newText.slice(0, start) + newText.slice(start + 1);
                    newStart = start;
                    newEnd = start;
                }
            } else {
                newText = newText.slice(0, start) + newText.slice(end);
                newStart = start;
                newEnd = start;
            }
        } else if (e.key.length === 1) {
            const char = e.key;
            newText = newText.slice(0, start) + char + newText.slice(end);
            newStart = start + 1;
            newEnd = start + 1;
        }

        field.value = newText;
        data.realText = newText;
        field.setSelectionRange(newStart, newEnd);
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ОБРАБОТЧИКИ (для protectInput) ====================
    function handlePaste(e) {
        e.preventDefault();
        const field = e.currentTarget;
        const data = fieldData.get(field);
        if (!data) return;

        const text = e.clipboardData.getData('text/plain');
        const start = field.selectionStart;
        const end = field.selectionEnd;

        const newText = data.realText.slice(0, start) + text + data.realText.slice(end);
        const newPos = start + text.length;

        field.value = newText;
        data.realText = newText;
        field.setSelectionRange(newPos, newPos);
    }

    function handleCut(e) {
        e.preventDefault();
        const field = e.currentTarget;
        const data = fieldData.get(field);
        if (!data) return;

        const start = field.selectionStart;
        const end = field.selectionEnd;
        const cutText = data.realText.slice(start, end);
        e.clipboardData.setData('text/plain', cutText);

        const newText = data.realText.slice(0, start) + data.realText.slice(end);
        field.value = newText;
        data.realText = newText;
        field.setSelectionRange(start, start);
    }

    function handleDrop(e) {
        e.preventDefault(); // игнорируем
    }

    // ==================== ШИФРОВАНИЕ ====================
    function encryptMessage(text, password) {
        // Заглушка — замените на реальное шифрование
        try {
            encryptModule.generateKey(new TextEncoder().encode(password), 'global');
            const prepared = premodule.prepare(new TextEncoder().encode(text));
            const encrypted = encryptModule.encrypt(prepared, storage.getKey('global'));
            const b64 = base64module.toBase64(encrypted.encrypted);
            return headerModule.addHeader(b64.message);
        } catch (e) {
            console.error('Encryption failed', e);
            return text;
        }
    }

    // ==================== РАСШИФРОВКА С SHADOW DOM ====================
    function startDecryptObserver() {
        if (decryptObserver) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startDecryptObserver);
            return;
        }

        decryptObserver = new MutationObserver((mutations) => {
            if (!config.decryptEnabled) return;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            node.querySelectorAll('*').forEach(el => {
                                Array.from(el.childNodes).forEach(child => {
                                    if (child.nodeType === Node.TEXT_NODE && !isDecryptedHost(child.parentNode)) {
                                        decryptNodeWithShadow(child);
                                    }
                                });
                            });
                        } else if (node.nodeType === Node.TEXT_NODE && !isDecryptedHost(node.parentNode)) {
                            decryptNodeWithShadow(node);
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    const node = mutation.target;
                    if (!isDecryptedHost(node.parentNode)) {
                        decryptNodeWithShadow(node);
                    }
                }
            });
        });
        decryptObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

        // Обработать существующие узлы
        document.body.querySelectorAll('*').forEach(el => {
            Array.from(el.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && !isDecryptedHost(node.parentNode)) {
                    decryptNodeWithShadow(node);
                }
            });
        });
    }

    function isDecryptedHost(node) {
        return node && node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-decrypted');
    }

    function decryptNodeWithShadow(textNode) {
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

            // Создаём элемент-хост
            const host = document.createElement('span');
            host.setAttribute('data-decrypted', 'true');
            host.style.display = 'inline';
            host.style.all = 'inherit';

            // Закрытый shadow root
            const shadow = host.attachShadow({ mode: 'closed' });
            const textSpan = document.createElement('span');
            textSpan.textContent = plainText;
            textSpan.style.all = 'inherit';
            shadow.appendChild(textSpan);

            // Заменяем текстовый узел
            textNode.parentNode.replaceChild(host, textNode);
        } catch (e) {
            console.error('Decryption error', e);
        }
    }

})();