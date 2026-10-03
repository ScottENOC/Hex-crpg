// visibilityHotPathCache.js
// Several callers ask isVisibleToPlayer(target) without supplying the party
// list. Older wrappers then filtered the whole entity roster every call. In a
// populated persistent world that is far more expensive than the party-sized
// LOS work itself. Reuse party membership briefly, while still keying bounds
// to live party positions/vision so movement updates immediately.
(() => {
    'use strict';

    const MEMBERSHIP_REFRESH_MS = 250;
    const RESULT_SLICE_MS = 20;
    const INSTALL_RETRY_MS = 500;
    const stats = window.visibilityHotPathStats = {
        installed:false,
        calls:0,
        suppliedOverrideCalls:0,
        cachedMembershipCalls:0,
        membershipRebuilds:0,
        boundsHits:0,
        boundsRebuilds:0,
        boundsRejects:0,
        resultHits:0,
        resultMisses:0,
        resultCacheResets:0,
    };

    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

    let cachedEntitiesRef = null;
    let cachedEntityCount = -1;
    let cachedFriendlies = [];
    let membershipValidUntil = -Infinity;
    let lastBoundsKey = null;
    let lastBounds = null;
    let resultContextKey = null;
    const resultCache = new Map();

    function defaultFriendlies() {
        const entities = window.entities || [];
        const t = now();
        if (entities !== cachedEntitiesRef || entities.length !== cachedEntityCount || t >= membershipValidUntil) {
            cachedEntitiesRef = entities;
            cachedEntityCount = entities.length;
            cachedFriendlies = entities.filter(e => e?.alive && e.side === 'player');
            membershipValidUntil = t + MEMBERSHIP_REFRESH_MS;
            stats.membershipRebuilds++;
        }
        return cachedFriendlies;
    }

    function boundsFor(friendlies) {
        let key = '';
        let minQ=Infinity,maxQ=-Infinity,minR=Infinity,maxR=-Infinity;
        for (const f of friendlies || []) {
            if (!f?.alive || !f.hex) continue;
            const range = Number(window.LIVE_VISION_RANGE || 25) + Number(f.visionBonus || 0);
            const occupied = f.getAllHexes ? f.getAllHexes() : [f.hex];
            key += `${f.id ?? f.name ?? 'p'}:${range}:`;
            for (const h of occupied) {
                if (!h) continue;
                key += `${h.q},${h.r};`;
                minQ=Math.min(minQ,h.q-range); maxQ=Math.max(maxQ,h.q+range);
                minR=Math.min(minR,h.r-range); maxR=Math.max(maxR,h.r+range);
            }
        }
        if (key === lastBoundsKey) {
            stats.boundsHits++;
            return lastBounds;
        }
        lastBoundsKey = key;
        lastBounds = Number.isFinite(minQ) ? {minQ,maxQ,minR,maxR} : null;
        stats.boundsRebuilds++;
        return lastBounds;
    }

    function prepareResultCache() {
        // Visibility can change when the party moves, light/floor changes, or
        // simply on the next render slice after a door/terrain mutation. The
        // 20 ms slice lets drawMap + renderEntities share LOS answers without
        // ever turning this into long-lived world-state caching.
        const slice = Math.floor(now() / RESULT_SLICE_MS);
        const key = `${lastBoundsKey || '-'}|${Number(window.lightLevel ?? -1)}|${Number(window._viewerFloor || 0)}|${slice}`;
        if (key !== resultContextKey) {
            resultContextKey = key;
            resultCache.clear();
            stats.resultCacheResets++;
        }
    }

    function install() {
        const current = window.isVisibleToPlayer;
        if (typeof current !== 'function') return false;
        if (current.__visibilityHotPathCache) { stats.installed=true; return true; }

        const wrapped = function(targetHex, friendliesOverride) {
            stats.calls++;
            const friendlies = friendliesOverride || defaultFriendlies();
            if (friendliesOverride) stats.suppliedOverrideCalls++;
            else stats.cachedMembershipCalls++;

            if (!targetHex) {
                const downstreamFriendlies = friendliesOverride ? friendlies : friendlies.slice();
                return current.call(this, targetHex, downstreamFriendlies);
            }

            const bounds = boundsFor(friendlies);
            if (!bounds) return false;
            prepareResultCache();
            const resultKey = `${targetHex.q},${targetHex.r}`;
            if (resultCache.has(resultKey)) {
                stats.resultHits++;
                return resultCache.get(resultKey);
            }

            if (targetHex.q < bounds.minQ || targetHex.q > bounds.maxQ || targetHex.r < bounds.minR || targetHex.r > bounds.maxR) {
                stats.boundsRejects++;
                resultCache.set(resultKey, false);
                return false;
            }

            // The older wide-bounds wrapper caches by array identity. When
            // there is no caller-supplied per-frame array, pass a tiny party
            // copy so its old WeakMap cannot retain stale bounds after the
            // party walks. This still avoids the expensive full-entity filter.
            const downstreamFriendlies = friendliesOverride ? friendlies : friendlies.slice();
            const visible = current.call(this, targetHex, downstreamFriendlies);
            resultCache.set(resultKey, visible);
            stats.resultMisses++;
            return visible;
        };
        wrapped.__visibilityHotPathCache = true;
        wrapped.__original = current;
        window.isVisibleToPlayer = wrapped;
        stats.installed = true;
        return true;
    }

    window.VisibilityHotPathCache = { install, stats, MEMBERSHIP_REFRESH_MS, RESULT_SLICE_MS };
    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    }
})();
