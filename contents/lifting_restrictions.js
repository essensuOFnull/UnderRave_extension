// content/lifting_restrictions.js
(function() {
  window.liftingSettings = {
    removeDisablePictureInPicture: true,
    removeControlsList: true,
    removeDisableRemotePlayback: true,
    removeContextMenuBlock: true,
    removeXWebkitAirplay: true
  };

  function applyLiftingToVideo(video) {
    let changed = false;
    if (window.liftingSettings.removeDisablePictureInPicture) {
      if (video.hasAttribute('disablePictureInPicture') || video.disablePictureInPicture) {
        video.removeAttribute('disablePictureInPicture');
        video.disablePictureInPicture = false;
        changed = true;
      }
    }
    if (window.liftingSettings.removeControlsList) {
      if (video.hasAttribute('controlslist')) {
        video.removeAttribute('controlslist');
        changed = true;
      }
      if (video.controlsList && video.controlsList.contains('nodownload')) {
        video.controlsList.remove('nodownload');
        changed = true;
      }
    }
    if (window.liftingSettings.removeDisableRemotePlayback) {
      if (video.hasAttribute('disableremoteplayback') || video.disableRemotePlayback) {
        video.removeAttribute('disableremoteplayback');
        video.disableRemotePlayback = false;
        changed = true;
      }
    }
    if (window.liftingSettings.removeContextMenuBlock) {
      if (video.hasAttribute('oncontextmenu')) {
        video.removeAttribute('oncontextmenu');
        changed = true;
      }
    }
    if (window.liftingSettings.removeXWebkitAirplay) {
      if (video.hasAttribute('x-webkit-airplay')) {
        video.removeAttribute('x-webkit-airplay');
        changed = true;
      }
    }
    if (changed) {
      console.log('Lifting applied to video:', video);
    }
  }

  window.applyToAllVideos = function() {
    document.querySelectorAll('video').forEach(applyLiftingToVideo);
  };

  // Загружаем настройки
  chrome.storage.sync.get(Object.keys(window.liftingSettings), (data) => {
    Object.keys(window.liftingSettings).forEach(key => {
      window.liftingSettings[key] = data[key] !== false;
    });
    window.applyToAllVideos();
    console.log('Lifting settings loaded', window.liftingSettings);
  });

  // Следим за изменениями
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let changed = false;
    Object.keys(changes).forEach(key => {
      if (key in window.liftingSettings) {
        window.liftingSettings[key] = changes[key].newValue !== false;
        changed = true;
      }
    });
    if (changed) {
      window.applyToAllVideos();
      console.log('Lifting settings updated', window.liftingSettings);
    }
  });

  // Наблюдатель за новыми видео
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'VIDEO') {
            applyLiftingToVideo(node);
          } else {
            node.querySelectorAll('video').forEach(applyLiftingToVideo);
          }
        }
      });
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Применяем к уже существующим видео
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.applyToAllVideos);
  } else {
    window.applyToAllVideos();
  }
})();