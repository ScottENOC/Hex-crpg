// northwatchSiegeGuard.js
// Northwatch's physical siege actors exist in the deterministic Campaign 2
// world from the moment it is built, but they must remain inert until one of
// the explicit dialogue/cheat paths calls activateNorthwatchSiege().
//
// gameEngine.js's catapult AI is global: once *any* combat is running it can
// schedule an entity with isCatapult=true. Without this gate, an unrelated
// fight in Hollowmere can therefore make the distant Northwatch catapult fire
// even though the player never chose a siege dialogue option.
(() => {
  'use strict';

  function syncCatapultGate() {
    const catapult = window.campaign2NorthwatchCatapult;
    if (!catapult) return false;

    const siegeActive = !!window.siegeState?.active;
    if (siegeActive) {
      if (!catapult.isCatapult) catapult.isCatapult = true;
      return true;
    }

    // Keep the pre-siege world actor physically present but mechanically inert.
    // Do not change faction/position/HP here: the dialogue trigger owns those
    // encounter choices. We only remove the special artillery AI capability.
    catapult.isCatapult = false;
    catapult.isNPC = true;
    catapult.aiState = 'idle';
    return false;
  }

  function wrapWorldSetup() {
    const original = window.setupVillageScene;
    if (typeof original !== 'function' || original.__northwatchSiegeGuardWrapped) return false;

    function guardedSetupVillageScene(...args) {
      const result = original.apply(this, args);
      syncCatapultGate();
      return result;
    }
    guardedSetupVillageScene.__northwatchSiegeGuardWrapped = true;
    guardedSetupVillageScene.__northwatchSiegeGuardOriginal = original;
    window.setupVillageScene = guardedSetupVillageScene;
    return true;
  }

  function wrapActivation() {
    const original = window.activateNorthwatchSiege;
    if (typeof original !== 'function' || original.__northwatchSiegeGuardWrapped) return false;

    function guardedActivateNorthwatchSiege(...args) {
      const result = original.apply(this, args);
      syncCatapultGate();
      return result;
    }
    guardedActivateNorthwatchSiege.__northwatchSiegeGuardWrapped = true;
    guardedActivateNorthwatchSiege.__northwatchSiegeGuardOriginal = original;
    window.activateNorthwatchSiege = guardedActivateNorthwatchSiege;
    return true;
  }

  window.NorthwatchSiegeGuard = {
    sync: syncCatapultGate,
    isExplicitlyActive: () => !!window.siegeState?.active,
  };

  // characterCreation.js loads this before campaign2World.js/gameEngine.js.
  // Install wrappers as those modules appear, then keep a very cheap state
  // synchronisation pulse so active-siege save loads also re-arm the catapult.
  const installer = setInterval(() => {
    wrapWorldSetup();
    wrapActivation();
    syncCatapultGate();
  }, 25);

  // Wrappers should be installed during normal startup within milliseconds.
  // Keep only the lightweight state sync after that; no need to poll wrappers.
  setTimeout(() => {
    clearInterval(installer);
    wrapWorldSetup();
    wrapActivation();
    syncCatapultGate();
    setInterval(syncCatapultGate, 250);
  }, 5000);
})();
