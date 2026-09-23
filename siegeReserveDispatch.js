// siegeReserveDispatch.js
// Replaces Northwatch's legacy infinite commander reinforcement trick with a
// finite fort-wide mobile reserve. Commander Hart still identifies the most
// pressured sector, but each strategic dispatch consumes one shared reserve
// commitment and gives a real wall defender a physical movement objective.
(() => {
    'use strict';

    const INSTALL_RETRY_MS = 25;
    const INSTALL_TIMEOUT_MS = 5000;
    const DEFAULT_RESERVE_POOL = 12;
    const DISPATCH_INTERVAL_TICKS = 5;
    let installed = false;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function ensureReserveState(state = window.siegeState) {
        if (!state?.segments?.length) return state;
        window.SiegeSectorSystem?.upgradeState?.(state);
        if (!state.reserveModelVersion) {
            state.reserveModelVersion = 1;
            state.sharedReserveMax = DEFAULT_RESERVE_POOL;
            state.sharedReservePool = DEFAULT_RESERVE_POOL;
            state.reserveDispatches = 0;
            state._reserveDispatchTick = 0;
            // Local per-sector reserve counters were a foundation placeholder.
            // Once the shared model is live they are deliberately zeroed so no
            // sector can conjure its own private reinforcement stockpile.
            state.segments.forEach(s => { s.reserves = 0; });
        } else {
            if (!Number.isFinite(state.sharedReserveMax)) state.sharedReserveMax = DEFAULT_RESERVE_POOL;
            if (!Number.isFinite(state.sharedReservePool)) state.sharedReservePool = state.sharedReserveMax;
            if (!Number.isFinite(state.reserveDispatches)) state.reserveDispatches = 0;
            if (!Number.isFinite(state._reserveDispatchTick)) state._reserveDispatchTick = 0;
        }
        return state;
    }

    function sectorById(state, id) {
        return state?.segments?.find(s => s.id === id) || null;
    }

    function pressureFor(sector) {
        return window.SiegeSectorSystem?.localPressure?.(sector) ??
            ((sector?.attackerStrength || 0) - (sector?.defenderStrength || 0));
    }

    function mostPressuredSector(state = window.siegeState) {
        if (!state?.segments?.length) return null;
        let best = state.segments[0];
        for (const sector of state.segments.slice(1)) {
            if (pressureFor(sector) > pressureFor(best)) best = sector;
        }
        return best;
    }

    function quietestSector(state, targetId) {
        const candidates = (state?.segments || []).filter(s => s.id !== targetId);
        if (!candidates.length) return null;
        let best = candidates[0];
        for (const sector of candidates.slice(1)) {
            if (pressureFor(sector) < pressureFor(best)) best = sector;
        }
        return best;
    }

    function nearestSectorForDefender(entity, state) {
        return window.SiegeActorSectorIntegration?.nearestSectorToHex?.(entity?.hex, state) || null;
    }

    function targetHexForSector(sector) {
        return window.SiegeActorSectorIntegration?.sectorTargetHex?.(
            sector,
            window.campaign2NorthwatchGateHex || window.campaign2NorthwatchCenter
        ) || window.campaign2NorthwatchCenter || null;
    }

    function eligibleDefenders(state, targetSector) {
        return (window.entities || []).filter(entity => {
            if (!entity?.alive || entity.factionTag !== 'northwatch_human') return false;
            if (!entity.combatDirective?.canReinforce) return false;
            if (entity._siegeReserveCommitted) return false;
            const current = nearestSectorForDefender(entity, state);
            return current && current.id !== targetSector.id;
        });
    }

    function choosePhysicalDefender(state, targetSector, preferredSource = null) {
        const candidates = eligibleDefenders(state, targetSector);
        if (!candidates.length) return null;
        const targetHex = targetHexForSector(targetSector);
        candidates.sort((a, b) => {
            const aSector = nearestSectorForDefender(a, state);
            const bSector = nearestSectorForDefender(b, state);
            const aSourceBonus = preferredSource && aSector?.id === preferredSource.id ? -10000 : 0;
            const bSourceBonus = preferredSource && bSector?.id === preferredSource.id ? -10000 : 0;
            const aDistance = typeof window.distance === 'function' && targetHex ? window.distance(a.hex, targetHex) : 0;
            const bDistance = typeof window.distance === 'function' && targetHex ? window.distance(b.hex, targetHex) : 0;
            return (aSourceBonus + aDistance) - (bSourceBonus + bDistance);
        });
        return candidates[0];
    }

    function log(sector, type, detail = {}) {
        sector.eventLog = Array.isArray(sector.eventLog) ? sector.eventLog : [];
        sector.eventLog.push({ type, worldSeconds: window.worldSeconds || 0, ...detail });
        if (sector.eventLog.length > 20) sector.eventLog.splice(0, sector.eventLog.length - 20);
    }

    function assignPhysicalOrder(entity, targetSector) {
        if (!entity || !targetSector) return false;
        const targetHex = targetHexForSector(targetSector);
        if (!targetHex) return false;
        entity._siegeReserveCommitted = true;
        entity.siegeSectorId = targetSector.id;
        entity.siegeRole = 'defender-reserve';
        entity.siegeReserveOrder = {
            sectorId: targetSector.id,
            targetHex: { ...targetHex },
            issuedAt: window.worldSeconds || 0,
        };
        entity.combatDirective = entity.combatDirective || {};
        // Once Hart has given a strategic order, do not let the generic surge
        // heuristic immediately redirect this soldier elsewhere. Normal combat
        // targeting still wins whenever an enemy is actually visible/adjacent;
        // siegeObjective is only the no-target movement destination.
        entity.combatDirective.canReinforce = false;
        entity.combatDirective.siegeObjective = { hex: { ...targetHex } };
        entity.combatDirective.reinforcementTargetHex = { ...targetHex };
        return true;
    }

    function dispatchToSector(targetSectorId, strength = 1, source = 'commander_dispatch') {
        const state = ensureReserveState();
        const target = sectorById(state, targetSectorId);
        if (!state?.active || !target || state.sharedReservePool <= 0) return false;
        const spend = Math.max(1, Math.min(state.sharedReservePool, Math.ceil(strength)));
        const sourceSector = quietestSector(state, target.id);
        const defender = choosePhysicalDefender(state, target, sourceSector);
        if (!defender) return false;

        state.sharedReservePool -= spend;
        state.reserveDispatches += 1;
        target.defenderStrength += spend;
        target.morale = clamp(target.morale + spend * 2, 0, 100);
        assignPhysicalOrder(defender, target);
        log(target, source, {
            strength: spend,
            reserveRemaining: state.sharedReservePool,
            entityId: defender.id,
            entityName: defender.name,
            fromSectorId: nearestSectorForDefender(defender, state)?.id ?? null,
        });
        window.SiegeSectorSystem?.updateSummary?.(state);
        return true;
    }

    function maybeDispatch(state = window.siegeState) {
        state = ensureReserveState(state);
        if (!state?.active || !state.commanderAlive || state.sharedReservePool <= 0) return false;
        state._reserveDispatchTick += 1;
        if (state._reserveDispatchTick % DISPATCH_INTERVAL_TICKS !== 0) return false;

        const target = mostPressuredSector(state);
        if (!target) return false;
        // Do not spend reserves on a sector that is not actually under local
        // pressure. A positive attacker/defender imbalance or a physical
        // breach is enough to justify a dispatch.
        const needsHelp = target.breached || target.attackerStrength > target.defenderStrength || pressureFor(target) > 5;
        if (!needsHelp) return false;
        const dispatched = dispatchToSector(target.id, 1, 'commander_dispatch');
        if (dispatched && Math.random() < 0.1 && window.showMessage) {
            window.showMessage('Commander Hart redirects a reserve squad toward the wall under the worst pressure!');
        }
        return dispatched;
    }

    function install() {
        if (installed) return true;
        const activate = window.activateNorthwatchSiege;
        const tick = window.tickSiegeState;
        if (!window.SiegeSectorSystem || typeof activate !== 'function' || typeof tick !== 'function') return false;

        if (!activate.__sharedReserveWrapper) {
            const wrappedActivate = function(...args) {
                const result = activate.apply(this, args);
                return ensureReserveState(result || window.siegeState);
            };
            wrappedActivate.__sharedReserveWrapper = true;
            wrappedActivate.__original = activate;
            window.activateNorthwatchSiege = wrappedActivate;
        }

        if (!tick.__sharedReserveWrapper) {
            const wrappedTick = function(...args) {
                const before = window.siegeState;
                const commanderWasAlive = !!before?.commanderAlive;

                // Suppress the legacy infinite +0.5 reinforcement branch while
                // preserving every other legacy siege effect. The finite shared
                // reserve dispatch below becomes the sole commander reinforcement
                // path once this module is installed.
                if (before && commanderWasAlive) before.commanderAlive = false;
                let result;
                try {
                    result = tick.apply(this, args);
                } finally {
                    if (before && window.siegeState === before && commanderWasAlive) before.commanderAlive = true;
                }

                const current = window.siegeState;
                if (current && commanderWasAlive) current.commanderAlive = true;
                if (current?.active) maybeDispatch(current);
                return result;
            };
            wrappedTick.__sharedReserveWrapper = true;
            wrappedTick.__original = tick;
            window.tickSiegeState = wrappedTick;
        }

        if (window.siegeState) ensureReserveState(window.siegeState);
        installed = true;
        return true;
    }

    window.SiegeReserveDispatch = {
        ensureReserveState,
        mostPressuredSector,
        quietestSector,
        eligibleDefenders,
        assignPhysicalOrder,
        dispatchToSector,
        maybeDispatch,
        install,
        DEFAULT_RESERVE_POOL,
    };

    if (install()) return;
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    setTimeout(() => clearInterval(timer), INSTALL_TIMEOUT_MS);
})();
