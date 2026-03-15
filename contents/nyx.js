// contents/nyx.js
// lib/png-encoder.js
console.log('nyx.js: START');
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

// Sidebar swipe functionality
(function() {
  let sidebarSwipeInitialized = false;

  function initSidebarSwipe(sidebar, trigger) {
    if (sidebarSwipeInitialized) return;
    sidebarSwipeInitialized = true;
	// Запоминаем ширину панели и записываем её в CSS-переменную
	const sidebarWidth = sidebar.offsetWidth;
	document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');

    // Обеспечиваем плавность анимации
    sidebar.style.transition = 'transform 0.3s ease';

    let startX, startY;
    let isSwiping = false;
    let startElement = null;
    let swipeProcessed = false;
    const SWIPE_THRESHOLD = 20;

    // --- Обработчики для touch (мобильные) ---
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
        e.preventDefault(); // предотвращаем прокрутку страницы

        const startInSidebar = startElement.closest('.server-page__sidebar');
        // Исправленный селектор с экранированием скобок
        const startInTrigger = startElement.closest('.overflow-y-auto.h-full.bg-\\(--nyx-background-darkest\\).shrink-0');

        if (startInSidebar && deltaX < 0) {
          // Свайп влево по боковой панели → скрыть
          sidebar.classList.add('nyx-sidebar-hidden');
          swipeProcessed = true;
        } else if (startInTrigger && deltaX > 0) {
          // Свайп вправо по триггеру → показать
          sidebar.classList.remove('nyx-sidebar-hidden');
          swipeProcessed = true;
        }
      }
    }

    function onTouchEnd() {
      isSwiping = false;
      startElement = null;
      swipeProcessed = false;
    }

    // --- Обработчики для мыши (десктоп) ---
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

        const startInSidebar = startElement.closest('.server-page__sidebar');
        const startInTrigger = startElement.closest('.overflow-y-auto.h-full.bg-\\(--nyx-background-darkest\\).shrink-0');

        if (startInSidebar && deltaX < 0) {
          sidebar.classList.add('nyx-sidebar-hidden');
          swipeProcessed = true;
        } else if (startInTrigger && deltaX > 0) {
          sidebar.classList.remove('nyx-sidebar-hidden');
          swipeProcessed = true;
        }
      }
    }

    function onMouseUp() {
      isSwiping = false;
      startElement = null;
      swipeProcessed = false;
    }

    // Регистрируем события
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Поиск элементов и инициализация
  function tryInitSidebarSwipe() {
    if (sidebarSwipeInitialized) return;
    const sidebar = document.querySelector('.server-page__sidebar');
    // Исправленный селектор для триггера
    const trigger = document.querySelector('.overflow-y-auto.h-full.bg-\\(--nyx-background-darkest\\).shrink-0');
    if (sidebar && trigger) {
      initSidebarSwipe(sidebar, trigger);
    }
  }

  // Запускаем при готовности DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInitSidebarSwipe);
  } else {
    tryInitSidebarSwipe();
  }

  // Дополнительный наблюдатель на случай динамического появления элементов
  const sidebarObserver = new MutationObserver(() => {
    tryInitSidebarSwipe();
  });
  sidebarObserver.observe(document.body, { childList: true, subtree: true });
})();