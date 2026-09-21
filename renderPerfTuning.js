// renderPerfTuning.js
// Measured mobile rendering optimisations that can sit above the legacy
// renderer without changing game rules.
(() => {
    'use strict';

    // directionalCharacterUI.js and raceSkinPalettes.js both decorate the
    // character-creator preview after main.js publishes it. They initialise on
    // different polling cadences, so without coordination they can alternately
    // wrap one another. The directional wrapper keeps its legacy callback in a
    // module variable, and repeated wrapping can therefore create a call cycle.
    // Intercept assignments while this early bootstrap is alive and propagate
    // the other decorator's marker onto the new outer wrapper. Each module then
    // sees its feature already present and stops wrapping after one composition.
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

    // The routine scheduler is intentionally loaded from this already-small,
    // early presentation/performance bootstrap rather than adding another
    // heavyweight dependency to gameEngine.js. It owns no rendering state;
    // this just guarantees the event-driven civilian clock is available in
    // every normal game mode without changing the legacy script order.
    const build = window.PRESENTATION_BUILD || 'npc-routines-v1';
    if (!document.querySelector('script[data-npc-routine-scheduler]')) {
        const scheduler = document.createElement('script');
        scheduler.src = `npcRoutineScheduler.js?build=${encodeURIComponent(build)}`;
        scheduler.dataset.npcRoutineScheduler = 'true';
        scheduler.async = false;
        document.head.appendChild(scheduler);
    }

    // Bridge the existing Campaign 2 named timetables onto the scheduler.
    // Dynamic scripts with async=false execute in insertion order, so this is
    // evaluated after npcRoutineScheduler.js; it then waits for gameEngine.js's
    // classic global updateNpcSchedules/getNpcSchedules bindings before install.
    if (!document.querySelector('script[data-event-driven-npc-schedules]')) {
        const bridge = document.createElement('script');
        bridge.src = `eventDrivenNpcSchedules.js?build=${encodeURIComponent(build)}`;
        bridge.dataset.eventDrivenNpcSchedules = 'true';
        bridge.async = false;
        document.head.appendChild(bridge);
    }

    function installVisibilityBounds() {
        const original = window.isVisibleToPlayer;
        if (typeof original !== 'function' || original.__wideZoomBounds) return false;

        // drawMap passes one stable friendlies array through all visibility
        // checks for a frame. Cache a conservative world-space bounding box
        // for that array: a target outside it cannot possibly be visible, so
        // avoid the more expensive per-friendly distance/light/LOS path.
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
