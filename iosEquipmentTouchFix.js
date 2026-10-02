// iOS touch hardening for the slot-based equipment picker.
// Safari can show :active feedback on these dynamically-created buttons without
// dispatching the follow-up click. Mirror the existing Start-button workaround:
// turn touchend into the button's normal click path and suppress the ghost click.
(() => {
  'use strict';

  if (window.__iosEquipmentTouchFixInstalled) return;
  window.__iosEquipmentTouchFixInstalled = true;

  document.addEventListener('touchend', event => {
    const button = event.target?.closest?.('[data-equipment-slot-picker] button');
    if (!button || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    button.click();
  }, { passive: false });
})();
