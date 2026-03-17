// navigation.js
(function() {
    const tabs = [
        { id: 'features', name: '✨ Возможности', url: 'popups/features/index.html' },
        { id: 'context_menu', name: '🖱️ Контекстное меню', url: 'popups/context_menu/index.html' },
        { id: 'lifting_restrictions', name: '🔓 Снятие ограничений', url: 'popups/lifting_restrictions/index.html' },
        { id: 'tv', name: '📺 Русское ТВ', url: 'popups/tv/index.html' },
        { id: 'media_mixer', name: '🎬 Микшер', url: 'popups/media_mixer/index.html' },
        { id: 'encryption', name: '🔐 Шифрование', url: 'popups/encryption/index.html' }
    ];

    // Текущий путь
    const currentPath = window.location.pathname;
    const activeTab = tabs.find(tab => currentPath.endsWith(tab.url)) || tabs[0];

    // Создаём панель
    const nav = document.createElement('nav');
    nav.className = 'tab-navigation';
    const ul = document.createElement('ul');
    ul.className = 'tabs';
    tabs.forEach(tab => {
        const li = document.createElement('li');
        li.className = 'tab';
        if (tab === activeTab) li.classList.add('active');
        const a = document.createElement('a');
        a.href = chrome.runtime.getURL(tab.url);
        a.textContent = tab.name;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = a.href;
        });
        li.appendChild(a);
        ul.appendChild(li);
    });
    nav.appendChild(ul);
    document.body.prepend(nav);

    // Добавляем стили, если их нет
    if (!document.getElementById('tab-navigation-styles')) {
        const style = document.createElement('style');
        style.id = 'tab-navigation-styles';
        style.textContent = `
            .tab-navigation {
                background: #f5f7fa;
                border-bottom: 2px solid #e2e8f0;
                padding: 0.75rem 2rem;
                margin-bottom: 2rem;
            }
            .tab-navigation .tabs {
                display: flex;
                gap: 0.75rem;
                list-style: none;
                margin: 0;
                padding: 0;
            }
            .tab-navigation .tab a {
                display: block;
                padding: 0.6rem 1.5rem;
                border: none;
                background: transparent;
                color: #4a5568;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                border-radius: 30px;
                transition: all 0.2s ease;
                text-decoration: none;
            }
            .tab-navigation .tab a:hover {
                background: #e2e8f0;
                color: #1e293b;
            }
            .tab-navigation .tab.active a {
                background: #1e293b;
                color: white;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }
            body.fullscreen-mode .tab-navigation {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }
})();