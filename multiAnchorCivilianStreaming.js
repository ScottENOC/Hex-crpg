// multiAnchorCivilianStreaming.js
// Replaces generatedCivilianPopulation.js's original single-party-anchor pulse
// with the shared chunk streamer. Persistent routines remain untouched; only
// transient Entity shells are selected here.
(() => {
    'use strict';

    const PULSE_MS = 900;
    const PER_BUBBLE_BUDGET = 40;
    const HARD_CAP = 120;
    let installed = false;
    let pulseCount = 0;

    function canInstall() {
        return !!window.GeneratedCivilianPopulation && !!window.WorldChunkStreaming;
    }

    function install() {
        if (installed || !canInstall()) return false;
        if (window.__generatedCivilianPopulationTimer) {
            clearInterval(window.__generatedCivilianPopulationTimer);
            window.__generatedCivilianPopulationTimer = null;
        }
        installed = true;
        return true;
    }

    function pulse() {
        if (!install()) return false;
        pulseCount++;
        const pop = window.GeneratedCivilianPopulation;
        const stream = window.WorldChunkStreaming;
        stream.pulse();
        if (window.currentCampaign !== '2' || !pop?.records) return false;

        const observers = stream.observers;
        if (!observers.length) return false;
        const at = Number(window.worldSeconds || 0);
        const candidates = [];
        for (const record of pop.records.values()) {
            if (!record?.alive) continue;
            const hex = pop.recordLocation(record,at);
            if (!hex || !stream.isHexActive(hex,0)) continue;
            candidates.push({ record, distance:stream.nearestObserverDistance(hex,0) });
        }
        candidates.sort((a,b)=>a.distance-b.distance || String(a.record.id).localeCompare(String(b.record.id)));
        const bubbles = Math.max(1, stream.observerBubbleCount || 1);
        const budget = Math.min(HARD_CAP, bubbles * PER_BUBBLE_BUDGET);
        const selected = candidates.slice(0,budget);
        const wanted = new Set(selected.map(x=>x.record.id));

        for (const {record} of selected) pop.materialise(record,at);
        if (!window.isInCombat) {
            for (const id of [...pop.materialised.keys()]) if (!wanted.has(id)) pop.dematerialise(id);
        }
        return { candidates:candidates.length, materialised:pop.materialised.size, budget, observers:observers.length, bubbles };
    }

    window.MultiAnchorCivilianStreaming = {
        install,
        pulse,
        PER_BUBBLE_BUDGET,
        HARD_CAP,
        get stats(){ return { installed,pulseCount,observers:window.WorldChunkStreaming?.observers?.length || 0,bubbles:window.WorldChunkStreaming?.observerBubbleCount || 0 }; },
    };

    const timer = setInterval(pulse,PULSE_MS);
    window.__multiAnchorCivilianStreamingTimer = timer;
    pulse();
})();
