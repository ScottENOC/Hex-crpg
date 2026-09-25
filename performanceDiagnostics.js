// performanceDiagnostics.js
// Extra live diagnostics kept separate from the core renderer/profiler so we
// can measure expensive-frame causes without rewriting large gameplay files.
(() => {
    'use strict';

    const SAMPLE_CAP = 1200;
    const NEIGHBORS = [
        [1, 0], [1, -1], [0, -1],
        [-1, 0], [-1, 1], [0, 1]
    ];
    const now = () => performance.now();
    const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const pushCapped = (arr, value) => {
        arr.push(value);
        if (arr.length > SAMPLE_CAP) arr.splice(0, arr.length - SAMPLE_CAP);
    };
    const percentile = (values, p) => {
        if (!values?.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
    };
    const fmt = ms => Number(ms || 0).toFixed(ms >= 10 ? 1 : 2);

    // Rule clarification requested during profiling: a character always sees
    // the hex they occupy and the six adjacent hexes. This wrapper sits above
    // the existing range/light/LOS implementation; everything at distance 2+
    // keeps the old rules unchanged.
    function installAdjacentVisibilityRule() {
        if (!window.__renderVisibilityFastPathInstalled) return false;
        const current = window.isVisibleToPlayer;
        if (typeof current !== 'function') return false;
        if (current.__adjacentAutoVisible) return true;

        const wrapped = function(targetHex, friendliesOverride) {
            if (targetHex) {
                const friendlies = friendliesOverride || (window.entities || []).filter(e => e?.alive && e.side === 'player');
                for (const friendly of friendlies) {
                    if (!friendly?.alive) continue;
                    const occupied = friendly.getAllHexes ? friendly.getAllHexes() : [friendly.hex];
                    for (const origin of occupied) {
                        if (origin && hexDistance(origin, targetHex) <= 1) {
                            const s = window.performanceVisibilityExperimentStats;
                            if (s) s.adjacentShortcuts++;
                            return true;
                        }
                    }
                }
            }
            return current.apply(this, arguments);
        };
        wrapped.__adjacentAutoVisible = true;
        wrapped.__original = current;
        window.isVisibleToPlayer = wrapped;
        window.__adjacentVisibilityRuleInstalled = true;
        return true;
    }

    const renderStats = window.performanceExtendedRenderStats = {
        frameSamples: [], mapSamples: [], mapOtherSamples: [], entitySamples: [],
        sampledFrames: 0
    };
    const terrainStats = window.performanceTerrainRebuildStats = {
        rebuilds: 0, callsObserved: 0, totalMs: 0, lastMs: 0, maxMs: 0,
        totalHexes: 0, lastHexes: 0, samples: []
    };
    const visibilityExperimentStats = window.performanceVisibilityExperimentStats = {
        adjacentShortcuts: 0, runs: 0, candidates: 0, actualVisible: 0,
        propagationChecks: 0, propagationRejects: 0, propagationFalseRejects: 0
    };

    function clearSessionDiagnostics() {
        renderStats.frameSamples.length = 0;
        renderStats.mapSamples.length = 0;
        renderStats.mapOtherSamples.length = 0;
        renderStats.entitySamples.length = 0;
        renderStats.sampledFrames = 0;
        terrainStats.rebuilds = terrainStats.callsObserved = 0;
        terrainStats.totalMs = terrainStats.lastMs = terrainStats.maxMs = 0;
        terrainStats.totalHexes = terrainStats.lastHexes = 0;
        terrainStats.samples.length = 0;
        visibilityExperimentStats.adjacentShortcuts = 0;
        visibilityExperimentStats.runs = visibilityExperimentStats.candidates = 0;
        visibilityExperimentStats.actualVisible = 0;
        visibilityExperimentStats.propagationChecks = 0;
        visibilityExperimentStats.propagationRejects = 0;
        visibilityExperimentStats.propagationFalseRejects = 0;
    }

    // renderTerrainPass is called only when hexMap's terrain buffer is rebuilt,
    // not on ordinary buffer-blit frames. Wrapping it therefore gives us the
    // exact expensive terrain-rebuild count and duration without changing the
    // drawMap algorithm.
    function installTerrainProbe() {
        const current = window.renderTerrainPass;
        if (typeof current !== 'function') return false;
        if (current.__terrainPerfProbe) return true;
        const wrapped = function(visibleAndExplored, ...rest) {
            const t0 = now();
            terrainStats.callsObserved++;
            try {
                return current.call(this, visibleAndExplored, ...rest);
            } finally {
                const ms = now() - t0;
                const hexes = Array.isArray(visibleAndExplored) ? visibleAndExplored.length : 0;
                terrainStats.rebuilds++;
                terrainStats.totalMs += ms;
                terrainStats.lastMs = ms;
                terrainStats.maxMs = Math.max(terrainStats.maxMs, ms);
                terrainStats.totalHexes += hexes;
                terrainStats.lastHexes = hexes;
                pushCapped(terrainStats.samples, ms);
            }
        };
        wrapped.__terrainPerfProbe = true;
        wrapped.__original = current;
        window.renderTerrainPass = wrapped;
        return true;
    }

    let lastFrameSerial = -1;
    let wasProfiling = false;
    function sampleRenderFrames() {
        const enabled = !!window.performanceMonitor?.enabled;
        if (enabled && !wasProfiling) {
            clearSessionDiagnostics();
            lastFrameSerial = window.performanceRenderStats?.frames || 0;
        }
        wasProfiling = enabled;
        if (enabled) {
            const r = window.performanceRenderStats;
            if (r && r.frames !== lastFrameSerial) {
                lastFrameSerial = r.frames;
                pushCapped(renderStats.frameSamples, r.lastFrameMs || 0);
                pushCapped(renderStats.mapSamples, r.lastMapMs || 0);
                pushCapped(renderStats.mapOtherSamples, r.lastMapOtherMs || 0);
                pushCapped(renderStats.entitySamples, r.lastEntitiesMs || 0);
                renderStats.sampledFrames++;
            }
        }
        requestAnimationFrame(sampleRenderFrames);
    }

    function inBounds(bounds, q, r) {
        return !bounds || (q >= bounds.minQ && q <= bounds.maxQ && r >= bounds.minR && r <= bounds.maxR);
    }

    // Snapshot of what renderEntities has to walk right now. The actual entity
    // renderer already culls actors before sorting, but mapItems/tileObjects are
    // dictionaries that are scanned in full before their viewport rejection.
    function getRenderCensus() {
        const bounds = typeof window.getVisibleHexes === 'function' ? window.getVisibleHexes() : null;
        const floor = window._viewerFloor || 0;
        const friendlies = (window.entities || []).filter(e => e?.alive && e.side === 'player');
        let entityAliveFloor = 0, entityInBounds = 0, entityVisible = 0, entityPixelOnscreen = 0;
        for (const e of (window.entities || [])) {
            if (!e?.alive || (e.floor || 0) !== floor || !e.hex) continue;
            entityAliveFloor++;
            if (!inBounds(bounds, e.hex.q, e.hex.r)) continue;
            entityInBounds++;
            if (!window.isVisibleToPlayer(e.hex, friendlies)) continue;
            entityVisible++;
            const vQ = e.visualQ !== undefined ? e.visualQ : e.hex.q;
            const vR = e.visualR !== undefined ? e.visualR : e.hex.r;
            const p = window.hexToPixel ? window.hexToPixel(vQ, vR) : null;
            if (!p || !window.mapCanvas || !(p.x < -100 || p.y < -100 || p.x > window.mapCanvas.width + 100 || p.y > window.mapCanvas.height + 100)) {
                entityPixelOnscreen++;
            }
        }

        let tileObjectsTotal = 0, tileObjectsInBounds = 0;
        for (const key in (window.tileObjects || {})) {
            tileObjectsTotal++;
            const split = key.split(',');
            const q = Number(split[0]), r = Number(split[1]);
            if (inBounds(bounds, q, r)) tileObjectsInBounds++;
        }
        let mapItemHexesTotal = 0, mapItemHexesInBounds = 0;
        for (const key in (window.mapItems || {})) {
            const items = window.mapItems[key];
            if (!items?.length) continue;
            mapItemHexesTotal++;
            const split = key.split(',');
            const q = Number(split[0]), r = Number(split[1]);
            if (inBounds(bounds, q, r)) mapItemHexesInBounds++;
        }
        return {
            floor, entityAliveFloor, entityInBounds, entityVisible, entityPixelOnscreen,
            tileObjectsTotal, tileObjectsInBounds, mapItemHexesTotal, mapItemHexesInBounds
        };
    }
    window.getRenderPerformanceCensus = getRenderCensus;

    // Safely evaluate the proposed ring-by-ring rule without using it to drive
    // gameplay yet. We first ask the real visibility system for ground truth,
    // then simulate: ring 0/1 are visible; ring N is LOS-checked only if it is
    // adjacent to a *propagated visible* hex in ring N-1. falseRejects is the
    // critical number: >0 means the simple rule would hide a hex the real LOS
    // can see (typically around an obstacle edge), so shadowcasting is needed.
    function runPropagationExperiment() {
        const friendlies = (window.entities || []).filter(e => e?.alive && e.side === 'player');
        if (!friendlies.length || typeof window.isVisibleToPlayer !== 'function') return null;
        const liveBase = window.LIVE_VISION_RANGE || 25;
        const candidates = new Map();
        let maxRing = 0;
        for (const friendly of friendlies) {
            const origins = friendly.getAllHexes ? friendly.getAllHexes() : [friendly.hex];
            const range = Math.max(0, liveBase + (friendly.visionBonus || 0));
            const radius = Math.ceil(range);
            for (const origin of origins) {
                if (!origin) continue;
                for (let dq = -radius; dq <= radius; dq++) {
                    const minDr = Math.max(-radius, -dq - radius);
                    const maxDr = Math.min(radius, -dq + radius);
                    for (let dr = minDr; dr <= maxDr; dr++) {
                        const ring = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
                        if (ring > range) continue;
                        const q = origin.q + dq, r = origin.r + dr;
                        if (window.isHexInBounds && !window.isHexInBounds({ q, r })) continue;
                        const key = `${q},${r}`;
                        const existing = candidates.get(key);
                        if (!existing || ring < existing.ring) candidates.set(key, { q, r, ring });
                        if (ring > maxRing) maxRing = ring;
                    }
                }
            }
        }

        const actualVisible = new Set();
        for (const [key, c] of candidates) {
            if (c.ring <= 1 || window.isVisibleToPlayer(c, friendlies)) actualVisible.add(key);
        }
        const propagated = new Set();
        for (const [key, c] of candidates) if (c.ring <= 1) propagated.add(key);
        let checks = 0, rejects = 0, falseRejects = 0;
        for (let ring = 2; ring <= maxRing; ring++) {
            for (const [key, c] of candidates) {
                if (c.ring !== ring) continue;
                let hasVisibleParent = false;
                for (const [dq, dr] of NEIGHBORS) {
                    const parentKey = `${c.q + dq},${c.r + dr}`;
                    const parent = candidates.get(parentKey);
                    if (parent?.ring === ring - 1 && propagated.has(parentKey)) {
                        hasVisibleParent = true;
                        break;
                    }
                }
                if (!hasVisibleParent) {
                    rejects++;
                    if (actualVisible.has(key)) falseRejects++;
                    continue;
                }
                checks++;
                if (actualVisible.has(key)) propagated.add(key);
            }
        }
        const result = {
            candidates: candidates.size,
            actualVisible: actualVisible.size,
            propagationChecks: checks,
            propagationRejects: rejects,
            propagationFalseRejects: falseRejects
        };
        visibilityExperimentStats.runs++;
        visibilityExperimentStats.candidates = result.candidates;
        visibilityExperimentStats.actualVisible = result.actualVisible;
        visibilityExperimentStats.propagationChecks = result.propagationChecks;
        visibilityExperimentStats.propagationRejects = result.propagationRejects;
        visibilityExperimentStats.propagationFalseRejects = result.propagationFalseRejects;
        return result;
    }
    window.runVisibilityPropagationExperiment = runPropagationExperiment;

    function maxOf(values) { return values?.length ? Math.max(...values) : 0; }
    function buildDiagnosticsText(runExperiment = true) {
        const census = getRenderCensus();
        const exp = runExperiment ? runPropagationExperiment() : visibilityExperimentStats;
        const terrainAvg = terrainStats.rebuilds ? terrainStats.totalMs / terrainStats.rebuilds : 0;
        return [
            'EXTENDED RENDER DIAGNOSTICS',
            '===========================',
            `Render samples: ${renderStats.sampledFrames} | frame p95=${fmt(percentile(renderStats.frameSamples, .95))} ms max=${fmt(maxOf(renderStats.frameSamples))} ms`,
            `Map distribution: p95=${fmt(percentile(renderStats.mapSamples, .95))} ms max=${fmt(maxOf(renderStats.mapSamples))} ms | map-other p95=${fmt(percentile(renderStats.mapOtherSamples, .95))} ms max=${fmt(maxOf(renderStats.mapOtherSamples))} ms`,
            `Entity-pass distribution: p95=${fmt(percentile(renderStats.entitySamples, .95))} ms max=${fmt(maxOf(renderStats.entitySamples))} ms`,
            `Terrain-buffer rebuilds: ${terrainStats.rebuilds} | avg=${fmt(terrainAvg)} ms p95=${fmt(percentile(terrainStats.samples, .95))} ms max=${fmt(terrainStats.maxMs)} ms | last=${fmt(terrainStats.lastMs)} ms/${terrainStats.lastHexes} hexes`,
            `Render census: entities floor=${census.entityAliveFloor}, inBounds=${census.entityInBounds}, visible=${census.entityVisible}, pixelOnscreen=${census.entityPixelOnscreen}`,
            `Static-object census: tileObjects total=${census.tileObjectsTotal}, inBounds=${census.tileObjectsInBounds} | mapItemHexes total=${census.mapItemHexesTotal}, inBounds=${census.mapItemHexesInBounds}`,
            `Adjacent visibility shortcuts: ${visibilityExperimentStats.adjacentShortcuts}`,
            exp ? `Ring propagation experiment: candidates=${exp.candidates}, actualVisible=${exp.actualVisible}, wouldLOSCheck=${exp.propagationChecks}, wouldSkip=${exp.propagationRejects}, falseRejects=${exp.propagationFalseRejects}` : 'Ring propagation experiment: unavailable',
            'NOTE: ring propagation is diagnostic only; distance 0/1 auto-visibility is live.'
        ].join('\n');
    }
    window.getExtendedPerformanceDiagnostics = buildDiagnosticsText;

    // The existing iOS Copy Report control uses navigator.clipboard.writeText.
    // Append diagnostics only to HEX-CRPG profiler reports; every other
    // clipboard write on the page remains untouched.
    function installClipboardAppender() {
        const clipboard = navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function' || clipboard.writeText.__perfDiagnosticsAppender) return;
        const original = clipboard.writeText.bind(clipboard);
        const wrapped = function(text) {
            if (typeof text === 'string' && text.startsWith('HEX-CRPG PERFORMANCE REPORT') && !text.includes('EXTENDED RENDER DIAGNOSTICS')) {
                text += `\n\n${buildDiagnosticsText(true)}`;
            }
            return original(text);
        };
        wrapped.__perfDiagnosticsAppender = true;
        try { clipboard.writeText = wrapped; } catch (_) {}
    }

    function init() {
        const installAll = () => {
            installAdjacentVisibilityRule();
            installTerrainProbe();
            installClipboardAppender();
        };
        installAll();
        const retry = setInterval(installAll, 250);
        setTimeout(() => clearInterval(retry), 10000);
        requestAnimationFrame(sampleRenderFrames);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
