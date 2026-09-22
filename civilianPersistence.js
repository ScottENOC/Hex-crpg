// civilianPersistence.js
// Versioned save/load adapter for generated civilians.
// Generated civilians are persistent people, but their on-map Entity objects are
// only LOD/materialisation shells. Save the people + routine state separately
// and deliberately keep those transient shells out of persistence.js's normal
// entity array so load cannot duplicate them.
(() => {
    'use strict';

    const SNAPSHOT_VERSION = 1;
    const PREFIX = 'generated-civilian:';
    let importEpoch = 0;
    let installed = false;
    let pendingRestore = undefined;

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const isGeneratedId = id => String(id ?? '').startsWith(PREFIX);

    function population() { return window.GeneratedCivilianPopulation; }
    function scheduler() { return window.NPCRoutineScheduler; }

    function syncMaterialisedDeaths() {
        const pop = population();
        if (!pop?.materialised || !pop?.records) return;
        for (const [id, entity] of pop.materialised) {
            if (entity && !entity.alive) {
                const record = pop.records.get(id);
                if (record) record.alive = false;
            }
        }
    }

    function exportState() {
        const pop = population();
        const sched = scheduler();
        if (!pop?.records || !sched?.exportState) return null;
        syncMaterialisedDeaths();

        const full = sched.exportState();
        const states = (full.states || []).filter(s => isGeneratedId(s.id)).map(clone);
        const generationById = new Map(states.map(s => [String(s.id), Number(s.eventGeneration || 0)]));
        // exportState includes lazily-cancelled heap entries. Persist only the
        // generation that is live for each saved civilian so stale queue work
        // cannot come back after a load.
        const events = (full.events || [])
            .filter(e => isGeneratedId(e.npcId) && generationById.get(String(e.npcId)) === Number(e.generation || 0))
            .map(clone);

        return {
            version: SNAPSHOT_VERSION,
            records: [...pop.records.values()].map(clone),
            scheduler: { version: 1, states, events },
        };
    }

    function stripTransientEntities(gameState) {
        if (!gameState || !Array.isArray(gameState.entities)) return gameState;
        gameState.entities = gameState.entities.filter(e => !e?.isGeneratedCivilian && !isGeneratedId(e?.id));
        return gameState;
    }

    function patchGameState(gameState, snapshot = exportState()) {
        if (!gameState || typeof gameState !== 'object') return gameState;
        stripTransientEntities(gameState);
        gameState.generatedCivilianState = snapshot;
        return gameState;
    }

    function clearTransientEntities() {
        if (!Array.isArray(window.entities)) return;
        window.entities = window.entities.filter(e => !e?.isGeneratedCivilian && !isGeneratedId(e?.id));
    }

    function restoreFreshPopulation() {
        const pop = population();
        if (!pop) return false;
        pop.clearGeneratedPopulation?.();
        clearTransientEntities();
        pop.ensurePopulation?.(pop.DEFAULT_POPULATION || 180);
        pop.pulseMaterialisation?.();
        window.CivilianVisualDiversity?.styleMaterialised?.();
        window.drawMap?.();
        window.renderEntities?.();
        return true;
    }

    function importState(snapshot) {
        const pop = population();
        const sched = scheduler();
        if (!pop?.records || !sched?.registerNpc || !sched?.scheduleEvent) return false;

        pop.clearGeneratedPopulation?.();
        clearTransientEntities();
        // ensurePopulation(0) is a cheap way to ensure the generated-civilian
        // routine handler is installed after Campaign 2 world regeneration.
        pop.ensurePopulation?.(0);

        if (!snapshot || Number(snapshot.version) !== SNAPSHOT_VERSION || !Array.isArray(snapshot.records)) {
            return restoreFreshPopulation();
        }

        for (const raw of snapshot.records) {
            if (!raw?.id || !isGeneratedId(raw.id)) continue;
            pop.records.set(String(raw.id), clone(raw));
        }

        const savedStates = Array.isArray(snapshot.scheduler?.states) ? snapshot.scheduler.states : [];
        const savedEvents = Array.isArray(snapshot.scheduler?.events) ? snapshot.scheduler.events : [];
        const stateById = new Map(savedStates.map(s => [String(s.id), s]));

        // unregisterNpc leaves old heap entries in place intentionally. Give all
        // imported generated states a fresh generation namespace so those stale
        // entries can never accidentally become valid again for a reused ID.
        importEpoch++;
        const generationBase = 1000000 + importEpoch * 100000;

        for (const record of pop.records.values()) {
            if (!record.alive) continue;
            const raw = stateById.get(String(record.id));
            if (!raw) continue;
            const restored = clone(raw);
            restored.eventGeneration = generationBase + Number(raw.eventGeneration || 0);
            const state = sched.registerNpc(record.id, restored);
            Object.assign(state, restored, { id: record.id });
        }

        for (const rawEvent of savedEvents) {
            const id = String(rawEvent?.npcId ?? '');
            const rawState = stateById.get(id);
            const record = pop.records.get(id);
            if (!rawState || !record?.alive || !Number.isFinite(rawEvent?.at)) continue;
            if (Number(rawEvent.generation || 0) !== Number(rawState.eventGeneration || 0)) continue;
            sched.scheduleEvent(id, rawEvent.at, rawEvent.type, clone(rawEvent.payload));
        }

        // Defensive fallback for a damaged/older nested snapshot: a living
        // person without scheduler state should not disappear forever. Rebuild
        // just that person at their deterministic current routine node.
        for (const record of pop.records.values()) {
            if (!record.alive || sched.getState(record.id)) continue;
            const target = pop.targetForTime?.(record, Number(window.worldSeconds || 0)) || 'home';
            const node = record.nodes?.[target] || record.nodes?.home;
            sched.registerNpc(record.id, {
                simulationLevel: 'dormant',
                activity: target === 'home' ? 'sleeping' : target === 'work' ? 'working' : 'socialising',
                currentNode: node?.key || null,
                currentHex: node?.hex || null,
                metadata: { generatedCivilian: true, occupation: record.occupation, race: record.race, gender: record.gender },
            });
        }

        pop.pulseMaterialisation?.();
        window.CivilianVisualDiversity?.styleMaterialised?.();
        window.drawMap?.();
        window.renderEntities?.();
        return true;
    }

    function localSaveKey(saveName) {
        if (saveName === 'quick_save') return 'rpg_save_quick_save';
        return String(saveName || 'rpg_save_game').startsWith('rpg_save_')
            ? String(saveName || 'rpg_save_game')
            : `rpg_save_${saveName || 'rpg_save_game'}`;
    }

    function installSaveWrapper() {
        const original = window.saveGame;
        if (typeof original !== 'function') return false;
        if (original.__generatedCivilianPersistence) return true;
        const wrapped = function(saveName = 'rpg_save_game') {
            const key = localSaveKey(saveName);
            const snapshot = exportState();
            const nativeSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function(k, value) {
                if (k === key) {
                    try {
                        const parsed = JSON.parse(value);
                        value = JSON.stringify(patchGameState(parsed, snapshot));
                    } catch (e) {
                        console.warn('Could not attach generated civilian save state', e);
                    }
                }
                return nativeSetItem.call(this, k, value);
            };
            try { return original.apply(this, arguments); }
            finally { Storage.prototype.setItem = nativeSetItem; }
        };
        wrapped.__generatedCivilianPersistence = true;
        wrapped.__original = original;
        window.saveGame = wrapped;
        return true;
    }

    function installLoadWrapper() {
        const original = window.loadGame;
        if (typeof original !== 'function') return false;
        if (original.__generatedCivilianPersistence) return true;
        const wrapped = function(saveName = 'rpg_save_game') {
            const key = localSaveKey(saveName);
            let snapshot;
            try { snapshot = JSON.parse(localStorage.getItem(key) || 'null')?.generatedCivilianState; }
            catch (_) { snapshot = undefined; }
            const result = original.apply(this, arguments);
            if (window.currentCampaign === '2') {
                if (!importState(snapshot)) pendingRestore = snapshot ?? null;
            }
            return result;
        };
        wrapped.__generatedCivilianPersistence = true;
        wrapped.__original = original;
        window.loadGame = wrapped;
        return true;
    }

    function installExportWrapper() {
        const original = window.exportSaveCode;
        if (typeof original !== 'function') return false;
        if (original.__generatedCivilianPersistence) return true;
        const wrapped = function() {
            const code = original.apply(this, arguments);
            if (!code) return code;
            try {
                const json = decodeURIComponent(escape(atob(code)));
                const state = patchGameState(JSON.parse(json));
                return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
            } catch (e) {
                console.warn('Could not attach generated civilian export state', e);
                return code;
            }
        };
        wrapped.__generatedCivilianPersistence = true;
        wrapped.__original = original;
        window.exportSaveCode = wrapped;
        return true;
    }

    function installImportWrapper() {
        const original = window.importSaveCode;
        if (typeof original !== 'function') return false;
        if (original.__generatedCivilianPersistence) return true;
        const wrapped = function(code) {
            if (!code || !String(code).trim()) return original.apply(this, arguments);
            let json;
            try {
                json = decodeURIComponent(escape(atob(String(code).trim())));
                JSON.parse(json);
            } catch (_) {
                return original.apply(this, arguments);
            }
            const tempKey = 'rpg_save_imported_temp';
            localStorage.setItem(tempKey, json);
            try { window.loadGame('imported_temp'); }
            finally { localStorage.removeItem(tempKey); }
            return true;
        };
        wrapped.__generatedCivilianPersistence = true;
        wrapped.__original = original;
        window.importSaveCode = wrapped;
        return true;
    }

    function install() {
        const ok = installSaveWrapper() & installLoadWrapper() & installExportWrapper() & installImportWrapper();
        if (ok) installed = true;
        return !!ok;
    }

    window.GeneratedCivilianPersistence = {
        SNAPSHOT_VERSION,
        exportState,
        importState,
        patchGameState,
        stripTransientEntities,
        install,
        get installed() { return installed; },
    };

    if (!install()) {
        const timer = setInterval(() => {
            if (install()) clearInterval(timer);
        }, 50);
        setTimeout(() => clearInterval(timer), 10000);
    }

    // A fresh-page load can rebuild Campaign 2 before the dynamic civilian
    // modules have all finished installing. Honour a deferred snapshot once
    // those dependencies become available.
    const pendingTimer = setInterval(() => {
        if (pendingRestore === undefined) return;
        if (importState(pendingRestore)) {
            pendingRestore = undefined;
            clearInterval(pendingTimer);
        }
    }, 50);
    setTimeout(() => clearInterval(pendingTimer), 10000);
})();
