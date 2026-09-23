// renderPerfTuning.js
// Measured mobile rendering optimisations that can sit above the legacy
// renderer without changing game rules.
(() => {
    'use strict';

    function installAppearancePreviewWrapperCoordinator() {
        const existingDescriptor = Object.getOwnPropertyDescriptor(window, 'updateAppearancePreview');
        if (existingDescriptor && !existingDescriptor.configurable) return false;
        let current = existingDescriptor?.get
            ? existingDescriptor.get.call(window)
            : window.updateAppearancePreview;

        Object.defineProperty(window, 'updateAppearancePreview', {
            configurable: true,
            enumerable: true,
            get() { return current; },
            set(next) {
                if (typeof next === 'function') {
                    const previous = current;
                    if (next.__directionalHumanFemalePreview && next.__legacyPreview?.__greenskinPreviewWrapper) {
                        next.__greenskinPreviewWrapper = true;
                    }
                    if (next.__greenskinPreviewWrapper && previous?.__directionalHumanFemalePreview) {
                        next.__directionalHumanFemalePreview = true;
                    }
                }
                current = next;
            },
        });
        window.__appearancePreviewWrapperCoordinatorInstalled = true;
        return true;
    }
    installAppearancePreviewWrapperCoordinator();

    const build = window.PRESENTATION_BUILD || 'npc-routines-v1';
    const load = (selector, src, datasetKey) => {
        if (document.querySelector(selector)) return;
        const script = document.createElement('script');
        script.src = `${src}?build=${encodeURIComponent(build)}`;
        script.dataset[datasetKey] = 'true';
        script.async = false;
        document.head.appendChild(script);
    };

    load('script[data-npc-routine-scheduler]', 'npcRoutineScheduler.js', 'npcRoutineScheduler');
    load('script[data-event-driven-npc-schedules]', 'eventDrivenNpcSchedules.js', 'eventDrivenNpcSchedules');

    // Settlement tiers are descriptive metadata only. They never switch maps
    // or decide which district is loaded; worldChunkStreaming owns the actual
    // seamless hot/cold simulation state around every party member.
    load('script[data-settlement-scale]', 'settlementScale.js', 'settlementScale');
    load('script[data-settlement-safety]', 'settlementSafety.js', 'settlementSafety');
    load('script[data-world-chunk-streaming]', 'worldChunkStreaming.js', 'worldChunkStreaming');

    load('script[data-generated-civilian-population]', 'generatedCivilianPopulation.js', 'generatedCivilianPopulation');
    load('script[data-multi-anchor-civilian-streaming]', 'multiAnchorCivilianStreaming.js', 'multiAnchorCivilianStreaming');
    load('script[data-civilian-visual-diversity]', 'civilianVisualDiversity.js', 'civilianVisualDiversity');
    load('script[data-civilian-persistence]', 'civilianPersistence.js', 'civilianPersistence');
    load('script[data-civilian-routine-variety]', 'civilianRoutineVariety.js', 'civilianRoutineVariety');
    load('script[data-hollowmere-social-fabric]', 'hollowmereSocialFabric.js', 'hollowmereSocialFabric');
    load('script[data-silverhart-capital-rebuild]', 'silverhartCapitalRebuild.js', 'silverhartCapitalRebuild');

    // The capital population is persistent but chunk-indexed: hundreds of
    // residents can exist without hundreds of live Entity objects.
    load('script[data-silverhart-population]', 'silverhartPopulation.js', 'silverhartPopulation');

    function installVisibilityBounds() {
        const original = window.isVisibleToPlayer;
        if (typeof original !== 'function' || original.__wideZoomBounds) return false;

        const boundsByFriendlies = new WeakMap();

        function boundsFor(friendlies) {
            if (!friendlies || typeof friendlies !== 'object') return null;
            const cached = boundsByFriendlies.get(friendlies);
            if (cached) return cached;

            let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
            for (const f of friendlies) {
                if (!f || !f.alive || !f.hex) continue;
                const range = (window.LIVE_VISION_RANGE || 25) + (f.visionBonus || 0);
                const occupied = f.getAllHexes ? f.getAllHexes() : [f.hex];
                for (const h of occupied) {
                    if (!h) continue;
                    minQ = Math.min(minQ, h.q - range);
                    maxQ = Math.max(maxQ, h.q + range);
                    minR = Math.min(minR, h.r - range);
                    maxR = Math.max(maxR, h.r + range);
                }
            }
            const bounds = Number.isFinite(minQ) ? { minQ, maxQ, minR, maxR } : null;
            boundsByFriendlies.set(friendlies, bounds);
            return bounds;
        }

        const fast = function(targetHex, friendliesOverride) {
            const friendlies = friendliesOverride || window.entities.filter(e => e.alive && e.side === 'player');
            const b = boundsFor(friendlies);
            if (!b) return false;
            if (targetHex.q < b.minQ || targetHex.q > b.maxQ || targetHex.r < b.minR || targetHex.r > b.maxR) {
                return false;
            }
            return original(targetHex, friendlies);
        };
        fast.__wideZoomBounds = true;
        fast.__original = original;
        window.isVisibleToPlayer = fast;
        return true;
    }

    if (installVisibilityBounds()) return;
    const timer = setInterval(() => {
        if (installVisibilityBounds()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 5000);
})();