// northwatchSiegeSpawn.js
// Northwatch defenders belong to the persistent world. The attacking siege
// force does not: it must not exist until the player explicitly starts the
// siege through one of the dialogue choices (or the dedicated test cheat).
(() => {
  'use strict';

  let pendingAttackers = [];

  function isNorthwatchAttacker(entity) {
    if (!entity) return false;
    if (entity === window.campaign2NorthwatchCatapult) return true;
    if (entity === window.campaign2NorthwatchSiegeEngine) return true;
    if (entity.isCatapult || entity.isCatapultCrew) return true;
    return entity.factionTag === 'greenskin_assault';
  }

  function captureAndRemoveAttackers() {
    if (!Array.isArray(window.entities)) return 0;

    const captured = [];
    const kept = [];
    for (const entity of window.entities) {
      if (isNorthwatchAttacker(entity)) captured.push(entity);
      else kept.push(entity);
    }

    if (captured.length) {
      pendingAttackers = captured;
      window.entities.length = 0;
      window.entities.push(...kept);
    } else {
      pendingAttackers = [];
    }

    return captured.length;
  }

  function spawnAttackers() {
    if (!pendingAttackers.length) return 0;
    if (!Array.isArray(window.entities)) window.entities = [];

    let restored = 0;
    for (const entity of pendingAttackers) {
      if (!window.entities.includes(entity)) {
        window.entities.push(entity);
        restored++;
      }
    }
    pendingAttackers = [];
    return restored;
  }

  function wrapWorldSetup() {
    const original = window.setupVillageScene;
    if (typeof original !== 'function' || original.__northwatchDeferredAttackersWrapped) return false;

    function setupVillageSceneWithoutPrematureSiege(...args) {
      const result = original.apply(this, args);
      // Fresh deterministic world builds create the Northwatch attackers as
      // part of the fort setup. Remove only that attacking force immediately;
      // defenders, fort NPCs and fort geometry remain in the world normally.
      captureAndRemoveAttackers();
      return result;
    }

    setupVillageSceneWithoutPrematureSiege.__northwatchDeferredAttackersWrapped = true;
    setupVillageSceneWithoutPrematureSiege.__northwatchDeferredAttackersOriginal = original;
    window.setupVillageScene = setupVillageSceneWithoutPrematureSiege;
    return true;
  }

  function wrapActivation() {
    const original = window.activateNorthwatchSiege;
    if (typeof original !== 'function' || original.__northwatchDeferredAttackersWrapped) return false;

    function activateNorthwatchSiegeWithAttackers(...args) {
      // The activation call itself is the authority that the encounter has
      // begun. Restore the already-built attacker objects immediately before
      // the normal siege state is initialised so all legacy dialogue/siege
      // code sees the same entities it expected before this architectural fix.
      spawnAttackers();
      return original.apply(this, args);
    }

    activateNorthwatchSiegeWithAttackers.__northwatchDeferredAttackersWrapped = true;
    activateNorthwatchSiegeWithAttackers.__northwatchDeferredAttackersOriginal = original;
    window.activateNorthwatchSiege = activateNorthwatchSiegeWithAttackers;
    return true;
  }

  window.NorthwatchSiegeSpawn = {
    captureAndRemoveAttackers,
    spawnAttackers,
    pendingCount: () => pendingAttackers.length,
    isNorthwatchAttacker,
  };

  // This module loads early from characterCreation.js; campaign2World.js and
  // gameEngine.js define the wrapped functions later in the page. Install as
  // soon as each one appears, then stop polling once both wrappers are live.
  const installer = setInterval(() => {
    const worldReady = wrapWorldSetup();
    const activationReady = wrapActivation();
    const worldWrapped = !!window.setupVillageScene?.__northwatchDeferredAttackersWrapped;
    const activationWrapped = !!window.activateNorthwatchSiege?.__northwatchDeferredAttackersWrapped;
    if ((worldReady || worldWrapped) && (activationReady || activationWrapped)) clearInterval(installer);
  }, 25);
})();
