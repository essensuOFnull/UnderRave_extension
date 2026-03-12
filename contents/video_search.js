// content/video_search.js
(function() {
  window.findNearestVideo = function(element) {
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
  };

  window.getAllVideos = function(root = document) {
    let videos = [];
    if (root.querySelectorAll) {
      root.querySelectorAll('video').forEach(v => videos.push(v));
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (node.shadowRoot) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) {
      const shadowHost = walker.currentNode;
      if (shadowHost.shadowRoot) {
        videos = videos.concat(window.getAllVideos(shadowHost.shadowRoot));
      }
    }
    return videos;
  };
})();