// siegeSectorSystem.js
// Persistent per-sector siege state layered over the existing Northwatch
// siege. The old global pressure value remains as a compatibility summary,
// while the six physical star-fort sectors now remember wall condition,
// breaches, local morale, reserves and relative strength. This module is
// deliberately generic enough for later Silverhart/other-fort sieges.
(() => {
    'use strict';

    const INSTALL_RETRY_MS = 25;
    const INSTALL_TIMEOUT_MS = 5000;
    // The legacy abstract siege test can execute tens of thousands of ticks
    // in one synchronous burst. Local sector morale does not need to advance
    // at that same microscopic cadence: physical wall damage/breaches update
    // sectors immediately through their event hooks, while ambient morale is
    // deliberately a slower layer on top. Throttling here keeps the old
    // Monte-Carlo siege simulation cheap instead of multiplying every legacy
    // tick by six sectors plus a full wall scan.
    const LOCAL_STATE_TICK_INTERVAL = 10;
    const WALL_NAMES = new Set([
        'Wall', 'Stone Wall', 'Keep Wall', 'Climbable Wall', 'Palisade Wall'
    ]);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const key = h => `${h.q},${h.r}`;
    let installed = false;
    let persistenceInstalled = false;

    function terrainName(h) {
        return window.getTerrainAt?.(h.q, h.r)?.name || '';
    }

    function ensureSectorShape(sector, index) {
        if (!sector) return sector;
        if (!Number.isFinite(sector.id)) sector.id = index;
        if (!Number.isFinite(sector.defenderStrength)) sector.defenderStrength = 10;
        if (!Number.isFinite(sector.attackerStrength)) sector.attackerStrength = 10;
        if (!Number.isFinite(sector.wallIntegrity)) sector.wallIntegrity = 100;
        if (!Number.isFinite(sector.morale)) sector.morale = 100;
        if (!Number.isFinite(sector.reserves)) sector.reserves = 6;
        if (!Array.isArray(sector.breachHexes)) sector.breachHexes = [];
        if (!Array.isArray(sector.eventLog)) sector.eventLog = [];
        if (!sector.casualties || typeof sector.casualties !== 'object') {
            sector.casualties = { attackers: 0, defenders: 0 };
        }
        if (typeof sector.breached !== 'boolean') sector.breached = sector.breachHexes.length > 0;
        if (!sector.status) sector.status = sector.breached ? 'breached' : 'holding';
        return sector;
    }

    function upgradeState(state = window.siegeState, { refreshWalls = false } = {}) {
        if (!state || !Array.isArray(state.segments)) return state;
        state.segments.forEach(ensureSectorShape);
        if (!state.sectorModelVersion) state.sectorModelVersion = 1;
        if (!Number.isFinite(state.lastSectorTickWorldSeconds)) state.lastSectorTickWorldSeconds = window.worldSeconds || 0;
        if (!Number.isFinite(state._sectorTickCounter)) state._sectorTickCounter = 0;

        // A newly-created legacy siege has no sector-derived wall snapshot yet,
        // so take exactly one physical scan when it is upgraded. Thereafter,
        // damageWall(), forced breaches and the lightweight strategic-actor
        // reconciler keep wall state current incrementally. Callers that truly
        // need a rescan (e.g. after loading/restoring terrain) can request one.
        if (!state._sectorWallsInitialised || refreshWalls) {
            refreshAllWallStates(state);
            state._sectorWallsInitialised = true;
        }
        updateSummary(state);
        return state;
    }

    function wallHealthFraction(h) {
        const terrain = terrainName(h);
        if (terrain === 'Rubble') return 0;
        const obj = window.tileObjects?.[key(h)];
        if (obj && Number.isFinite(obj.hp) && Number.isFinite(obj.maxHp) && obj.maxHp > 0) {
            return clamp(obj.hp / obj.maxHp, 0, 1);
        }
        return WALL_NAMES.has(terrain) ? 1 : 0;
    }

    function refreshSectorWallState(sector) {
        ensureSectorShape(sector, sector?.id || 0);
        const walls = sector?.wallHexes || [];
        if (!walls.length) {
            sector.wallIntegrity = 100;
            sector.breachHexes = [];
            sector.breached = false;
            return sector;
        }
        let total = 0;
        const breaches = [];
        for (const h of walls) {
            const fraction = wallHealthFraction(h);
            total += fraction;
            if (fraction <= 0) breaches.push({ q: h.q, r: h.r });
        }
        sector.wallIntegrity = Math.round((total / walls.length) * 1000) / 10;
        sector.breachHexes = breaches;
        sector.breached = breaches.length > 0;
        if (sector.breached) sector.status = 'breached';
        else if (sector.wallIntegrity < 60) sector.status = 'damaged';
        else sector.status = 'holding';
        return sector;
    }

    function refreshAllWallStates(state = window.siegeState) {
        if (!state?.segments) return state;
        state.segments.forEach(refreshSectorWallState);
        state._sectorWallsInitialised = true;
        return state;
    }

    function localPressure(sector) {
        ensureSectorShape(sector, sector?.id || 0);
        const totalStrength = Math.max(1, sector.attackerStrength + sector.defenderStrength);
        const strength = ((sector.attackerStrength - sector.defenderStrength) / totalStrength) * 55;
        const wall = (100 - sector.wallIntegrity) * 0.25;
        const morale = (100 - sector.morale) * 0.15;
        const breach = sector.breached ? 18 : 0;
        return clamp(strength + wall + morale + breach, -100, 100);
    }

    function updateSummary(state = window.siegeState) {
        if (!state?.segments?.length) return null;
        const pressures = state.segments.map(localPressure);
        state.sectorPressure = pressures;
        let worstIndex = 0;
        for (let i = 1; i < pressures.length; i++) {
            if (pressures[i] > pressures[worstIndex]) worstIndex = i;
        }
        state.mostPressuredSectorId = state.segments[worstIndex]?.id ?? worstIndex;
        state.averageSectorPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
        return state;
    }

    function findSectorForHex(q, r, state = window.siegeState) {
        if (!state?.segments) return null;
        return state.segments.find(s => (s.wallHexes || []).some(h => h.q === q && h.r === r)) || null;
    }

    function logEvent(sector, type, detail = {}) {
        ensureSectorShape(sector, sector?.id || 0);
        sector.eventLog.push({
            type,
            worldSeconds: window.worldSeconds || 0,
            ...detail,
        });
        if (sector.eventLog.length > 20) sector.eventLog.splice(0, sector.eventLog.length - 20);
    }

    function applySectorPressure(sectorId, delta, source = 'event') {
        const state = upgradeState();
        const sector = state?.segments?.find(s => s.id === sectorId) || state?.segments?.[sectorId];
        if (!sector || !Number.isFinite(delta) || delta === 0) return sector || null;
        if (delta > 0) {
            sector.morale = clamp(sector.morale - delta * 0.45, 0, 100);
        } else {
            sector.morale = clamp(sector.morale + (-delta) * 0.35, 0, 100);
        }
        logEvent(sector, source, { pressureDelta: delta });
        updateSummary(state);
        return sector;
    }

    function reinforceSector(sectorId, strength = 2) {
        const state = upgradeState();
        const sector = state?.segments?.find(s => s.id === sectorId) || state?.segments?.[sectorId];
        if (!sector) return false;
        const spend = Math.max(0, Math.min(sector.reserves, Math.ceil(strength)));
        if (!spend) return false;
        sector.reserves -= spend;
        sector.defenderStrength += spend;
        sector.morale = clamp(sector.morale + spend * 3, 0, 100);
        logEvent(sector, 'reinforce', { strength: spend });
        updateSummary(state);
        return true;
    }

    function recordCasualties(sectorId, side, count = 1) {
        const state = upgradeState();
        const sector = state?.segments?.find(s => s.id === sectorId) || state?.segments?.[sectorId];
        if (!sector) return false;
        const n = Math.max(0, Number(count) || 0);
        if (side === 'attacker') {
            sector.casualties.attackers += n;
            sector.attackerStrength = Math.max(0, sector.attackerStrength - n * 0.25);
        } else if (side === 'defender') {
            sector.casualties.defenders += n;
            sector.defenderStrength = Math.max(0, sector.defenderStrength - n * 0.25);
            sector.morale = clamp(sector.morale - n * 1.5, 0, 100);
        } else return false;
        logEvent(sector, 'casualties', { side, count: n });
        updateSummary(state);
        return true;
    }

    function tickSectorState(state = window.siegeState) {
        if (!state?.active || !state.segments?.length) return;
        state._sectorTickCounter = (state._sectorTickCounter || 0) + 1;
        if (state._sectorTickCounter % LOCAL_STATE_TICK_INTERVAL !== 0) return;

        // Physical wall condition is event-driven; do NOT rescan the whole
        // fortress here. This path may be called millions of times by legacy
        // abstract siege simulations. Only the slow local morale response
        // advances on this cadence.
        let changed = false;
        for (const sector of state.segments) {
            const before = sector.morale;
            const imbalance = sector.attackerStrength - sector.defenderStrength;
            if (sector.breached && imbalance > 0) sector.morale = clamp(sector.morale - Math.min(2, imbalance * 0.04), 0, 100);
            else if (!sector.breached && imbalance < 0) sector.morale = clamp(sector.morale + Math.min(1, (-imbalance) * 0.02), 0, 100);
            if (sector.morale !== before) changed = true;
        }
        state.lastSectorTickWorldSeconds = window.worldSeconds || state.lastSectorTickWorldSeconds || 0;
        if (changed) updateSummary(state);
    }

    function plainState(state = window.siegeState) {
        if (!state) return null;
        try { return JSON.parse(JSON.stringify(state)); }
        catch (e) { return null; }
    }

    function saveStorageKey(saveName = 'rpg_save_game') {
        if (saveName === 'quick_save') return 'rpg_save_quick_save';
        return saveName.startsWith('rpg_save_') ? saveName : `rpg_save_${saveName}`;
    }

    function patchStoredSave(saveName) {
        const storageKey = saveStorageKey(saveName);
        const raw = localStorage.getItem(storageKey);
        if (!raw) return false;
        try {
            const data = JSON.parse(raw);
            data.siegeState = plainState();
            localStorage.setItem(storageKey, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('Could not append siege state to save', e);
            return false;
        }
    }

    function decodeSaveCode(code) {
        try { return JSON.parse(decodeURIComponent(escape(atob(code)))); }
        catch (e) { return null; }
    }

    function encodeSaveCode(data) {
        try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
        catch (e) { return null; }
    }

    function installPersistenceHooks() {
        if (persistenceInstalled) return true;
        const saveGame = window.saveGame;
        const loadGame = window.loadGame;
        const exportSaveCode = window.exportSaveCode;
        if (typeof saveGame !== 'function' || typeof loadGame !== 'function' || typeof exportSaveCode !== 'function') return false;

        if (!saveGame.__siegeSectorPersistence) {
            const wrappedSave = function(saveName = 'rpg_save_game', ...rest) {
                const result = saveGame.call(this, saveName, ...rest);
                patchStoredSave(saveName);
                return result;
            };
            wrappedSave.__siegeSectorPersistence = true;
            wrappedSave.__original = saveGame;
            window.saveGame = wrappedSave;
        }

        if (!loadGame.__siegeSectorPersistence) {
            const wrappedLoad = function(saveName = 'rpg_save_game', ...rest) {
                let savedSiege = null;
                try {
                    const raw = localStorage.getItem(saveStorageKey(saveName));
                    if (raw) savedSiege = JSON.parse(raw).siegeState || null;
                } catch (e) {}
                const restore = () => {
                    if (savedSiege) {
                        window.siegeState = savedSiege;
                        // Loading restores terrain and siege state separately;
                        // one explicit physical rescan reconciles them, then
                        // normal play goes back to event-driven updates.
                        upgradeState(window.siegeState, { refreshWalls: true });
                    }
                };
                const result = loadGame.call(this, saveName, ...rest);
                if (result && typeof result.then === 'function') return result.then(value => { restore(); return value; });
                restore();
                return result;
            };
            wrappedLoad.__siegeSectorPersistence = true;
            wrappedLoad.__original = loadGame;
            window.loadGame = wrappedLoad;
        }

        if (!exportSaveCode.__siegeSectorPersistence) {
            const wrappedExport = function(...args) {
                const code = exportSaveCode.apply(this, args);
                if (!code) return code;
                const data = decodeSaveCode(code);
                if (!data) return code;
                data.siegeState = plainState();
                return encodeSaveCode(data) || code;
            };
            wrappedExport.__siegeSectorPersistence = true;
            wrappedExport.__original = exportSaveCode;
            window.exportSaveCode = wrappedExport;
        }

        persistenceInstalled = true;
        return true;
    }

    function install() {
        if (installed) {
            installPersistenceHooks();
            return true;
        }
        const activate = window.activateNorthwatchSiege;
        const tick = window.tickSiegeState;
        const damageWall = window.damageWall;
        if (typeof activate !== 'function' || typeof tick !== 'function' || typeof damageWall !== 'function') return false;

        if (!activate.__sectorSiegeWrapper) {
            const wrappedActivate = function(...args) {
                const state = activate.apply(this, args);
                return upgradeState(state);
            };
            wrappedActivate.__sectorSiegeWrapper = true;
            wrappedActivate.__original = activate;
            window.activateNorthwatchSiege = wrappedActivate;
        }

        if (!tick.__sectorSiegeWrapper) {
            const wrappedTick = function(...args) {
                const result = tick.apply(this, args);
                tickSectorState(window.siegeState);
                return result;
            };
            wrappedTick.__sectorSiegeWrapper = true;
            wrappedTick.__original = tick;
            window.tickSiegeState = wrappedTick;
        }

        if (!damageWall.__sectorSiegeWrapper) {
            const wrappedDamageWall = function(q, r, amount, ...rest) {
                const state = upgradeState();
                const sector = findSectorForHex(q, r, state);
                const before = sector ? sector.wallIntegrity : null;
                const result = damageWall.call(this, q, r, amount, ...rest);
                if (sector) {
                    refreshSectorWallState(sector);
                    const loss = Math.max(0, before - sector.wallIntegrity);
                    if (loss > 0) {
                        sector.morale = clamp(sector.morale - loss * 0.2, 0, 100);
                        logEvent(sector, 'wall_damage', { q, r, amount, integrityLoss: loss });
                    }
                    updateSummary(state);
                }
                return result;
            };
            wrappedDamageWall.__sectorSiegeWrapper = true;
            wrappedDamageWall.__original = damageWall;
            window.damageWall = wrappedDamageWall;
        }

        if (window.siegeState) upgradeState(window.siegeState);
        installed = true;
        installPersistenceHooks();
        return true;
    }

    window.SiegeSectorSystem = {
        upgradeState,
        refreshSectorWallState,
        refreshAllWallStates,
        findSectorForHex,
        localPressure,
        updateSummary,
        applySectorPressure,
        reinforceSector,
        recordCasualties,
        tickSectorState,
        plainState,
        installPersistenceHooks,
        install,
    };

    if (install()) return;
    const timer = setInterval(() => {
        if (install()) clearInterval(timer);
    }, INSTALL_RETRY_MS);
    setTimeout(() => clearInterval(timer), INSTALL_TIMEOUT_MS);
})();
