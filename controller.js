// controller.js bootstrap
// Keep the controller implementation in controllerCore.js and also load the
// character-art instrumentation. This avoids relying on a stale iOS-cached
// index.html script list while preserving the original controller code byte-for-byte.
(() => {
  'use strict';
  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  load('controllerCore.js?v=1')
    .then(() => load('entityRenderInstrumentation.js?v=3-post-world-roster'))
    .catch(err => console.error('[controller bootstrap] failed to load runtime helper', err));
})();
