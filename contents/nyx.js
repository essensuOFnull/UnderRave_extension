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