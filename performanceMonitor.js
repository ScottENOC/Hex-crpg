// performanceMonitor.js
// Opt-in runtime profiler for mobile/live testing. It is deliberately inert
// until enabled from Settings so ordinary play pays no wrapper/timing cost.
(() => {
    'use strict';

    const TRACKED_FUNCTIONS = [
        'collectPartyHexes',
        'checkInCombat',
        'checkPlayerCombatDisengage',
        'isCombatDormant',
        'isDormantAmbientNpc',
        'rebuildRestlessSet',
        'takeTurn',
        'canSee',
        'processRealTimeStep',
        'updateVisualPositions',
        'findPath',
        'getEntityAtHex',
        'isVisibleToPlayer',
        'hasLineOfSight',
        'getTerrainAt',
        'updateNpcSchedules',
        'tickNpcRoutines',
        'tickWorldPulse',
        'updateWorldPulse',
        'updateTime',
        'drawMap',
        'renderEntities',
        'updateTurnIndicator'
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

    const state = {
        enabled: false,
        tickSamples: [],
        functionStats: new Map(),
        slowTicks: []
    };

    function now() { return performance.now(); }

    function percentile(values, p) {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
        return sorted[idx];
    }

    function pushCapped(arr, value, cap) {
        arr.push(value);
        if (arr.length > cap) arr.splice(0, arr.length - cap);
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

        const topSections = Object.entries(finished.sections)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, ms]) => ({ name, ms, calls: finished.calls[name] || 0 }));
        const snapshot = {
            id: finished.id,
            ms: elapsed,
            atMs: now() - sessionStartedAt,
            sections: topSections
        };
        state.slowTicks.push(snapshot);
        state.slowTicks.sort((a, b) => b.ms - a.ms);
        if (state.slowTicks.length > SLOW_TICK_COUNT) state.slowTicks.length = SLOW_TICK_COUNT;
    }

    function beginTick() {
        if (!state.enabled) return null;
        // During accelerated rest runTickInternal can be called repeatedly in
        // one JS task. Close the previous logical simulation tick before the
        // next one begins instead of letting them collapse into one sample.
        if (currentTick) finishCurrentTick();
        const id = ++tickSerial;
        currentTick = { id, startedAt: now(), sections: Object.create(null), calls: Object.create(null) };
        // Normal real-time tick() performs movement/render work synchronously
        // *after* runTickInternal returns. A microtask closes the sample only
        // after that outer tick call finishes, so those wrapped functions are
        // still attributed to the same tick without modifying gameEngine.js.
        queueMicrotask(() => finishCurrentTick(id));
        return id;
    }

    function makeWrapper(name, original) {
        if (name === 'runTickInternal') {
            const wrappedTick = function(...args) {
                if (!state.enabled) return original.apply(this, args);
                beginTick();
                const t0 = now();
                try {
                    return original.apply(this, args);
                } finally {
                    recordFunction('runTickInternal (simulation)', now() - t0);
                }
            };
            wrappedTick.__performanceMonitorWrapper = true;
            wrappedTick.__performanceMonitorOriginal = original;
            return wrappedTick;
        }
        const wrapped = function(...args) {
            if (!state.enabled) return original.apply(this, args);
            const t0 = now();
            try {
                return original.apply(this, args);
            } finally {
                recordFunction(name, now() - t0);
            }
        };
        wrapped.__performanceMonitorWrapper = true;
        wrapped.__performanceMonitorOriginal = original;
        return wrapped;
    }

    function wrapFunction(name) {
        const current = window[name];
        if (typeof current !== 'function') return;
        if (current.__performanceMonitorWrapper) return;
        const wrapped = makeWrapper(name, current);
        wrappers.set(name, { original: current, wrapped });
        window[name] = wrapped;
    }

    function installWrappers() {
        wrapFunction('runTickInternal');
        TRACKED_FUNCTIONS.forEach(wrapFunction);
    }

    function restoreWrappers() {
        for (const [name, pair] of wrappers) {
            if (window[name] === pair.wrapped) window[name] = pair.original;
        }
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
        rewrapTimer = null;
        overlayTimer = null;
        restoreWrappers();
        const overlay = document.getElementById('performance-monitor-overlay');
        if (overlay) overlay.remove();
        syncSettingsUI();
    }

    function fmt(ms) { return Number(ms || 0).toFixed(ms >= 10 ? 1 : 2); }

    function environmentLines() {
        const renderStats = window.performanceRenderStats || {};
        return [
            `Captured: ${new Date().toISOString()}`,
            `Session: ${sessionStartedAt == null ? '0.0' : ((now() - sessionStartedAt) / 1000).toFixed(1)} s`,
            `Campaign: ${window.currentCampaign ?? 'unknown'} | combat: ${!!window.isInCombat}`,
            `Entities: ${(window.entities || []).length} | zoom: ${(window.cameraZoom || 1).toFixed(2)}`,
            `Frame-rate mode: ${window.frameRateMode || 'unknown'} | render scale: ${window.renderScale || 1} | foliage: ${window.foliageDetail || 'unknown'}`,
            `Render coalescer: frames=${renderStats.frames || 0}, avg=${fmt(renderStats.avgFrameMs || 0)} ms, last=${fmt(renderStats.lastFrameMs || 0)} ms, coalesced=${renderStats.coalesced || 0}`,
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
            pct: totalTickMs ? (100 * stat.totalMs / totalTickMs) : 0,
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
            '- A tick begins at runTickInternal and closes after the surrounding synchronous game tick finishes.',
            '- p95/call uses the most recent capped call sample set; totals/call counts cover the whole profiling session.'
        );
        return lines.join('\n');
    }

    async function copyReport() {
        const report = getReport();
        let copied = false;
        try {
            await navigator.clipboard.writeText(report);
            copied = true;
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = report;
            ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
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
        const existing = document.getElementById('performance-monitor-report-modal');
        if (existing) existing.remove();
        const shell = document.createElement('div');
        shell.id = 'performance-monitor-report-modal';
        shell.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
        const panel = document.createElement('div');
        panel.style.cssText = 'width:min(760px,96vw);height:min(78vh,720px);background:#20252b;color:#fff;border:1px solid #78909c;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;';
        const textarea = document.createElement('textarea');
        textarea.value = getReport();
        textarea.readOnly = true;
        textarea.style.cssText = 'flex:1;width:100%;box-sizing:border-box;background:#111;color:#d7f7ff;font:11px monospace;white-space:pre;';
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;gap:8px;';
        const copy = document.createElement('button');
        copy.textContent = 'Copy Report';
        copy.onclick = () => copyReport();
        const close = document.createElement('button');
        close.textContent = 'Close';
        close.onclick = () => shell.remove();
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
        overlay.style.cssText = 'position:fixed;right:max(6px,env(safe-area-inset-right));bottom:max(6px,env(safe-area-inset-bottom));z-index:100000;background:rgba(10,14,18,.90);color:#d7f7ff;border:1px solid #607d8b;border-radius:7px;padding:7px;max-width:min(310px,92vw);font:11px monospace;box-shadow:0 2px 8px rgba(0,0,0,.4);';
        overlay.innerHTML = '<div id="performance-monitor-summary" style="white-space:pre;line-height:1.3;"></div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;"><button id="performance-monitor-copy">Copy Report</button><button id="performance-monitor-show">Show Report</button><button id="performance-monitor-reset">Reset</button><button id="performance-monitor-disable">Off</button></div><div id="performance-monitor-copy-status" style="margin-top:4px;color:#9fe6a0;"></div>';
        document.body.appendChild(overlay);
        overlay.querySelector('#performance-monitor-copy').onclick = () => copyReport();
        overlay.querySelector('#performance-monitor-show').onclick = () => showReport();
        overlay.querySelector('#performance-monitor-reset').onclick = () => reset();
        overlay.querySelector('#performance-monitor-disable').onclick = () => disable();
        return overlay;
    }

    function updateOverlay() {
        if (!state.enabled) return;
        const overlay = ensureOverlay();
        const el = overlay.querySelector('#performance-monitor-summary');
        const ticks = state.tickSamples;
        const avg = ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0;
        const rows = [...state.functionStats.entries()]
            .map(([name, s]) => ({ name, ms: ticks.length ? s.totalMs / ticks.length : 0 }))
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 5);
        el.textContent = [
            `PERF ON  ticks ${ticks.length}`,
            `tick avg ${fmt(avg)}ms  p95 ${fmt(percentile(ticks, .95))}  max ${fmt(ticks.length ? Math.max(...ticks) : 0)}`,
            ...rows.map(r => `${r.name}: ${fmt(r.ms)} ms/tick`)
        ].join('\n');
    }

    function syncSettingsUI() {
        const check = document.getElementById('performance-monitor-enabled');
        if (check) check.checked = state.enabled;
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
                <label><input type="checkbox" id="performance-monitor-enabled"> Enable diagnostic profiler</label>
                <div id="performance-monitor-settings-status" style="font-size:.8em;color:#aaa;margin-top:4px;"></div>
                <div style="font-size:.75em;color:#aaa;margin-top:4px;">Collects per-tick and per-function timings until you turn it off or reset it. Leave off for normal play.</div>
            </div>
            <div class="form-group" style="display:flex;gap:6px;flex-wrap:wrap;">
                <button id="performance-monitor-settings-copy">Copy Report</button>
                <button id="performance-monitor-settings-show">Show Report</button>
                <button id="performance-monitor-settings-reset">Reset</button>
            </div>`;
        settings.appendChild(section);
        section.querySelector('#performance-monitor-enabled').addEventListener('change', e => e.target.checked ? enable() : disable());
        section.querySelector('#performance-monitor-settings-copy').onclick = () => copyReport();
        section.querySelector('#performance-monitor-settings-show').onclick = () => showReport();
        section.querySelector('#performance-monitor-settings-reset').onclick = () => reset();
        syncSettingsUI();
    }

    const api = {
        get enabled() { return state.enabled; },
        enable,
        disable,
        reset,
        getReport,
        copyReport,
        showReport,
        installWrappers,
        get tickCount() { return state.tickSamples.length; }
    };
    window.performanceMonitor = api;
    window.setPerformanceMonitorEnabled = enabled => enabled ? enable() : disable();
    window.copyPerformanceReport = copyReport;
    window.getPerformanceReport = getReport;

    function init() {
        injectSettingsUI();
        // Settings can be reconstructed by future UI code; cheap retry keeps
        // the control present without profiling anything while disabled.
        const settingsRetry = setInterval(() => {
            injectSettingsUI();
            if (document.getElementById('performance-monitor-settings')) clearInterval(settingsRetry);
        }, 500);
        setTimeout(() => clearInterval(settingsRetry), 10000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
