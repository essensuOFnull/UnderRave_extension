(function() {
  let lastContextMenuTarget = null;
  let forceContextMenuEnabled = false; // будет прочитано из storage

  // Единый обработчик контекстного меню на window в фазе захвата
  function handleContextMenu(e) {
    // Всегда запоминаем элемент, на котором кликнули
    lastContextMenuTarget = e.target;
    console.log('contextmenu target saved', e.target);

    // Если включена опция принудительного меню – блокируем дальнейшие обработчики сайта
    if (forceContextMenuEnabled) {
      e.stopImmediatePropagation();
      // Не вызываем preventDefault, чтобы стандартное меню появилось
    }
  }

  // Добавляем обработчик (сработает самым первым)
  window.addEventListener('contextmenu', handleContextMenu, true);

  // Читаем настройку из storage
  chrome.storage.sync.get('contextMenuAvailablerEnabled', (data) => {
    forceContextMenuEnabled = data.contextMenuAvailablerEnabled !== false;
  });

  // Следим за изменениями настройки
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.contextMenuAvailablerEnabled) {
      forceContextMenuEnabled = changes.contextMenuAvailablerEnabled.newValue !== false;
    }
  });
// ========== Модуль ТВ ==========
  // Глубокий поиск видео с учётом Shadow DOM
  function findNearestVideo(element) {
    function searchShadow(node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
        const video = node.shadowRoot.querySelector('video');
        if (video) return video;
        for (const child of node.shadowRoot.children) {
          const found = searchShadow(child);
          if (found) return found;
        }
      }
      return null;
    }

    let el = element;
    while (el) {
      if (el.tagName === 'VIDEO') return el;
      const videoInside = el.querySelector('video');
      if (videoInside) return videoInside;
      if (el.shadowRoot) {
        const videoInShadow = el.shadowRoot.querySelector('video');
        if (videoInShadow) return videoInShadow;
        for (const child of el.shadowRoot.children) {
          const found = searchShadow(child);
          if (found) return found;
        }
      }
      el = el.parentElement || el.getRootNode()?.host;
    }
    return null;
  }
  // Функция для рекурсивного сбора всех видео на странице (включая shadow DOM)
	function getAllVideos(root = document) {
		let videos = [];
		if (root.querySelectorAll) {
			root.querySelectorAll('video').forEach(v => videos.push(v));
		}
		// Ищем элементы с shadowRoot
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
			acceptNode: (node) => {
				if (node.shadowRoot) return NodeFilter.FILTER_ACCEPT;
				return NodeFilter.FILTER_SKIP;
			}
		});
		while (walker.nextNode()) {
			const shadowHost = walker.currentNode;
			if (shadowHost.shadowRoot) {
				videos = videos.concat(getAllVideos(shadowHost.shadowRoot));
			}
		}
		return videos;
	}

	// Асинхронная попытка включить PiP на списке видео
	async function tryPipOnVideos(videos) {
		for (const video of videos) {
			// Применяем снятие ограничений (если настройка включена)
			if (liftingSettings.removeDisablePictureInPicture) {
				video.disablePictureInPicture = false;
			}
			// Пропускаем видео, которое уже в PiP
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
				// продолжаем со следующим
			}
		}
		return false;
	}

	// Обработка сообщения от фонового скрипта (клик по пункту PiP)
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message.action === 'enablePip') {
			let videos = getAllVideos();
			if (videos.length === 0) {
				alert('На странице не найдено видео.');
				return;
			}
			// Если есть сохранённая цель, попробуем начать с ближайшего видео
			if (lastContextMenuTarget) {
				const nearest = findNearestVideo(lastContextMenuTarget);
				if (nearest) {
					// Перемещаем ближайшее видео в начало списка (если оно есть в общем списке)
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
  // ========== Модуль снятия ограничений ==========
    let liftingSettings = {
        removeDisablePictureInPicture: true,
        removeControlsList: true,
        removeDisableRemotePlayback: true,
        removeContextMenuBlock: true,
        removeXWebkitAirplay: true
    };

    function applyLiftingToVideo(video) {
        let changed = false;
        if (liftingSettings.removeDisablePictureInPicture) {
            if (video.hasAttribute('disablePictureInPicture') || video.disablePictureInPicture) {
                video.removeAttribute('disablePictureInPicture');
                video.disablePictureInPicture = false;
                changed = true;
            }
        }
        if (liftingSettings.removeControlsList) {
            if (video.hasAttribute('controlslist')) {
                video.removeAttribute('controlslist');
                changed = true;
            }
            if (video.controlsList && video.controlsList.contains('nodownload')) {
                video.controlsList.remove('nodownload');
                changed = true;
            }
        }
        if (liftingSettings.removeDisableRemotePlayback) {
            if (video.hasAttribute('disableremoteplayback') || video.disableRemotePlayback) {
                video.removeAttribute('disableremoteplayback');
                video.disableRemotePlayback = false;
                changed = true;
            }
        }
        if (liftingSettings.removeContextMenuBlock) {
            if (video.hasAttribute('oncontextmenu')) {
                video.removeAttribute('oncontextmenu');
                changed = true;
            }
        }
        if (liftingSettings.removeXWebkitAirplay) {
            if (video.hasAttribute('x-webkit-airplay')) {
                video.removeAttribute('x-webkit-airplay');
                changed = true;
            }
        }
        if (changed) {
            console.log('Lifting applied to video:', video);
        }
    }

    function applyToAllVideos() {
        document.querySelectorAll('video').forEach(applyLiftingToVideo);
    }

    // Загружаем настройки и применяем ко всем видео
    chrome.storage.sync.get(Object.keys(liftingSettings), (data) => {
        Object.keys(liftingSettings).forEach(key => {
            liftingSettings[key] = data[key] !== false;
        });
        applyToAllVideos();
        console.log('Lifting settings loaded', liftingSettings);
    });

    // Следим за изменениями настроек
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        let changed = false;
        Object.keys(changes).forEach(key => {
            if (key in liftingSettings) {
                liftingSettings[key] = changes[key].newValue !== false;
                changed = true;
            }
        });
        if (changed) {
            applyToAllVideos();
            console.log('Lifting settings updated', liftingSettings);
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

    // Применяем к уже существующим видео после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyToAllVideos);
    } else {
        applyToAllVideos();
    }
    // =================================================
  console.log('🎯 Content script loaded');
})();