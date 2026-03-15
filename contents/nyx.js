// contents/nyx.js
// lib/png-encoder.js
console.log('nyx.js: START');

// Устанавливаем viewport для мобильных устройств, если его нет
if (!document.querySelector('meta[name="viewport"]')) {
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1.0';
  document.head.appendChild(meta);
}
async function encodeFileToPNG(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  const bytesPerPixel = 3;
  const totalPixels = Math.ceil(bytes.length / bytesPerPixel);
  const width = Math.ceil(Math.sqrt(totalPixels));
  const height = Math.ceil(totalPixels / width);
  
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  const view = new DataView(data.buffer);
  view.setBigUint64(0, BigInt(bytes.length), true);
  
  for (let i = 0; i < bytes.length; i++) {
    data[8 + i] = bytes[i];
  }
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }
  
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const newFileName = file.name + '.png';
  return new File([blob], newFileName, { type: 'image/png' });
}

async function decodeFromImageBlob(pngBlob, originalFileName) {
  const bitmap = await createImageBitmap(pngBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const data = imageData.data;
  const view = new DataView(data.buffer);
  const length = Number(view.getBigUint64(0, true));
  const fileBytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    fileBytes[i] = data[8 + i];
  }
  return new File([fileBytes], originalFileName, { type: 'application/octet-stream' });
}
// Внедряем CSS для кнопки
const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = chrome.runtime.getURL('styles/nyx.css');
document.head.appendChild(style);

// Глобальное хранилище для связи data URL -> оригинальное имя файла
window._nyxEncodedMap = new Map();

// --- Перехват FileReader ---
const originalReadAsDataURL = FileReader.prototype.readAsDataURL;

FileReader.prototype.readAsDataURL = function(blob) {
  // Если это файл не-изображение
  if (blob instanceof File && !blob.type.startsWith('image/')) {
    console.log('FileReader перехватил не-изображение:', blob.name);
    const originalOnLoad = this.onload;
    const reader = this;
    const originalName = blob.name;

    encodeFileToPNG(blob).then(encodedFile => {
      // Устанавливаем временный onload для сохранения data URL
      reader.onload = function(e) {
        const dataUrl = e.target.result;
        window._nyxEncodedMap.set(dataUrl, originalName);
        // Вызываем оригинальный обработчик, если он был
        if (originalOnLoad) originalOnLoad.call(reader, e);
      };
      originalReadAsDataURL.call(reader, encodedFile);
    }).catch(err => {
      console.error('Ошибка кодирования, используем оригинал', err);
      originalReadAsDataURL.call(reader, blob);
    });
    return; // не вызываем оригинал сейчас
  }
  originalReadAsDataURL.call(this, blob);
};

// --- Добавление кнопки скачивания к изображениям ---
function addDownloadButton(img) {
  if (img.parentNode.querySelector('.nyx-download-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'nyx-download-btn';
  btn.textContent = 'Скачать как файл';
  
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const src = img.src;
    const originalName = window._nyxEncodedMap.get(src);
    if (!originalName) {
      alert('Не удалось определить исходное имя файла');
      return;
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const restoredFile = await decodeFromImageBlob(blob, originalName);
      const url = URL.createObjectURL(restoredFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Ошибка декодирования', err);
    }
  });
  
  img.parentNode.insertBefore(btn, img.nextSibling);
}

// Наблюдатель за появлением новых изображений
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mut => {
    mut.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && window._nyxEncodedMap.has(node.src)) {
          addDownloadButton(node);
        }
        node.querySelectorAll?.('img').forEach(img => {
          if (window._nyxEncodedMap.has(img.src)) addDownloadButton(img);
        });
      }
    });
  });
});
observer.observe(document.body, { childList: true, subtree: true });

// Также проверим уже существующие изображения
document.querySelectorAll('img').forEach(img => {
  if (window._nyxEncodedMap.has(img.src)) addDownloadButton(img);
});

