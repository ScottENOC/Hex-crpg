// hollowmerePopulationTuning.js
// Keeps the cheap generated-civilian system, but makes Hollowmere feel like a
// settlement rather than a crowd generator around one crossroads anchor.
//
// Generic generated residents are long-term Hollowmere locals. Greenskin
// visitors and residents should be authored/faction-aware so their presence
// means something; they are not sampled randomly from the background crowd.
(() => {
    'use strict';

    const DISTRICTS = [
        { q:-30, r:-12 }, { q:-16, r:-28 }, { q:4, r:-30 }, { q:25, r:-19 },
        { q:31, r:3 }, { q:18, r:25 }, { q:-5, r:30 }, { q:-27, r:17 },
    ];
    const tuned = new Set();

    function pop() { return window.GeneratedCivilianPopulation; }
    function scheduler() { return window.NPCRoutineScheduler; }
    function centre() { return window.campaign2Landmarks?.crossroads || null; }

    function unit(seed, channel) {
        if (scheduler()?.deterministicUnit) return scheduler().deterministicUnit(seed, channel);
        const text = `${seed}|${channel}`;
        let hash = 2166136261;
        for (let i=0;i<text.length;i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash,16777619); }
        return (hash >>> 0) / 4294967296;
    }

    function localRace(record) {
        const roll = unit(record.seed, 'hollowmere-local-race');
        if (roll < 0.88) return 'human';
        if (roll < 0.95) return 'dwarf';
        return 'elf';
    }

    function districtFor(record) {
        const index = Math.min(DISTRICTS.length-1, Math.floor(unit(record.seed,'hollowmere-district') * DISTRICTS.length));
        return DISTRICTS[index];
    }

    function nodeHex(record, kind) {
        const c = centre();
        if (!c) return record.nodes?.[kind]?.hex || null;
        const d = districtFor(record);
        const activityPull = kind === 'social' ? 0.68 : kind === 'work' ? 0.86 : 1;
        const baseQ = c.q + d.q * activityPull;
        const baseR = c.r + d.r * activityPull;
        const angle = unit(record.seed, `${kind}:district-angle`) * Math.PI * 2;
        const radius = (kind === 'social' ? 5 : kind === 'work' ? 7 : 9) + unit(record.seed,`${kind}:district-radius`) * (kind === 'social' ? 12 : 15);
        return {
            q: Math.round(baseQ + Math.cos(angle) * radius),
            r: Math.round(baseR + Math.sin(angle) * radius),
        };
    }

    function tuneRecord(record) {
        if (!record || !record.seed) return false;
        record.race = localRace(record);
        for (const kind of ['home','work','social']) {
            if (!record.nodes?.[kind]) continue;
            record.nodes[kind].hex = nodeHex(record,kind);
        }

        // Generated-civilian records and scheduler state are intentionally the
        // same persistent identity. If the NPC is dormant, move that abstract
        // identity to its newly distributed routine node immediately. Active
        // abstract travel is left alone and will use the tuned node next trip.
        const state = scheduler()?.getState?.(record.id);
        if (state) {
            state.metadata = state.metadata || {};
            state.metadata.race = record.race;
            if (!state.travel) {
                const key = pop()?.targetForTime?.(record, Number(window.worldSeconds || 0)) || 'home';
                const node = record.nodes?.[key] || record.nodes?.home;
                if (node?.hex) {
                    state.currentNode = node.key;
                    state.currentHex = { q:node.hex.q, r:node.hex.r };
                }
            }
        }

        const live = pop()?.materialised?.get?.(record.id);
        if (live) live.race = record.race;
        tuned.add(record.id);
        return true;
    }

    function tuneAll() {
        const p = pop();
        if (!p?.records || !centre()) return 0;
        let count = 0;
        for (const record of p.records.values()) if (tuneRecord(record)) count++;
        return count;
    }

    function installEnsureWrapper() {
        const p = pop();
        if (!p || p.ensurePopulation?.__hollowmereTuned) return !!p;
        const original = p.ensurePopulation;
        if (typeof original !== 'function') return false;
        const wrapped = function(...args) {
            const result = original.apply(this,args);
            tuneAll();
            return result;
        };
        wrapped.__hollowmereTuned = true;
        wrapped.__original = original;
        p.ensurePopulation = wrapped;
        return true;
    }

    function install() {
        if (!pop() || !scheduler() || !centre()) return false;
        installEnsureWrapper();
        tuneAll();
        window.HollowmerePopulationTuning = {
            tuneAll,
            tuneRecord,
            localRace,
            districtFor,
            nodeHex,
            get tunedCount(){ return tuned.size; },
            districts:DISTRICTS.map(x=>({...x})),
        };
        return true;
    }

    if (!install()) {
        const timer = setInterval(()=>{ if (install()) clearInterval(timer); },25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();
