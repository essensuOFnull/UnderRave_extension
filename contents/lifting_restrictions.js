// content/extensionConfig.js
(function() {
	function applyLiftingToVideo(video) {
		let changed = false;
		if (extensionConfig.enablePictureInPicture) {
			if (video.hasAttribute('disablePictureInPicture') || video.disablePictureInPicture) {
				video.removeAttribute('disablePictureInPicture');
				video.disablePictureInPicture = false;
				changed = true;
			}
		}
		if (extensionConfig.enableControlsList) {
			if (video.hasAttribute('controlslist')) {
				video.removeAttribute('controlslist');
				changed = true;
			}
			if (video.controlsList && video.controlsList.contains('nodownload')) {
				video.controlsList.remove('nodownload');
				changed = true;
			}
		}
		if (extensionConfig.enableRemotePlayback) {
			if (video.hasAttribute('disableremoteplayback') || video.disableRemotePlayback) {
				video.removeAttribute('disableremoteplayback');
				video.disableRemotePlayback = false;
				changed = true;
			}
		}
		if (extensionConfig.enableDefaultContextMenu) {
			if (video.hasAttribute('oncontextmenu')) {
				video.removeAttribute('oncontextmenu');
				changed = true;
			}
		}
		if (extensionConfig.enableXWebkitAirplay) {
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
	chrome.storage.sync.get(Object.keys(extensionConfig), (data) => {
		Object.keys(extensionConfig).forEach(key => {
			extensionConfig[key] = data[key] !== false;
		});
		window.applyToAllVideos();
		console.log('Lifting settings loaded', extensionConfig);
	});

	// Следим за изменениями
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'sync') return;
		let changed = false;
		Object.keys(changes).forEach(key => {
			if (key in extensionConfig) {
				extensionConfig[key] = changes[key].newValue !== false;
				changed = true;
			}
		});
		if (changed) {
			window.applyToAllVideos();
			console.log('Lifting settings updated', extensionConfig);
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

	async function tryPipOnVideos(videos) {
		for (const video of videos) {
			if (extensionConfig.enablePictureInPicture) {
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