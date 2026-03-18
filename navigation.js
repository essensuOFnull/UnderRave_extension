// navigation.js
(function() {
    const tabs = [
        { id: 'features', name: '✨ Возможности', url: 'popups/features/index.html' },
        { id: 'context_menu', name: '🖱️ Контекстное меню', url: 'popups/context_menu/index.html' },
        { id: 'lifting_restrictions', name: '🔓 Снятие ограничений', url: 'popups/lifting_restrictions/index.html' },
        { id: 'tv', name: '📺 Русское ТВ', url: 'popups/tv/index.html' },
        { id: 'media_mixer', name: '🎬 Микшер', url: 'popups/media_mixer/manager.html' },
        { id: 'encryption', name: '🔐 Шифрование', url: 'popups/encryption/index.html' },
        { id: 'google', name: '🌐 Google', url: 'popups/google/index.html' }
    ];

    const currentPath = window.location.pathname;
    const activeTab = tabs.find(tab => currentPath.endsWith(tab.url)) || tabs[0];

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
})();