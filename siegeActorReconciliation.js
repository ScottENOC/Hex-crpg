// siegeActorReconciliation.js
// Very small siege-only reconciliation pulse. Some legacy Northwatch combat
// functions call each other through lexical bindings inside gameEngine.js,
// so window-level wrappers cannot observe every call. While a siege is active
// this checks only the three strategic siege actors (catapult/ram/sapper) and
// reconciles their real physical target/result into the persistent sector
// model. No army/entity scans and no work at all outside an active siege.
(() => {
    'use strict';

    const INTERVAL_MS = 500;
    // Physical Northwatch actors should only pull the player into real combat
    // while the party is actually in/around the fort. The world is much larger
    // than the engine's normal 40-hex active-simulation radius; 80 covers the
    // fort, its approaches and the deliberately distant catapult position while
    // still keeping a siege hundreds of hexes away from hijacking initiative.
    const PHYSICAL_SIEGE_RADIUS = 80;
    let timer = null;
    let waveGuardInstalled = false;

    function appendEvent(sector, event) {
        if (!sector) return;
        sector.eventLog = Array.isArray(sector.eventLog) ? sector.eventLog : [];
        sector.eventLog.push({ worldSeconds: window.worldSeconds || 0, ...event });
        if (sector.eventLog.length > 20) sector.eventLog.splice(0, sector.eventLog.length - 20);
    }

    function partyNearNorthwatchPhysicalSiege() {
        const center = window.campaign2NorthwatchCenter;
        if (!center || typeof window.distance !== 'function') return false;
        const partyHexes = (window.entities || [])
            .filter(e => e?.alive && e.side === 'player' && e.hex)
            .map(e => e.hex);
        if (!partyHexes.length && window.player?.hex) partyHexes.push(window.player.hex);
        return partyHexes.some(hex => window.distance(hex, center) <= PHYSICAL_SIEGE_RADIUS);
    }

    // spawnGreenskinAssaultWave historically sets isInCombat=true
    // unconditionally. That is correct when the player is at Northwatch, but
    // catastrophic when the off-screen siege advances while the party is in
    // Hollowmere/Silverhart: the distant scripted battle steals the global turn
    // queue. Leave the abstract siege simulation running, but defer spawning the
    // physical assault until the player is close enough to participate. Existing
    // call sites already retry while !greenskinWaveSpawned, so approaching the
    // fort later starts the real wave normally.
    function installPhysicalWaveGuard() {
        if (waveGuardInstalled) return true;
        const original = window.spawnGreenskinAssaultWave;
        if (typeof original !== 'function') return false;
        if (original.__northwatchProximityGuard) {
            waveGuardInstalled = true;
            return true;
        }
        const guarded = function(...args) {
            if (!partyNearNorthwatchPhysicalSiege()) return false;
            return original.apply(this, args);
        };
        guarded.__northwatchProximityGuard = true;
        guarded.__originalSpawnGreenskinAssaultWave = original;
        window.spawnGreenskinAssaultWave = guarded;
        waveGuardInstalled = true;
        return true;
    }

    function syncCatapultTarget(state) {
        const catapult = window.campaign2NorthwatchCatapult;
        const target = catapult?.currentWallTarget;
        if (!catapult || !target || !window.SiegeActorSectorIntegration) return false;
        const sector = window.SiegeActorSectorIntegration.nearestSectorToHex(target, state);
        if (!sector) return false;
        const changed = catapult.siegeSectorId !== sector.id ||
            catapult.siegeTargetHex?.q !== target.q || catapult.siegeTargetHex?.r !== target.r;
        catapult.siegeSectorId = sector.id;
        catapult.siegeRole = 'catapult';
        catapult.siegeTargetHex = { ...target };
        state.catapultSectorId = sector.id;
        if (changed) appendEvent(sector, {
            type: 'catapult_target',
            entityId: catapult.id,
            q: target.q,
            r: target.r,
        });
        return changed;
    }

    function reconcile() {
        installPhysicalWaveGuard();
        const state = window.siegeState;
        if (!state?.active || !window.SiegeSectorSystem || !window.SiegeActorSectorIntegration) return false;
        window.SiegeSectorSystem.upgradeState?.(state);
        window.SiegeActorSectorIntegration.mergeForcedBreaches?.(state);
        const catapultChanged = syncCatapultTarget(state);
        const breachChanged = window.SiegeActorSectorIntegration.syncResolvedEngineBreaches?.() || false;
        if (catapultChanged || breachChanged) window.SiegeSectorSystem.updateSummary?.(state);
        return catapultChanged || breachChanged;
    }

    function install() {
        installPhysicalWaveGuard();
        if (timer) return true;
        if (!window.SiegeActorSectorIntegration || !window.SiegeSectorSystem) return false;
        timer = setInterval(reconcile, INTERVAL_MS);
        return true;
    }

    window.SiegeActorReconciliation = {
        reconcile,
        syncCatapultTarget,
        install,
        installPhysicalWaveGuard,
        partyNearNorthwatchPhysicalSiege,
        intervalMs: INTERVAL_MS,
        physicalSiegeRadius: PHYSICAL_SIEGE_RADIUS,
    };

    if (install()) return;
    const boot = setInterval(() => {
        if (install()) clearInterval(boot);
    }, 25);
    setTimeout(() => clearInterval(boot), 5000);
})();
