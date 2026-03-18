(function() {
    'use strict';

    // ==================== Проверка зависимостей ====================
    if (typeof aesjs === 'undefined' || typeof scrypt === 'undefined' || typeof sha256 === 'undefined' || typeof base64js === 'undefined') {
        console.error('VKEncrypt: missing required libraries (aesjs, scrypt, sha256, base64js)');
        return;
    }

    // ==================== Утилиты ====================
    window.arrayEquality = function(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    };

    window.toBytesInt32 = function(num, size = 4) {
        const arr = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            arr[i] = (num >> (8 * (size - 1 - i))) & 0xff;
        }
        return arr;
    };

    window.bytesToInt32 = function(bytes) {
        return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    };

    // ==================== Конфигурация ====================
    const config = {
        version: "0.4",
        allowedVersions: ["0.4", "0.3", "0.2", "0.1"]
    };

    // ==================== timeModule ====================
    const timeModule = {
        timestamp: 0,
        seed: 0,
        generateUnixtime: function() {
            this.timestamp = Math.floor(Date.now() / 100);
            return this.timestamp;
        },
        generateSeed: function() {
            this.seed = Math.floor(Math.random() * 4294967296);
            return this.seed;
        },
        getLastUnixtime: function() {
            if (this.timestamp) return this.timestamp;
            return this.generateUnixtime();
        },
        getLastSeed: function() {
            if (this.seed) return this.seed;
            return this.generateSeed();
        }
    };

    // ==================== headerModule ====================
    const headerModule = {
        templates: {
            base: "Encrypted by VKEncrypt, version ",
            date: ", date ",
            seed: ", seed ",
            colon: " : "
        },
        getHeader: function() {
            const ver = config.version;
            if (ver === "0.1") {
                return this.templates.base + "0.1" + this.templates.date + timeModule.getLastUnixtime() + this.templates.colon;
            } else {
                return this.templates.base + ver + this.templates.date + timeModule.getLastUnixtime() + this.templates.seed + timeModule.getLastSeed() + this.templates.colon;
            }
        },
        addHeader: function(message) {
            return this.getHeader() + message;
        },
        checkHeader: function(text) {
            const result = { result: false, version: "", date: "", seed: "", message: "" };
            if (!text || typeof text !== 'string') return result;

            const baseIdx = text.indexOf(this.templates.base);
            if (baseIdx !== 0) return result;

            const dateIdx = text.indexOf(this.templates.date, this.templates.base.length);
            if (dateIdx < 0) return result;
            const version = text.substring(this.templates.base.length, dateIdx);
            if (!config.allowedVersions.includes(version)) return result;

            result.version = version;

            if (version === "0.1") {
                const colonIdx = text.indexOf(this.templates.colon, dateIdx + this.templates.date.length);
                if (colonIdx < 0) return result;
                const dateStr = text.substring(dateIdx + this.templates.date.length, colonIdx);
                if (isNaN(dateStr)) return result;
                result.date = dateStr;
                result.result = true;
                result.message = text.substring(colonIdx + this.templates.colon.length).trim();
            } else {
                const seedIdx = text.indexOf(this.templates.seed, dateIdx + this.templates.date.length);
                if (seedIdx < 0) return result;
                const dateStr = text.substring(dateIdx + this.templates.date.length, seedIdx);
                if (isNaN(dateStr)) return result;
                result.date = dateStr;

                const colonIdx = text.indexOf(this.templates.colon, seedIdx + this.templates.seed.length);
                if (colonIdx < 0) return result;
                const seedStr = text.substring(seedIdx + this.templates.seed.length, colonIdx);
                if (isNaN(seedStr)) return result;
                result.seed = seedStr;

                result.result = true;
                result.message = text.substring(colonIdx + this.templates.colon.length).trim();
            }
            return result;
        }
    };

    // ==================== premodule ====================
    const premodule = {
        prepare: function(array) {
            const messageLength = toBytesInt32(array.length, 4);
            const hash = sha256.array(array);

            let length = messageLength.length + hash.length + array.length;
            if (length % 16 !== 0) length += 16 - (length % 16);

            const result = new Uint8Array(length);
            result.set(messageLength);
            result.set(hash, messageLength.length);
            result.set(array, messageLength.length + hash.length);
            return result;
        },
        check: function(array) {
            const len = bytesToInt32(array.slice(0, 4));
            const message = array.slice(36, 36 + len);
            const hash = array.slice(4, 36);
            const calculated = sha256.array(message);
            return arrayEquality(calculated, hash) ? message : false;
        }
    };

    // ==================== base64module ====================
    const base64module = {
        toBase64: function(bytes) {
            try {
                return { result: true, message: base64js.fromByteArray(bytes), bytes: bytes };
            } catch (e) {
                return { result: false, message: "", bytes: [] };
            }
        },
        fromBase64: function(str) {
            try {
                return { result: true, bytes: base64js.toByteArray(str), message: str };
            } catch (e) {
                return { result: false, bytes: [], message: str };
            }
        }
    };

    // ==================== storage ====================
    const storage = {
        defaultKey: new Uint8Array(32),
        keys: {},
        setDefaultKey: function(key) { this.defaultKey = key; },
        addKey: function(key, path) { this.keys[path] = key; },
        getKey: function(path) { return this.keys[path] || this.defaultKey; }
    };

    // ==================== encryptModule ====================
    const encryptModule = {
        salt: new TextEncoder().encode(""),
        IV: new Uint8Array(16).fill(0),

        generateKey: function(key, path) {
            const N = 1024, r = 8, p = 1, dkLen = 32;
            scrypt(key, this.salt, N, r, p, dkLen, (error, progress, derivedKey) => {
                if (!error && derivedKey) {
                    if (path) storage.addKey(derivedKey, path);
                    else storage.setDefaultKey(derivedKey);
                }
            });
        },

        prepareForEncryption: function() {
            const timestamp = timeModule.generateUnixtime();
            const seed = timeModule.generateSeed();
            let hashInput;
            if (config.version === "0.1") {
                hashInput = "" + timestamp;
            } else {
                hashInput = "" + timestamp + seed;
            }
            const hash = sha256.array(hashInput).slice(0, 16);
            this.IV.set(hash);
        },

        prepareForDecryption: function(header) {
            let hashInput;
            if (header.version === "0.1") {
                hashInput = header.date;
            } else {
                hashInput = header.date + header.seed;
            }
            const hash = sha256.array(hashInput).slice(0, 16);
            this.IV.set(hash);
        },

        encrypt: function(message, key) {
            try {
                const aesCbc = new aesjs.ModeOfOperation.cbc(key, this.IV);
                const encrypted = aesCbc.encrypt(message);
                return { result: true, encrypted: encrypted };
            } catch (e) {
                console.error('encrypt error', e);
                return { result: false, encrypted: [] };
            }
        },

        decrypt: function(message, key) {
            try {
                const aesCbc = new aesjs.ModeOfOperation.cbc(key, this.IV);
                const decrypted = aesCbc.decrypt(message);
                return { result: true, decrypted: decrypted };
            } catch (e) {
                console.error('decrypt error', e);
                return { result: false, decrypted: [] };
            }
        }
    };

    // Инициализация ключа по умолчанию (пустой пароль)
    encryptModule.generateKey(new TextEncoder().encode(""));

    // ==================== Основной код расширения ====================
    const fieldData = new WeakMap();
    let inputObserver = null;
    let decryptObserver = null;

    // ==================== Обработчики событий ====================
    function onKeyDown(e) {
        const field = e.currentTarget;
        const data = fieldData.get(field);
        if (!data) return;

        // --- Обработка Enter (шифрование или просто отправка) ---
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Предотвратим отправку формы, пока не решим

            // Получаем текст для отправки
            let textToSend;
            if (window.extensionConfig.protectInput) {
                textToSend = data.realText;
            } else {
                textToSend = data.isContentEditable ? field.innerText : field.value;
            }

            // Если шифрование включено и есть ключ — шифруем
            if (window.extensionConfig.encryptEnabled && window.extensionConfig.encryptKey) {
                const encrypted = encryptMessage(textToSend, window.extensionConfig.encryptKey);
                if (data.isContentEditable) {
                    field.innerText = encrypted;
                } else {
                    field.value = encrypted;
                }
                // Обновляем realText в зависимости от protectInput
                if (window.extensionConfig.protectInput) {
                    data.realText = '';
                } else {
                    data.realText = encrypted;
                }
            } else {
                // Если шифрование не нужно, просто вставляем текст обратно (он мог измениться из-за protectInput)
                if (data.isContentEditable) {
                    field.innerText = textToSend;
                } else {
                    field.value = textToSend;
                }
                if (window.extensionConfig.protectInput) {
                    data.realText = ''; // защита очищает realText после отправки
                } else {
                    data.realText = textToSend;
                }
            }

            // Отправляем форму (если есть)
            setTimeout(() => {
                const form = field.closest('form');
                if (form) form.submit();
            }, 0);
            return;
        }

        // --- Обработка ввода при включённой защите (только для обычных полей, не contenteditable) ---
        if (window.extensionConfig.protectInput && !data.isContentEditable) {
            const isModifier = e.ctrlKey || e.altKey || e.metaKey;
            const isNavigation = e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown';
            const isSystem = isModifier || isNavigation || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'CapsLock' || e.key === 'Tab';
            if (isSystem) return;

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
            return;
        }
    }

    function onPaste(e) {
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

    function onCut(e) {
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

    function onDrop(e) {
        e.preventDefault();
    }

    function onBeforeInput(e) {
        if (e.inputType !== 'insertReplacementText') e.preventDefault();
    }

    function onInput(e) {
        const field = e.currentTarget;
        const data = fieldData.get(field);
        if (!data) return;
        data.realText = data.isContentEditable ? field.innerText : field.value;
    }

    function onChange(e) {
        e.stopImmediatePropagation();
        e.preventDefault();
    }

    function ensureKey(password, path) {
        if (!password) return;
        encryptModule.generateKey(new TextEncoder().encode(password), path);
    }

    // Единственный вызов для инициализации
    chrome.storage.sync.get(['encryptKey', 'decryptKey', 'encryptEnabled', 'decryptEnabled', 'protectInput'], (result) => {
        window.extensionConfig = { ...window.extensionConfig, ...result };
        if (!window.extensionConfig.decryptKey && window.extensionConfig.encryptKey) {
            window.extensionConfig.decryptKey = window.extensionConfig.encryptKey;
        }
        ensureKey(window.extensionConfig.encryptKey, 'encrypt');
        if (window.extensionConfig.decryptKey && window.extensionConfig.decryptKey !== window.extensionConfig.encryptKey) {
            ensureKey(window.extensionConfig.decryptKey, 'decrypt');
        } else {
            ensureKey(window.extensionConfig.encryptKey, 'decrypt');
        }
        // Запускаем модули после загрузки конфига
        restartInputProtection();
        restartDecryptObserver();
    });

    chrome.storage.onChanged.addListener((changes) => {
        let needsRestartInput = false;
        let needsRestartDecrypt = false;

        if (changes.encryptKey) {
            window.extensionConfig.encryptKey = changes.encryptKey.newValue;
            ensureKey(window.extensionConfig.encryptKey, 'encrypt');
        }
        if (changes.decryptKey) {
            window.extensionConfig.decryptKey = changes.decryptKey.newValue;
            ensureKey(window.extensionConfig.decryptKey, 'decrypt');
            needsRestartDecrypt = true;
        } else if (changes.encryptKey && !window.extensionConfig.decryptKey) {
            window.extensionConfig.decryptKey = changes.encryptKey.newValue;
            ensureKey(window.extensionConfig.decryptKey, 'decrypt');
            needsRestartDecrypt = true;
        }
        if (changes.encryptEnabled) {
            window.extensionConfig.encryptEnabled = changes.encryptEnabled.newValue;
            needsRestartInput = true;
        }
        if (changes.decryptEnabled) {
            window.extensionConfig.decryptEnabled = changes.decryptEnabled.newValue;
            needsRestartDecrypt = true;
        }
        if (changes.protectInput) {
            window.extensionConfig.protectInput = changes.protectInput.newValue;
            needsRestartInput = true;
        }

        if (needsRestartInput) {
            restartInputProtection();
        }
        if (needsRestartDecrypt) {
            restartDecryptObserver();
        }
    });

    // -------------------- Шифрование (ввод) --------------------
    function startInputObserver() {
        if (inputObserver) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startInputObserver);
            return;
        }

        inputObserver = new MutationObserver((mutations) => {
            // Observer работает всегда, независимо от настроек,
            // но setupInputHandler внутри уже проверит, нужно ли что-то делать
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        findInputs(node).forEach(setupInputHandler);
                    }
                });
            });
        });
        inputObserver.observe(document.body, { childList: true, subtree: true });

        // Обрабатываем уже существующие поля
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
            if (!fieldData.has(el) && !el.hasAttribute('data-encrypt-input')) inputs.push(el);
        });
        return inputs;
    }

    function setupInputHandler(field) {
        // Если ни одна функция не нужна, просто очищаем поле
        if (!window.extensionConfig.encryptEnabled && !window.extensionConfig.protectInput) {
            removeAllListeners(field);
            fieldData.delete(field);
            field.removeAttribute('data-encrypt-input');
            return;
        }

        // Помечаем поле, чтобы не обрабатывать повторно в findInputs
        field.setAttribute('data-encrypt-input', 'true');

        const isContentEditable = field.isContentEditable || field.getAttribute('contenteditable') === 'true';
        let data = fieldData.get(field);
        if (!data) {
            const initialText = isContentEditable ? field.innerText : field.value;
            data = { realText: initialText, isContentEditable };
            fieldData.set(field, data);
        }

        // Удаляем все старые обработчики
        removeAllListeners(field);

        // Всегда добавляем keydown, потому что он нужен и для Enter, и для защиты
        field.addEventListener('keydown', onKeyDown, { capture: true });

        // Специфичные для защиты обработчики (только для обычных полей ввода)
        if (window.extensionConfig.protectInput && !isContentEditable) {
            field.addEventListener('beforeinput', onBeforeInput, { capture: true });
            field.addEventListener('paste', onPaste, { capture: true });
            field.addEventListener('cut', onCut, { capture: true });
            field.addEventListener('drop', onDrop, { capture: true });
        } else {
            // Если защита выключена или поле contenteditable, то обновляем realText через input
            field.addEventListener('input', onInput, { capture: true });
        }

        // Всегда блокируем событие change
        field.addEventListener('change', onChange, { capture: true });
    }

    function removeAllListeners(field) {
        const events = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'input', 'change'];
        events.forEach(event => {
            field.removeEventListener(event, onKeyDown, { capture: true });
            field.removeEventListener(event, onBeforeInput, { capture: true });
            field.removeEventListener(event, onPaste, { capture: true });
            field.removeEventListener(event, onCut, { capture: true });
            field.removeEventListener(event, onDrop, { capture: true });
            field.removeEventListener(event, onInput, { capture: true });
            field.removeEventListener(event, onChange, { capture: true });
        });
    }

    function encryptMessage(text, password) {
        try {
            encryptModule.generateKey(new TextEncoder().encode(password), 'encrypt');
            encryptModule.prepareForEncryption();
            const prepared = premodule.prepare(new TextEncoder().encode(text));
            const encrypted = encryptModule.encrypt(prepared, storage.getKey('encrypt'));
            if (!encrypted.result) throw new Error('Encryption failed');
            const b64 = base64module.toBase64(encrypted.encrypted);
            return headerModule.addHeader(b64.message);
        } catch (e) {
            console.error('Encryption error', e);
            return text;
        }
    }

    // -------------------- Расшифровка (вывод) --------------------
    function startDecryptObserver() {
        if (decryptObserver) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startDecryptObserver);
            return;
        }

        decryptObserver = new MutationObserver((mutations) => {
            if (!window.extensionConfig.decryptEnabled || !window.extensionConfig.decryptKey) return;
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
                    if (!isDecryptedHost(node.parentNode)) decryptNodeWithShadow(node);
                }
            });
        });
        decryptObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

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
        if (!window.extensionConfig.decryptEnabled || !window.extensionConfig.decryptKey) return;

        // Не расшифровываем внутри полей ввода
        if (textNode.parentNode && textNode.parentNode.hasAttribute('data-encrypt-input')) return;

        const text = textNode.textContent;
        const headerCheck = headerModule.checkHeader(text);
        if (!headerCheck.result) return;

        const decoded = base64module.fromBase64(headerCheck.message);
        if (!decoded.result) return;

        let key = storage.getKey('decrypt');
        const defaultKey = storage.defaultKey;
        const isKeyDefault = key.length === defaultKey.length && key.every((val, i) => val === defaultKey[i]);

        if (isKeyDefault) {
            console.log('VKEncrypt: decrypt key not ready, retrying in 200ms');
            ensureKey(window.extensionConfig.decryptKey, 'decrypt');
            setTimeout(() => {
                if (textNode.parentNode) {
                    decryptNodeWithShadow(textNode);
                }
            }, 200);
            return;
        }

        encryptModule.prepareForDecryption(headerCheck);
        const decrypted = encryptModule.decrypt(decoded.bytes, key);
        if (!decrypted.result) return;

        const checked = premodule.check(decrypted.decrypted);
        if (!checked) return;

        const plainText = new TextDecoder().decode(checked);

        const host = document.createElement('span');
        host.setAttribute('data-decrypted', 'true');
        host.style.display = 'inline';
        host.style.all = 'inherit';

        const shadow = host.attachShadow({ mode: 'closed' });
        const textSpan = document.createElement('span');
        textSpan.textContent = plainText;
        textSpan.style.all = 'inherit';
        shadow.appendChild(textSpan);

        textNode.parentNode.replaceChild(host, textNode);
    }

    function restartInputProtection() {
        const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]';
        const fields = document.querySelectorAll(selector);

        if (window.extensionConfig.protectInput || window.extensionConfig.encryptEnabled) {
            // Убедимся, что observer запущен (он нужен для новых полей)
            if (!inputObserver) startInputObserver();
            // Обновим обработчики на всех существующих полях
            fields.forEach(field => setupInputHandler(field));
        } else {
            // Если ничего не включено – останавливаем observer и удаляем все наши обработчики
            if (inputObserver) {
                inputObserver.disconnect();
                inputObserver = null;
            }
            fields.forEach(field => {
                removeAllListeners(field);
                fieldData.delete(field);
                field.removeAttribute('data-encrypt-input');
            });
        }
    }

    function restartDecryptObserver() {
        if (window.extensionConfig.decryptEnabled) {
            if (!decryptObserver) startDecryptObserver();
            // Можно перезапустить декодирование уже существующего текста, но observer обработает новые узлы
        } else {
            if (decryptObserver) {
                decryptObserver.disconnect();
                decryptObserver = null;
            }
            // Убираем все ранее расшифрованные блоки
            document.querySelectorAll('[data-decrypted]').forEach(el => {
                const textNode = document.createTextNode(el.shadowRoot?.textContent || '');
                el.parentNode?.replaceChild(textNode, el);
            });
        }
    }
})();