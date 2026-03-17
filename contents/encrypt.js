(function() {
    'use strict';

    // ==================== Проверка зависимостей ====================
    // Эти библиотеки должны быть загружены до этого скрипта:
    // - aesjs (объект aesjs)
    // - scrypt (функция scrypt)
    // - sha256 (объект sha256 с методом array)
    // - base64js (объект base64js с методами fromByteArray/toByteArray)
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
                // 0.2, 0.3, 0.4
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
            const len = toInt32(array.slice(0, 4));
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
    let extensionConfig = {
        encryptKey: '',
        decryptKey: '',
        encryptEnabled: true,
        decryptEnabled: true,
        protectInput: true
    };
    const fieldData = new WeakMap();
    let inputObserver = null;
    let decryptObserver = null;

    // Загрузка настроек
    chrome.storage.local.get(['encryptKey', 'decryptKey', 'encryptEnabled', 'decryptEnabled', 'protectInput'], (result) => {
        extensionConfig = { ...extensionConfig, ...result };
        if (!extensionConfig.decryptKey && extensionConfig.encryptKey) {
            extensionConfig.decryptKey = extensionConfig.encryptKey;
        }
        startObservers();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.encryptKey) extensionConfig.encryptKey = changes.encryptKey.newValue;
        if (changes.decryptKey) {
            extensionConfig.decryptKey = changes.decryptKey.newValue;
        } else if (changes.encryptKey && !extensionConfig.decryptKey) {
            extensionConfig.decryptKey = changes.encryptKey.newValue;
        }
        if (changes.encryptEnabled) extensionConfig.encryptEnabled = changes.encryptEnabled.newValue;
        if (changes.decryptEnabled) extensionConfig.decryptEnabled = changes.decryptEnabled.newValue;
        if (changes.protectInput) extensionConfig.protectInput = changes.protectInput.newValue;
    });

    function startObservers() {
        if (extensionConfig.encryptEnabled) startInputObserver();
        if (extensionConfig.decryptEnabled) startDecryptObserver();
    }

    function startInputObserver() {
        if (inputObserver) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startInputObserver);
            return;
        }

        inputObserver = new MutationObserver((mutations) => {
            if (!extensionConfig.encryptEnabled) return;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        findInputs(node).forEach(setupInputHandler);
                    }
                });
            });
        });
        inputObserver.observe(document.body, { childList: true, subtree: true });

        // Обработка уже существующих полей
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
        if (fieldData.has(field) || !extensionConfig.encryptEnabled) return;
        if (field.hasAttribute('data-encrypt-input')) return;
        field.setAttribute('data-encrypt-input', 'true');

        const isContentEditable = field.isContentEditable || field.getAttribute('contenteditable') === 'true';
        const initialText = isContentEditable ? field.innerText : field.value;
        fieldData.set(field, { realText: initialText, isContentEditable });

        field.addEventListener('keydown', handleKeyDown, { capture: true });

        if (extensionConfig.protectInput && !isContentEditable) {
            field.addEventListener('beforeinput', (e) => {
                if (e.inputType !== 'insertReplacementText') e.preventDefault();
            }, { capture: true });
            field.addEventListener('paste', handlePaste, { capture: true });
            field.addEventListener('cut', handleCut, { capture: true });
            field.addEventListener('drop', handleDrop, { capture: true });
        } else {
            field.addEventListener('input', (e) => {
                const data = fieldData.get(field);
                if (data) data.realText = isContentEditable ? field.innerText : field.value;
            }, { capture: true });
        }

        field.addEventListener('change', (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
        }, { capture: true });
    }

    function handleKeyDown(e) {
        const field = e.currentTarget;
        const data = fieldData.get(field);
        if (!data) return;

        if (e.key === 'Enter' && !e.shiftKey) {
            let textToEncrypt;
            if (extensionConfig.protectInput) {
                textToEncrypt = data.realText;
            } else {
                textToEncrypt = data.isContentEditable ? field.innerText : field.value;
            }

            if (!extensionConfig.encryptKey) {
                console.warn('Encrypt key not set, message sent as plaintext');
                return; // ничего не делаем, пусть отправляется как есть
            }

            const encrypted = encryptMessage(textToEncrypt, extensionConfig.encryptKey);
            if (data.isContentEditable) {
                field.innerText = encrypted;
            } else {
                field.value = encrypted;
            }

            if (extensionConfig.protectInput) {
                data.realText = ''; // очищаем сохранённый текст
            } else {
                // обновляем realText, чтобы он соответствовал полю
                data.realText = encrypted;
            }
            // Не блокируем событие, чтобы форма отправилась
            return;
        }

        if (!extensionConfig.protectInput) return;
        if (data.isContentEditable) return;

        // Блокируем только клавиши, изменяющие текст
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
    }

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
        e.preventDefault();
    }

    function encryptMessage(text, password) {
        try {
            encryptModule.generateKey(new TextEncoder().encode(password), 'global');
            encryptModule.prepareForEncryption();
            const prepared = premodule.prepare(new TextEncoder().encode(text));
            const encrypted = encryptModule.encrypt(prepared, storage.getKey('global'));
            if (!encrypted.result) throw new Error('Encryption failed');
            const b64 = base64module.toBase64(encrypted.encrypted);
            return headerModule.addHeader(b64.message);
        } catch (e) {
            console.error('Encryption error', e);
            return text;
        }
    }

    function startDecryptObserver() {
        if (decryptObserver) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startDecryptObserver);
            return;
        }

        decryptObserver = new MutationObserver((mutations) => {
            if (!extensionConfig.decryptEnabled || !extensionConfig.decryptKey) return;
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
        if (!extensionConfig.decryptEnabled || !extensionConfig.decryptKey) return;
        const text = textNode.textContent;

        const headerCheck = headerModule.checkHeader(text);
        if (!headerCheck.result) return;

        try {
            const decoded = base64module.fromBase64(headerCheck.message);
            if (!decoded.result) return;

            encryptModule.generateKey(new TextEncoder().encode(extensionConfig.decryptKey), 'global');
            encryptModule.prepareForDecryption(headerCheck);
            const decrypted = encryptModule.decrypt(decoded.bytes, storage.getKey('global'));
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
        } catch (e) {
            console.error('Decryption error', e);
        }
    }

    // Экспорт для отладки
    window.VKEncrypt = { config: extensionConfig, encryptMessage, decryptNodeWithShadow };
})();