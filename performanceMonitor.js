// performanceMonitor.js
// Opt-in runtime profiler for mobile/live testing. Inert until enabled.
(() => {
    'use strict';

    // Deliberately exclude ultra-hot microscopic helpers such as
    // isVisibleToPlayer/hasLineOfSight/getTerrainAt/isDormantAmbientNpc.
    // Wrapping those individually adds millions of performance.now() calls at
    // low zoom and measurably distorts the render time we are trying to study.
    const TRACKED_FUNCTIONS = [
        'collectPartyHexes', 'checkInCombat', 'checkPlayerCombatDisengage',
        'isCombatDormant', 'rebuildRestlessSet', 'takeTurn', 'canSee',
        'processRealTimeStep', 'updateVisualPositions', 'findPath',
        'getEntityAtHex', 'updateNpcSchedules', 'tickNpcRoutines',
        'tickWorldPulse', 'updateWorldPulse', 'updateTime', 'drawMap',
        'renderEntities', 'updateTurnIndicator'
    ];
    const MAX_TICK_SAMPLES = 6000;
    const MAX_CALL_SAMPLES = 2000;
    const SLOW_TICK_COUNT = 20;
    const wrappers = new Map();
    let rewrapTimer = null;
    let overlayTimer = null;
    let currentTick = null;
    let tickSerial = 0;
    let sessionStartedAt = null;
    const state = { enabled: false, tickSamples: [], functionStats: new Map(), slowTicks: [] };

    const now = () => performance.now();
    function percentile(values, p) {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
    }
    function pushCapped(arr, value, cap) {
        arr.push(value);
        if (arr.length > cap) arr.splice(0, arr.length - cap);
    }
    function fmt(ms) { return Number(ms || 0).toFixed(ms >= 10 ? 1 : 2); }

    // Render-only visibility fast path. Gameplay perception remains completely
    // camera-independent: outside the synchronous drawMap pass every caller
    // still reaches the normal isVisibleToPlayer implementation. The render
    // path instead precomputes the actual visible set by enumerating only the
    // bounded vision discs around friendly characters and applying the normal
    // LOS/light rules to those candidates. drawMap's much larger low-zoom
    // viewport scan then becomes Set.has() rather than "screen hex -> range ->
    // lighting -> LOS" for thousands of distant hexes.
    function installRenderVisibilityFastPath() {
        if (window.__renderVisibilityFastPathInstalled) return true;
        if (typeof window.isVisibleToPlayer !== 'function' || typeof window.refreshPlayerVisibilityCache !== 'function') return false;

        const baseVisibility = window.isVisibleToPlayer;
        const baseRefresh = window.refreshPlayerVisibilityCache;
        const stats = window.performanceRenderVisibilityStats = {
            rebuilds: 0,
            candidates: 0,
            visible: 0,
            renderQueries: 0,
            renderHits: 0,
            gameplayFallbacks: 0
        };
        let renderVisibleKeys = new Set();
        let canonicalFriendlies = [];
        let lastObservedClearCount = -1;
        let renderFastActive = false;

        function sameFriendlies(list) {
            if (!list || list.length !== canonicalFriendlies.length) return false;
            for (let i = 0; i < list.length; i++) if (list[i] !== canonicalFriendlies[i]) return false;
            return true;
        }

        function rebuildRenderVisibleSet() {
            canonicalFriendlies = (window.entities || []).filter(e => e?.alive && e.side === 'player');
            const candidates = new Map();
            const liveBase = window.LIVE_VISION_RANGE || 25;

            for (const friendly of canonicalFriendlies) {
                const origins = friendly.getAllHexes ? friendly.getAllHexes() : [friendly.hex];
                const maxRange = Math.max(0, liveBase + (friendly.visionBonus || 0));
                const radius = Math.ceil(maxRange);
                for (const origin of origins) {
                    if (!origin) continue;
                    for (let dq = -radius; dq <= radius; dq++) {
                        const minDr = Math.max(-radius, -dq - radius);
                        const maxDr = Math.min(radius, -dq + radius);
                        for (let dr = minDr; dr <= maxDr; dr++) {
                            const q = origin.q + dq;
                            const r = origin.r + dr;
                            const dist = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
                            if (dist > maxRange) continue;
                            const key = `${q},${r}`;
                            if (!candidates.has(key)) candidates.set(key, { q, r });
                        }
                    }
                }
            }

            const nextVisible = new Set();
            for (const [key, hex] of candidates) {
                if (baseVisibility(hex, canonicalFriendlies)) nextVisible.add(key);
            }
            renderVisibleKeys = nextVisible;
            stats.rebuilds++;
            stats.candidates += candidates.size;
            stats.visible += nextVisible.size;
        }

        const fastVisibility = function(targetHex, friendliesOverride) {
            if (!renderFastActive || (friendliesOverride && !sameFriendlies(friendliesOverride))) {
                stats.gameplayFallbacks++;
                return baseVisibility.apply(this, arguments);
            }
            stats.renderQueries++;
            const hit = renderVisibleKeys.has(`${targetHex.q},${targetHex.r}`);
            if (hit) stats.renderHits++;
            return hit;
        };
        fastVisibility.__renderViewportFastPath = true;
        fastVisibility.__original = baseVisibility;
        window.isVisibleToPlayer = fastVisibility;

        window.refreshPlayerVisibilityCache = function(...args) {
            const result = baseRefresh.apply(this, args);
            const cacheStats = window.performanceVisibilityCacheStats || {};
            const clearCount = cacheStats.clears || 0;
            if (!renderVisibleKeys.size || clearCount !== lastObservedClearCount) {
                lastObservedClearCount = clearCount;
                rebuildRenderVisibleSet();
            } else {
                canonicalFriendlies = (window.entities || []).filter(e => e?.alive && e.side === 'player');
            }

            // graphicsSettings invokes refresh immediately before the real,
            // synchronous drawMap call inside its RAF flush. Keep the fast path
            // active for the remainder of this JS task only; the microtask runs
            // after drawMap returns, before unrelated gameplay work resumes.
            renderFastActive = true;
            queueMicrotask(() => { renderFastActive = false; });
            return result;
        };
        window.refreshPlayerVisibilityCache.__renderViewportFastPath = true;
        window.refreshPlayerVisibilityCache.__original = baseRefresh;
        window.__renderVisibilityFastPathInstalled = true;
        return true;
    }

    function bindTap(element, handler) {
        if (!element) return;
        let suppressClickUntil = 0;
        element.style.touchAction = 'manipulation';
        element.style.webkitUserSelect = 'none';
        element.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        element.addEventListener('touchend', e => {
            e.preventDefault();
            e.stopPropagation();
            suppressClickUntil = now() + 700;
            handler(e);
        }, { passive: false });
        element.addEventListener('click', e => {
            if (now() < suppressClickUntil) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            handler(e);
        });
    }

    function statFor(name) {
        let stat = state.functionStats.get(name);
        if (!stat) {
            stat = { calls: 0, totalMs: 0, maxMs: 0, samples: [] };
            state.functionStats.set(name, stat);
        }
        return stat;
    }
    function recordFunction(name, ms) {
        if (!state.enabled || !Number.isFinite(ms)) return;
        const stat = statFor(name);
        stat.calls++;
        stat.totalMs += ms;
        stat.maxMs = Math.max(stat.maxMs, ms);
        pushCapped(stat.samples, ms, MAX_CALL_SAMPLES);
        if (currentTick) {
            currentTick.sections[name] = (currentTick.sections[name] || 0) + ms;
            currentTick.calls[name] = (currentTick.calls[name] || 0) + 1;
        }
    }
    function finishCurrentTick(expectedId = null) {
        if (!currentTick || (expectedId !== null && currentTick.id !== expectedId)) return;
        const finished = currentTick;
        currentTick = null;
        const elapsed = Math.max(0, now() - finished.startedAt);
        pushCapped(state.tickSamples, elapsed, MAX_TICK_SAMPLES);
        const sections = Object.entries(finished.sections)
            .sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([name, ms]) => ({ name, ms, calls: finished.calls[name] || 0 }));
        state.slowTicks.push({ id: finished.id, ms: elapsed, atMs: now() - sessionStartedAt, sections });
        state.slowTicks.sort((a, b) => b.ms - a.ms);
        if (state.slowTicks.length > SLOW_TICK_COUNT) state.slowTicks.length = SLOW_TICK_COUNT;
    }
    function beginTick() {
        if (!state.enabled) return;
        if (currentTick) finishCurrentTick();
        const id = ++tickSerial;
        currentTick = { id, startedAt: now(), sections: Object.create(null), calls: Object.create(null) };
        queueMicrotask(() => finishCurrentTick(id));
    }

    function makeWrapper(name, original) {
        const wrapped = function(...args) {
            if (!state.enabled) return original.apply(this, args);
            if (name === 'runTickInternal') beginTick();
            const t0 = now();
            try { return original.apply(this, args); }
            finally { recordFunction(name === 'runTickInternal' ? 'runTickInternal (simulation)' : name, now() - t0); }
        };
        wrapped.__performanceMonitorWrapper = true;
        wrapped.__performanceMonitorOriginal = original;
        return wrapped;
    }
    function wrapFunction(name) {
        const current = window[name];
        if (typeof current !== 'function' || current.__performanceMonitorWrapper) return;
        const wrapped = makeWrapper(name, current);
        wrappers.set(name, { original: current, wrapped });
        window[name] = wrapped;
    }
    function installWrappers() {
        wrapFunction('runTickInternal');
        TRACKED_FUNCTIONS.forEach(wrapFunction);
    }
    function restoreWrappers() {
        for (const [name, pair] of wrappers) if (window[name] === pair.wrapped) window[name] = pair.original;
        wrappers.clear();
    }

    function reset() {
        state.tickSamples.length = 0;
        state.functionStats.clear();
        state.slowTicks.length = 0;
        currentTick = null;
        tickSerial = 0;
        sessionStartedAt = now();
        updateOverlay();
    }
    function enable() {
        if (state.enabled) return;
        reset();
        state.enabled = true;
        installWrappers();
        rewrapTimer = setInterval(installWrappers, 1000);
        ensureOverlay();
        overlayTimer = setInterval(updateOverlay, 500);
        syncSettingsUI();
        updateOverlay();
    }
    function disable() {
        if (!state.enabled) return;
        finishCurrentTick();
        state.enabled = false;
        if (rewrapTimer) clearInterval(rewrapTimer);
        if (overlayTimer) clearInterval(overlayTimer);
        rewrapTimer = overlayTimer = null;
        restoreWrappers();
        document.getElementById('performance-monitor-overlay')?.remove();
        syncSettingsUI();
    }

    function environmentLines() {
        const r = window.performanceRenderStats || {};
        const v = window.performanceVisibilityCacheStats || {};
        const rv = window.performanceRenderVisibilityStats || {};
        const totalVis = (v.hits || 0) + (v.misses || 0);
        const hitRate = totalVis ? (100 * (v.hits || 0) / totalVis).toFixed(1) : '0.0';
        return [
            `Captured: ${new Date().toISOString()}`,
            `Session: ${sessionStartedAt == null ? '0.0' : ((now() - sessionStartedAt) / 1000).toFixed(1)} s`,
            `Campaign: ${window.currentCampaign ?? 'unknown'} | combat: ${!!window.isInCombat}`,
            `Entities: ${(window.entities || []).length} | zoom: ${(window.cameraZoom || 1).toFixed(2)}`,
            `Frame-rate mode: ${window.frameRateMode || 'unknown'} | render scale: ${window.renderScale || 1} | foliage: ${window.foliageDetail || 'unknown'}`,
            `Render coalescer: frames=${r.frames || 0}, avg=${fmt(r.avgFrameMs || 0)} ms, last=${fmt(r.lastFrameMs || 0)} ms, coalesced=${r.coalesced || 0}`,
            `Render breakdown: mapFrames=${r.mapFrames || 0}, map avg=${fmt(r.avgMapMs || 0)} ms, map-other avg=${fmt(r.avgMapOtherMs || 0)} ms, entities avg=${fmt(r.avgEntitiesMs || 0)} ms`,
            `Render last: map=${fmt(r.lastMapMs || 0)} ms, map-other=${fmt(r.lastMapOtherMs || 0)} ms, entities=${fmt(r.lastEntitiesMs || 0)} ms, entityOnlyFrames=${r.entityOnlyFrames || 0}`,
            `Visibility cache: hits=${v.hits || 0}, misses=${v.misses || 0}, hitRate=${hitRate}%, rangeRejects=${v.rangeRejects || 0}, entries=${v.entries || 0}, clears=${v.clears || 0}, refreshes=${v.refreshes || 0}`,
            `Render visibility: rebuilds=${rv.rebuilds || 0}, candidates=${rv.candidates || 0}, visible=${rv.visible || 0}, renderQueries=${rv.renderQueries || 0}, renderHits=${rv.renderHits || 0}, gameplayFallbacks=${rv.gameplayFallbacks || 0}`,
            `User agent: ${navigator.userAgent}`
        ];
    }

    function getReport() {
        if (currentTick) finishCurrentTick();
        const ticks = state.tickSamples.slice();
        const tickCount = ticks.length;
        const totalTickMs = ticks.reduce((a, b) => a + b, 0);
        const tickAvg = tickCount ? totalTickMs / tickCount : 0;
        const over10 = ticks.filter(v => v > 10).length;
        const over16 = ticks.filter(v => v > 16.67).length;
        const over33 = ticks.filter(v => v > 33.33).length;
        const lines = [
            'HEX-CRPG PERFORMANCE REPORT',
            '===========================',
            ...environmentLines(),
            '',
            'TICK WALL TIME',
            `Samples: ${tickCount}`,
            `Average: ${fmt(tickAvg)} ms | p50: ${fmt(percentile(ticks, .50))} ms | p95: ${fmt(percentile(ticks, .95))} ms | p99: ${fmt(percentile(ticks, .99))} ms | max: ${fmt(ticks.length ? Math.max(...ticks) : 0)} ms`,
            `Slow ticks: >10ms ${over10} (${tickCount ? (100 * over10 / tickCount).toFixed(1) : 0}%) | >16.7ms ${over16} (${tickCount ? (100 * over16 / tickCount).toFixed(1) : 0}%) | >33.3ms ${over33} (${tickCount ? (100 * over33 / tickCount).toFixed(1) : 0}%)`,
            '',
            'INCLUSIVE FUNCTION TIMINGS',
            'Nested timings overlap, so rows should not be added together.',
            'function | ms/tick | % tick | calls/tick | avg/call | p95/call | max/call | calls'
        ];
        const rows = [...state.functionStats.entries()].map(([name, stat]) => ({
            name,
            msPerTick: tickCount ? stat.totalMs / tickCount : 0,
            pct: totalTickMs ? 100 * stat.totalMs / totalTickMs : 0,
            callsPerTick: tickCount ? stat.calls / tickCount : 0,
            avgCall: stat.calls ? stat.totalMs / stat.calls : 0,
            p95Call: percentile(stat.samples, .95),
            maxCall: stat.maxMs,
            calls: stat.calls
        })).sort((a, b) => b.msPerTick - a.msPerTick);
        for (const r of rows) {
            lines.push(`${r.name} | ${fmt(r.msPerTick)} | ${r.pct.toFixed(1)}% | ${r.callsPerTick.toFixed(2)} | ${fmt(r.avgCall)} | ${fmt(r.p95Call)} | ${fmt(r.maxCall)} | ${r.calls}`);
        }
        lines.push('', 'SLOWEST TICK SNAPSHOTS');
        if (!state.slowTicks.length) lines.push('(none captured)');
        state.slowTicks.forEach((tick, i) => {
            const parts = tick.sections.map(s => `${s.name} ${fmt(s.ms)}ms${s.calls > 1 ? ` x${s.calls}` : ''}`);
            lines.push(`#${i + 1}: ${fmt(tick.ms)} ms at +${(tick.atMs / 1000).toFixed(1)}s${parts.length ? ` -> ${parts.join(', ')}` : ''}`);
        });
        lines.push('', 'NOTES',
            '- Profiling is opt-in and wrappers are removed when disabled.',
            '- Function timings are inclusive: a parent includes time spent in wrapped children.',
            '- Render breakdown is measured inside the real requestAnimationFrame flush; map-other excludes entity rendering invoked from drawMap.',
            '- Ultra-hot tiny helpers (visibility, LOS, terrain lookup, dormancy check) are intentionally not individually timed because observer overhead distorted low-zoom rendering.',
            '- Render visibility is precomputed from friendly vision discs; gameplay visibility remains camera-independent and uses the normal full-world path outside drawMap.',
            '- Visibility-cache counters report those hot-path calls without wrapping each helper.',
            '- A tick begins at runTickInternal and closes after the surrounding synchronous game tick finishes.',
            '- p95/call uses the most recent capped call sample set; totals/call counts cover the whole profiling session.'
        );
        return lines.join('\n');
    }

    async function copyReport() {
        const report = getReport();
        let copied = false;
        try { await navigator.clipboard.writeText(report); copied = true; }
        catch (_) {
            const ta = document.createElement('textarea');
            ta.value = report;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try { copied = document.execCommand('copy'); } catch (_) {}
            ta.remove();
        }
        const status = document.getElementById('performance-monitor-copy-status');
        if (status) {
            status.textContent = copied ? 'Report copied.' : 'Copy failed — use Show Report and copy the text manually.';
            setTimeout(() => { if (status) status.textContent = ''; }, 2500);
        }
        return report;
    }

    function showReport() {
        document.getElementById('performance-monitor-report-modal')?.remove();
        const shell = document.createElement('div');
        shell.id = 'performance-monitor-report-modal';
        shell.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;pointer-events:auto;touch-action:manipulation;';
        shell.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        shell.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
        const panel = document.createElement('div');
        panel.style.cssText = 'width:min(760px,96vw);height:min(78vh,720px);background:#20252b;color:#fff;border:1px solid #78909c;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;';
        const textarea = document.createElement('textarea');
        textarea.value = getReport();
        textarea.readOnly = true;
        textarea.style.cssText = 'flex:1;width:100%;box-sizing:border-box;background:#111;color:#d7f7ff;font:11px monospace;white-space:pre;-webkit-user-select:text;user-select:text;';
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;gap:8px;';
        const copy = document.createElement('button'); copy.textContent = 'Copy Report';
        const close = document.createElement('button'); close.textContent = 'Close';
        [copy, close].forEach(b => b.style.cssText = 'min-height:44px;padding:8px 12px;touch-action:manipulation;');
        bindTap(copy, () => copyReport());
        bindTap(close, () => shell.remove());
        buttons.append(copy, close);
        panel.append(textarea, buttons);
        shell.appendChild(panel);
        document.body.appendChild(shell);
    }

    function ensureOverlay() {
        let overlay = document.getElementById('performance-monitor-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'performance-monitor-overlay';
        overlay.style.cssText = 'position:fixed;right:max(6px,env(safe-area-inset-right));bottom:max(6px,env(safe-area-inset-bottom));z-index:2147483646;background:rgba(10,14,18,.90);color:#d7f7ff;border:1px solid #607d8b;border-radius:7px;padding:7px;max-width:min(310px,92vw);font:11px monospace;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:auto;touch-action:manipulation;isolation:isolate;transform:translateZ(0);';
        overlay.innerHTML = '<div id="performance-monitor-summary" style="white-space:pre;line-height:1.3;pointer-events:none;"></div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;"><button id="performance-monitor-copy">Copy Report</button><button id="performance-monitor-show">Show Report</button><button id="performance-monitor-reset">Reset</button><button id="performance-monitor-disable">Off</button></div><div id="performance-monitor-copy-status" style="margin-top:4px;color:#9fe6a0;pointer-events:none;"></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        overlay.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
        const actions = [
            ['#performance-monitor-copy', () => copyReport()],
            ['#performance-monitor-show', () => showReport()],
            ['#performance-monitor-reset', () => reset()],
            ['#performance-monitor-disable', () => disable()]
        ];
        for (const [selector, action] of actions) {
            const button = overlay.querySelector(selector);
            button.style.cssText = 'min-height:44px;padding:6px 9px;touch-action:manipulation;';
            bindTap(button, action);
        }
        return overlay;
    }

    function updateOverlay() {
        if (!state.enabled) return;
        const overlay = ensureOverlay();
        const el = overlay.querySelector('#performance-monitor-summary');
        const ticks = state.tickSamples;
        const avg = ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0;
        const rs = window.performanceRenderStats || {};
        const vs = window.performanceVisibilityCacheStats || {};
        const rv = window.performanceRenderVisibilityStats || {};
        const totalVis = (vs.hits || 0) + (vs.misses || 0);
        const rows = [...state.functionStats.entries()]
            .map(([name, s]) => ({ name, ms: ticks.length ? s.totalMs / ticks.length : 0 }))
            .sort((a, b) => b.ms - a.ms).slice(0, 3);
        el.textContent = [
            `PERF ON ticks ${ticks.length}`,
            `tick avg ${fmt(avg)}ms p95 ${fmt(percentile(ticks, .95))}`,
            `frame ${fmt(rs.avgFrameMs)}ms map-other ${fmt(rs.avgMapOtherMs)} entities ${fmt(rs.avgEntitiesMs)}`,
            `vis hits ${vs.hits || 0}/${totalVis} reject ${vs.rangeRejects || 0}`,
            `render-vis rebuilds ${rv.rebuilds || 0} q ${rv.renderQueries || 0}`,
            ...rows.map(r => `${r.name}: ${fmt(r.ms)} ms/tick`)
        ].join('\n');
    }

    function syncSettingsUI() {
        const check = document.getElementById('performance-monitor-enabled');
        if (check) check.checked = state.enabled;
        const toggle = document.getElementById('performance-monitor-toggle');
        if (toggle) {
            toggle.textContent = state.enabled ? 'Stop Profiling' : 'Start Profiling';
            toggle.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
        }
        const status = document.getElementById('performance-monitor-settings-status');
        if (status) status.textContent = state.enabled ? `Profiling ${state.tickSamples.length} ticks` : 'Off (zero profiling wrappers installed)';
    }

    function injectSettingsUI() {
        if (document.getElementById('performance-monitor-settings')) return;
        const settings = document.getElementById('settings-content');
        if (!settings) return;
        const section = document.createElement('div');
        section.id = 'performance-monitor-settings';
        section.innerHTML = `
            <h3>Performance Monitor</h3>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="performance-monitor-enabled"> Enable diagnostic profiler</label>
                <button id="performance-monitor-toggle" type="button" aria-pressed="false" style="width:100%;min-height:48px;margin-top:8px;padding:10px 14px;touch-action:manipulation;font-weight:600;">Start Profiling</button>
                <div id="performance-monitor-settings-status" style="font-size:.8em;color:#aaa;margin-top:4px;"></div>
                <div style="font-size:.75em;color:#aaa;margin-top:4px;">Collects per-tick, per-function and real render-frame timings until you turn it off or reset it.</div>
            </div>
            <div class="form-group" style="display:flex;gap:6px;flex-wrap:wrap;">
                <button id="performance-monitor-settings-copy">Copy Report</button>
                <button id="performance-monitor-settings-show">Show Report</button>
                <button id="performance-monitor-settings-reset">Reset</button>
            </div>`;
        settings.appendChild(section);
        section.querySelector('#performance-monitor-enabled').addEventListener('change', e => e.target.checked ? enable() : disable());
        bindTap(section.querySelector('#performance-monitor-toggle'), () => state.enabled ? disable() : enable());
        const actions = [
            ['#performance-monitor-settings-copy', () => copyReport()],
            ['#performance-monitor-settings-show', () => showReport()],
            ['#performance-monitor-settings-reset', () => reset()]
        ];
        for (const [selector, action] of actions) {
            const button = section.querySelector(selector);
            button.style.cssText += ';min-height:44px;touch-action:manipulation;';
            bindTap(button, action);
        }
        syncSettingsUI();
    }

    const api = {
        get enabled() { return state.enabled; },
        enable, disable, reset, getReport, copyReport, showReport, installWrappers,
        get tickCount() { return state.tickSamples.length; }
    };
    window.performanceMonitor = api;
    window.setPerformanceMonitorEnabled = enabled => enabled ? enable() : disable();
    window.copyPerformanceReport = copyReport;
    window.getPerformanceReport = getReport;

    function init() {
        installRenderVisibilityFastPath();
        const renderVisRetry = setInterval(() => {
            if (installRenderVisibilityFastPath()) clearInterval(renderVisRetry);
        }, 250);
        setTimeout(() => clearInterval(renderVisRetry), 10000);

        injectSettingsUI();
        const settingsRetry = setInterval(() => {
            injectSettingsUI();
            if (document.getElementById('performance-monitor-settings')) clearInterval(settingsRetry);
        }, 500);
        setTimeout(() => clearInterval(settingsRetry), 10000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();