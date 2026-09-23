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
    let timer = null;

    function appendEvent(sector, event) {
        if (!sector) return;
        sector.eventLog = Array.isArray(sector.eventLog) ? sector.eventLog : [];
        sector.eventLog.push({ worldSeconds: window.worldSeconds || 0, ...event });
        if (sector.eventLog.length > 20) sector.eventLog.splice(0, sector.eventLog.length - 20);
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
        if (timer) return true;
        if (!window.SiegeActorSectorIntegration || !window.SiegeSectorSystem) return false;
        timer = setInterval(reconcile, INTERVAL_MS);
        return true;
    }

    window.SiegeActorReconciliation = {
        reconcile,
        syncCatapultTarget,
        install,
        intervalMs: INTERVAL_MS,
    };

    if (install()) return;
    const boot = setInterval(() => {
        if (install()) clearInterval(boot);
    }, 25);
    setTimeout(() => clearInterval(boot), 5000);
})();