// Sidebar, members and friends panel swipe functionality
(function() {
  let handlersAdded = false;

  // Функция для измерения ширины панелей и установки CSS-переменных
  function setupPanels() {
    const sidebar = document.querySelector('.server-page__sidebar');
    const members = document.querySelector('.server-page__members');
    const friendsPanel = document.querySelector('div.w-\\(--nyx-server-sidebar-width\\).h-full.flex.flex-col.gap-2.p-4.bg-\\(--nyx-background-darker\\).pb-\\[calc\\(var\\(--nyx-control-panel-height\\)\\+16px\\)\\]');
    const handleElement = document.querySelector('.overflow-y-auto.h-full.shrink-0');

    if (sidebar) {
      const w = sidebar.offsetWidth;
      document.documentElement.style.setProperty('--sidebar-width', w + 'px');
      sidebar.style.transition = 'margin-left 0.3s ease';
    }
    if (members) {
      const w = members.offsetWidth;
      document.documentElement.style.setProperty('--members-width', w + 'px');
      members.style.transition = 'margin-right 0.3s ease';
    }
    if (friendsPanel) {
      const w = friendsPanel.offsetWidth;
      document.documentElement.style.setProperty('--friends-width', w + 'px');
      friendsPanel.style.transition = 'margin-left 0.3s ease';
    }
    if (handleElement) {
      const w = handleElement.offsetWidth;
      document.documentElement.style.setProperty('--handle-width', w + 'px');
    }
  }

  // Добавляем обработчики событий только один раз
  function addSwipeHandlers() {
    if (handlersAdded) return;
    handlersAdded = true;

    let startX, startY;
    let isSwiping = false;
    let startElement = null;
    let swipeProcessed = false;
    const SWIPE_THRESHOLD = 20;

    const sidebarSelector = '.server-page__sidebar';
    const membersSelector = '.server-page__members';
    const friendsSelector = 'div.w-\\(--nyx-server-sidebar-width\\).h-full.flex.flex-col.gap-2.p-4.bg-\\(--nyx-background-darker\\).pb-\\[calc\\(var\\(--nyx-control-panel-height\\)\\+16px\\)\\]';
    const handleSelector = '.overflow-y-auto.h-full.shrink-0';

    function onTouchStart(e) {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      isSwiping = true;
      swipeProcessed = false;
      startElement = e.target;
    }

    function onTouchMove(e) {
      if (!isSwiping || swipeProcessed) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        e.preventDefault();

        const inSidebar = startElement.closest(sidebarSelector);
        const inMembers = startElement.closest(membersSelector);
        const inFriends = startElement.closest(friendsSelector);
        const inHandle = startElement.closest(handleSelector);

        if (inSidebar) {
          const sidebar = document.querySelector(sidebarSelector);
          if (deltaX < 0) {
            sidebar.classList.add('nyx-sidebar-hidden');
            swipeProcessed = true;
          } else if (deltaX > 0 && sidebar.classList.contains('nyx-sidebar-hidden')) {
            sidebar.classList.remove('nyx-sidebar-hidden');
            swipeProcessed = true;
          }
        } else if (inFriends) {
          const friends = document.querySelector(friendsSelector);
          if (deltaX < 0) {
            friends.classList.add('nyx-friends-hidden');
            swipeProcessed = true;
          } else if (deltaX > 0 && friends.classList.contains('nyx-friends-hidden')) {
            friends.classList.remove('nyx-friends-hidden');
            swipeProcessed = true;
          }
        } else if (inMembers) {
          const members = document.querySelector(membersSelector);
          if (deltaX > 0) {
            members.classList.add('nyx-members-hidden');
            swipeProcessed = true;
          } else if (deltaX < 0 && members.classList.contains('nyx-members-hidden')) {
            members.classList.remove('nyx-members-hidden');
            swipeProcessed = true;
          }
        } else if (inHandle) {
          // Свайп на ручке: показываем соответствующую панель
          if (deltaX > 0) {
            // Показать левую панель (sidebar или friends), если скрыта
            const sidebar = document.querySelector(sidebarSelector);
            const friends = document.querySelector(friendsSelector);
            if (sidebar && sidebar.classList.contains('nyx-sidebar-hidden')) {
              sidebar.classList.remove('nyx-sidebar-hidden');
              swipeProcessed = true;
            } else if (friends && friends.classList.contains('nyx-friends-hidden')) {
              friends.classList.remove('nyx-friends-hidden');
              swipeProcessed = true;
            }
          } else if (deltaX < 0) {
            // Показать правую панель (members), если скрыта
            const members = document.querySelector(membersSelector);
            if (members && members.classList.contains('nyx-members-hidden')) {
              members.classList.remove('nyx-members-hidden');
              swipeProcessed = true;
            }
          }
        }
      }
    }

    function onTouchEnd() {
      isSwiping = false;
      startElement = null;
      swipeProcessed = false;
    }

    function onMouseDown(e) {
      startX = e.clientX;
      startY = e.clientY;
      isSwiping = true;
      swipeProcessed = false;
      startElement = e.target;
    }

    function onMouseMove(e) {
      if (!isSwiping || swipeProcessed) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
        e.preventDefault();

        const inSidebar = startElement.closest(sidebarSelector);
        const inMembers = startElement.closest(membersSelector);
        const inFriends = startElement.closest(friendsSelector);
        const inHandle = startElement.closest(handleSelector);

        if (inSidebar) {
          const sidebar = document.querySelector(sidebarSelector);
          if (deltaX < 0) {
            sidebar.classList.add('nyx-sidebar-hidden');
            swipeProcessed = true;
          } else if (deltaX > 0 && sidebar.classList.contains('nyx-sidebar-hidden')) {
            sidebar.classList.remove('nyx-sidebar-hidden');
            swipeProcessed = true;
          }
        } else if (inFriends) {
          const friends = document.querySelector(friendsSelector);
          if (deltaX < 0) {
            friends.classList.add('nyx-friends-hidden');
            swipeProcessed = true;
          } else if (deltaX > 0 && friends.classList.contains('nyx-friends-hidden')) {
            friends.classList.remove('nyx-friends-hidden');
            swipeProcessed = true;
          }
        } else if (inMembers) {
          const members = document.querySelector(membersSelector);
          if (deltaX > 0) {
            members.classList.add('nyx-members-hidden');
            swipeProcessed = true;
          } else if (deltaX < 0 && members.classList.contains('nyx-members-hidden')) {
            members.classList.remove('nyx-members-hidden');
            swipeProcessed = true;
          }
        } else if (inHandle) {
          if (deltaX > 0) {
            const sidebar = document.querySelector(sidebarSelector);
            const friends = document.querySelector(friendsSelector);
            if (sidebar && sidebar.classList.contains('nyx-sidebar-hidden')) {
              sidebar.classList.remove('nyx-sidebar-hidden');
              swipeProcessed = true;
            } else if (friends && friends.classList.contains('nyx-friends-hidden')) {
              friends.classList.remove('nyx-friends-hidden');
              swipeProcessed = true;
            }
          } else if (deltaX < 0) {
            const members = document.querySelector(membersSelector);
            if (members && members.classList.contains('nyx-members-hidden')) {
              members.classList.remove('nyx-members-hidden');
              swipeProcessed = true;
            }
          }
        }
      }
    }

    function onMouseUp() {
      isSwiping = false;
      startElement = null;
      swipeProcessed = false;
    }

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function tryInit() {
    setupPanels();
    addSwipeHandlers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }

  const observer = new MutationObserver(tryInit);
  observer.observe(document.body, { childList: true, subtree: true });
})();

// Отслеживаем высоту панели пользователя и устанавливаем CSS-переменную
(function observeUserPanelHeight() {
  const TARGET_SELECTOR = 'div.absolute.bottom-2.left-2.w-\\[356px\\]';
  
  function updateHeightVariable() {
    const panel = document.querySelector(TARGET_SELECTOR);
    if (panel) {
      const height = panel.offsetHeight;
      document.documentElement.style.setProperty('--user-panel-height', height + 'px');
    }
  }

  updateHeightVariable();
  
  const observer = new MutationObserver(updateHeightVariable);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  
  window.addEventListener('resize', updateHeightVariable);
})();