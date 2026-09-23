// adaptiveMobileRenderScale.js
// A conservative mobile-only safety net for sustained expensive frames.
(() => {
    'use strict';

    const LEVELS = [1, 0.82, 0.68];
    const SAMPLE_MS = 1000;
    const COOLDOWN_MS = 8000;
    let level = 0;
    let slowSamples = 0;
    let fastSamples = 0;
    let lastChangeAt = 0;
    let lastFrameCount = 0;
    let adjustments = 0;

    function isCoarsePointerDevice() {
        try {
            return navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)')?.matches;
        } catch (_) {
            return navigator.maxTouchPoints > 0;
        }
    }

    function userPinnedScale() {
        try { return localStorage.getItem('rpg_render_scale') !== null; }
        catch (_) { return false; }
    }

    function applyLevel(nextLevel, { force = false } = {}) {
        const next = Math.max(0, Math.min(LEVELS.length - 1, nextLevel));
        if (next === level) return false;
        if (!force && userPinnedScale()) return false;
        level = next;
        const scale = LEVELS[level];
        window.renderScale = scale;
        window._renderScale = scale;
        if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
        if (window.resizeCanvas) window.resizeCanvas();
        lastChangeAt = performance.now();
        adjustments++;
        return true;
    }

    function evaluateSample(frameMs, { force = false, now = performance.now() } = {}) {
        if (!Number.isFinite(frameMs) || frameMs <= 0) return false;
        if (!force && (!isCoarsePointerDevice() || window.frameRateMode !== 'auto' || userPinnedScale())) return false;
        if (!force && now - lastChangeAt < COOLDOWN_MS) return false;

        if (frameMs >= 38) {
            slowSamples += 2;
            fastSamples = 0;
        } else if (frameMs >= 24) {
            slowSamples++;
            fastSamples = 0;
        } else if (frameMs <= 14) {
            fastSamples++;
            slowSamples = Math.max(0, slowSamples - 1);
        } else {
            slowSamples = Math.max(0, slowSamples - 1);
            fastSamples = Math.max(0, fastSamples - 1);
        }

        if (slowSamples >= 4 && level < LEVELS.length - 1) {
            slowSamples = 0;
            fastSamples = 0;
            return applyLevel(level + 1, { force });
        }
        if (fastSamples >= 10 && level > 0) {
            slowSamples = 0;
            fastSamples = 0;
            return applyLevel(level - 1, { force });
        }
        return false;
    }

    function sample() {
        const stats = window.performanceRenderStats;
        if (!stats || stats.frames === lastFrameCount) return;
        lastFrameCount = stats.frames;
        // lastFrameMs reacts quickly to newly-heavy scenes; avgFrameMs keeps a
        // single loading spike from changing quality by itself. Use the larger
        // only after several frames have actually been rendered.
        const ms = stats.frames >= 12 ? Math.max(stats.lastFrameMs || 0, stats.avgFrameMs || 0) : (stats.lastFrameMs || 0);
        evaluateSample(ms);
    }

    window.AdaptiveMobileRenderScale = {
        evaluateSample,
        applyLevel,
        get level() { return level; },
        get scale() { return LEVELS[level]; },
        get stats() { return { level, scale: LEVELS[level], slowSamples, fastSamples, adjustments, userPinned: userPinnedScale() }; },
        LEVELS: [...LEVELS],
    };

    window.__adaptiveMobileRenderScaleTimer = setInterval(sample, SAMPLE_MS);
})();
