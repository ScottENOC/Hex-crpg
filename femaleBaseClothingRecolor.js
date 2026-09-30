// femaleBaseClothingRecolor.js
// Compatibility shim only. Baked-in clothing recolouring was retired when
// clothing became explicit garment layers. Keep this filename for cached builds,
// and use its already-established late presentation hook to load child policy.
(() => {
  'use strict';
  window.__femaleBaseClothingRecolorRemoved = true;
  // directionalPresentationFixes.js still waits on this legacy readiness flag.
  window.__femaleBaseClothingRecolorV4Installed = true;

  if (window.__childSystemInstalled || document.querySelector('script[data-child-system]')) return;
  const script = document.createElement('script');
  script.src = 'childSystem.js?build=20261001-child-system-v1';
  script.async = false;
  script.dataset.childSystem = 'true';
  document.head.appendChild(script);
})();
