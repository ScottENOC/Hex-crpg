// femaleBaseClothingRecolor.js
// Compatibility shim only.
//
// Baked-in clothing recolouring was removed when clothing moved to explicit
// garment layers. Some cached/deployed loaders may still request this legacy
// filename, so keep a harmless module here until those loaders have aged out.
(() => {
  'use strict';
  window.__femaleBaseClothingRecolorRemoved = true;
})();
