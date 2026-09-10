// renderPerfTuning.js
// Measured mobile rendering optimisations that can sit above the legacy
// renderer without changing game rules.
(() => {
    'use strict';

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
