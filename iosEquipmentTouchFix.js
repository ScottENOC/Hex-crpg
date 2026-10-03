// iOS touch hardening for dynamically-rendered inventory equipment buttons.
// Keep this deliberately narrow: the normal modal/global touch handling in
// main.js owns close buttons and modal chrome. This only supplies the missing
// click for Equip buttons that Safari sometimes leaves at :active state.
(() => {
  'use strict';

  if (window.__iosEquipmentTouchFixInstalled) return;
  window.__iosEquipmentTouchFixInstalled = true;

  document.addEventListener('touchend', event => {
    const target = event.target;
    const button = target?.closest?.('#inventory-content button, [data-equipment-slot-picker] button');
    if (!button || button.disabled) return;

    const label = (button.textContent || '').trim().toLowerCase();
    const inline = String(button.getAttribute('onclick') || '').toLowerCase();
    const isEquipAction = label.startsWith('equip') || inline.includes('equipitem');
    if (!isEquipAction) return;

    // This is the one case where we intentionally replace Safari's missing
    // synthetic click. Do not stop propagation: main.js still owns all of the
    // global touch/modal handling, and other buttons must remain untouched.
    event.preventDefault();
    button.click();
  }, { passive: false });
})();
