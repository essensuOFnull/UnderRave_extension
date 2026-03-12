// content/pip_handler.js
(function() {
  async function tryPipOnVideos(videos) {
    for (const video of videos) {
      if (window.liftingSettings.removeDisablePictureInPicture) {
        video.disablePictureInPicture = false;
      }
      if (document.pictureInPictureElement === video) {
        console.log('Video already in PiP, skipping', video);
        continue;
      }
      try {
        await video.requestPictureInPicture();
        console.log('PiP started on', video);
        return true;
      } catch (e) {
        console.log('PiP failed on', video, e);
      }
    }
    return false;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enablePip') {
      let videos = window.getAllVideos();
      if (videos.length === 0) {
        alert('На странице не найдено видео.');
        return;
      }
      if (window.lastContextMenuTarget) {
        const nearest = window.findNearestVideo(window.lastContextMenuTarget);
        if (nearest) {
          videos = [nearest, ...videos.filter(v => v !== nearest)];
        }
      }
      tryPipOnVideos(videos).then(success => {
        if (!success) {
          alert('Не удалось включить режим PiP ни для одного видео на странице.');
        }
      });
    }
  });
})();