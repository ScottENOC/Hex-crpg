// entityRenderInstrumentation.js
// Lightweight entity-render diagnostics bridge.
//
// Humanoid compositing and caching now belong to humanoidRenderer.js.
// This file deliberately does NOT prebuild four views, wrap drawPlayerCharacter,
// or keep a second per-entity composite cache. Those behaviours caused the
// loading screen to build four sprites per character and duplicated memory.
//
// The performance UI reads the authoritative lazy final-sprite cache through
// getHumanoidCompositeCacheDiagnostics().

(() => {
    'use strict';
    if (window.__entityRenderInstrumentationInstalled) return;
    window.__entityRenderInstrumentationInstalled = true;

    const stats = window.entityRenderInstrumentationStats = {
        installed: true,
        calls: 0,
        totalMs: 0,
        maxMs: 0,
        humanoidCalls: 0,
        humanoidMs: 0,
        humanoidMaxMs: 0,
        customCalls: 0,
        customMs: 0,
        customMaxMs: 0,
        creatureCalls: 0,
        creatureMs: 0,
        creatureMaxMs: 0,
        otherCalls: 0,
        otherMs: 0,
        otherMaxMs: 0,
        installs: 1,
        prebuildEntities: 0,
        prebuildViews: 0,
        prebuildFailures: 0,
        lazyBuilds: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheFailed: 0
    };

    window.getHumanoidCompositeCacheDiagnostics = () => {
        const cache = window.humanoidSpriteCacheStats || {};
        const details = typeof window.getHumanoidSpriteCacheDetails === 'function'
            ? window.getHumanoidSpriteCacheDetails()
            : [];
        const size = Number(cache.size || 0);
        const max = Number(cache.max || 0);
        const builds = Number(cache.builds || 0);
        const hits = Number(cache.hits || 0);
        const misses = Math.max(0, builds - hits);
        return {
            installed: true,
            ready: true,
            cacheType: 'lazy-final-appearance',
            size,
            max,
            builds,
            hits,
            misses,
            lazyBuilds: builds,
            cacheHits: hits,
            cacheMisses: misses,
            cacheFailed: Number(cache.failed || 0),
            entities: details.length,
            completeEntities: details.length,
            totalViews: size,
            expectedViews: size,
            details
        };
    };

    window.EntityRenderInstrumentation = {
        report() {
            const s = window.entityRenderInstrumentationStats;
            const sprite = window.getHumanoidCompositeCacheDiagnostics?.() || {};
            return [
                'ENTITY RENDER INSTRUMENTATION',
                '=============================',
                'No secondary humanoid compositor/cache is installed.',
                `Final appearance cache: ${sprite.size || 0}/${sprite.max || 0} entries; builds=${sprite.builds || 0}; hits=${sprite.hits || 0}; misses=${sprite.misses || 0}`,
                `Instrumentation calls=${s.calls || 0} (render timing remains in performanceMonitor)`
            ].join('\\n');
        }
    };
})();
