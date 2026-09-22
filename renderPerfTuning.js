// renderPerfTuning.js
// Measured mobile rendering optimisations that can sit above the legacy
// renderer without changing game rules.
(() => {
    'use strict';

    function installAppearancePreviewWrapperCoordinator() {
        const existingDescriptor = Object.getOwnPropertyDescriptor(window, 'updateAppearancePreview');
        if (existingDescriptor && !existingDescriptor.configurable) return false;
        let current = existingDescriptor?.get ? existingDescriptor.get.call(window) : window.updateAppearancePreview;
        Object.defineProperty(window, 'updateAppearancePreview', {
            configurable: true, enumerable: true,
            get() { return current; },
            set(next) {
                if (typeof next === 'function') {
                    const previous = current;
                    if (next.__directionalHumanFemalePreview && next.__legacyPreview?.__greenskinPreviewWrapper) next.__greenskinPreviewWrapper = true;
                    if (next.__greenskinPreviewWrapper && previous?.__directionalHumanFemalePreview) next.__directionalHumanFemalePreview = true;
                }
                current = next;
            },
        });
        window.__appearancePreviewWrapperCoordinatorInstalled = true;
        return true;
    }
    installAppearancePreviewWrapperCoordinator();

    const build = window.PRESENTATION_BUILD || 'npc-routines-v1';
    if (!document.querySelector('script[data-npc-routine-scheduler]')) {
        const scheduler = document.createElement('script');
        scheduler.src = `npcRoutineScheduler.js?build=${encodeURIComponent(build)}`;
        scheduler.dataset.npcRoutineScheduler = 'true'; scheduler.async = false; document.head.appendChild(scheduler);
    }
    if (!document.querySelector('script[data-event-driven-npc-schedules]')) {
        const bridge = document.createElement('script');
        bridge.src = `eventDrivenNpcSchedules.js?build=${encodeURIComponent(build)}`;
        bridge.dataset.eventDrivenNpcSchedules = 'true'; bridge.async = false; document.head.appendChild(bridge);
    }
    if (!document.querySelector('script[data-generated-civilian-population]')) {
        const civilians = document.createElement('script');
        civilians.src = `generatedCivilianPopulation.js?build=${encodeURIComponent(build)}`;
        civilians.dataset.generatedCivilianPopulation = 'true'; civilians.async = false; document.head.appendChild(civilians);
    }
    if (!document.querySelector('script[data-civilian-visual-diversity]')) {
        const civilianVisuals = document.createElement('script');
        civilianVisuals.src = `civilianVisualDiversity.js?build=${encodeURIComponent(build)}`;
        civilianVisuals.dataset.civilianVisualDiversity = 'true'; civilianVisuals.async = false; document.head.appendChild(civilianVisuals);
    }
    if (!document.querySelector('script[data-civilian-persistence]')) {
        const civilianPersistence = document.createElement('script');
        civilianPersistence.src = `civilianPersistence.js?build=${encodeURIComponent(build)}`;
        civilianPersistence.dataset.civilianPersistence = 'true'; civilianPersistence.async = false; document.head.appendChild(civilianPersistence);
    }
    if (!document.querySelector('script[data-civilian-routine-variety]')) {
        const routineVariety = document.createElement('script');
        routineVariety.src = `civilianRoutineVariety.js?build=${encodeURIComponent(build)}`;
        routineVariety.dataset.civilianRoutineVariety = 'true'; routineVariety.async = false; document.head.appendChild(routineVariety);
    }
    // The social-fabric pass is intentionally last: it consumes the persistent
    // civilian records/routine scheduler, expands Hollowmere's physical housing
    // and replaces synthetic radial home/work nodes with real addresses.
    if (!document.querySelector('script[data-hollowmere-social-fabric]')) {
        const social = document.createElement('script');
        social.src = `hollowmereSocialFabric.js?build=${encodeURIComponent(build)}`;
        social.dataset.hollowmereSocialFabric = 'true'; social.async = false; document.head.appendChild(social);
    }

    function installVisibilityBounds() {
        const original = window.isVisibleToPlayer;
        if (typeof original !== 'function' || original.__wideZoomBounds) return false;
        const boundsByFriendlies = new WeakMap();
        function boundsFor(friendlies) {
            if (!friendlies || typeof friendlies !== 'object') return null;
            const cached = boundsByFriendlies.get(friendlies); if (cached) return cached;
            let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
            for (const f of friendlies) {
                if (!f || !f.alive || !f.hex) continue;
                const range = (window.LIVE_VISION_RANGE || 25) + (f.visionBonus || 0);
                const occupied = f.getAllHexes ? f.getAllHexes() : [f.hex];
                for (const h of occupied) {
                    if (!h) continue;
                    minQ = Math.min(minQ, h.q - range); maxQ = Math.max(maxQ, h.q + range);
                    minR = Math.min(minR, h.r - range); maxR = Math.max(maxR, h.r + range);
                }
            }
            const bounds = Number.isFinite(minQ) ? { minQ, maxQ, minR, maxR } : null;
            boundsByFriendlies.set(friendlies, bounds); return bounds;
        }
        const fast = function(targetHex, friendliesOverride) {
            const friendlies = friendliesOverride || window.entities.filter(e => e.alive && e.side === 'player');
            const b = boundsFor(friendlies); if (!b) return false;
            if (targetHex.q < b.minQ || targetHex.q > b.maxQ || targetHex.r < b.minR || targetHex.r > b.maxR) return false;
            return original(targetHex, friendlies);
        };
        fast.__wideZoomBounds = true; fast.__original = original; window.isVisibleToPlayer = fast; return true;
    }
    if (installVisibilityBounds()) return;
    const timer = setInterval(() => { if (installVisibilityBounds()) clearInterval(timer); }, 25);
    setTimeout(() => clearInterval(timer), 5000);
})();