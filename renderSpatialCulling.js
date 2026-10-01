// renderSpatialCulling.js
// renderEntities historically iterates every key in window.mapItems and
// window.tileObjects before rejecting off-screen entries. In a persistent
// world that makes render cost scale with the whole map. Keep a lightweight
// chunk index and, only for the duration of renderEntities(), expose a nearby
// dictionary view. Gameplay continues to see the full dictionaries.
(() => {
    'use strict';

    const BUCKET_SIZE = 16;
    const INDEX_REFRESH_MS = 250;
    const INSTALL_RETRY_MS = 500;

    const stats = window.renderSpatialCullingStats = {
        installed:false,
        indexRebuilds:0,
        renderCalls:0,
        mapItemsSelected:0,
        tileObjectsSelected:0,
        lastMapItemsSelected:0,
        lastTileObjectsSelected:0,
        lastIndexBuildMs:0,
        maxIndexBuildMs:0,
    };

    const state = {
        mapItems:{ ref:null, builtAt:-Infinity, buckets:new Map() },
        tileObjects:{ ref:null, builtAt:-Infinity, buckets:new Map() },
    };

    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

    const bucketCoord = n => Math.floor(Number(n || 0) / BUCKET_SIZE);
    const bucketKey = (q,r) => `${bucketCoord(q)},${bucketCoord(r)}`;

    function parseCoord(key) {
        const comma = key.indexOf(',');
        if (comma < 0) return null;
        const q = Number(key.slice(0, comma));
        const r = Number(key.slice(comma + 1));
        return Number.isFinite(q) && Number.isFinite(r) ? {q,r} : null;
    }

    function rebuild(kind, dict, at = now()) {
        const started = now();
        const target = state[kind];
        const buckets = new Map();
        for (const key in (dict || {})) {
            const pos = parseCoord(key);
            if (!pos) continue;
            const bKey = bucketKey(pos.q,pos.r);
            let bucket = buckets.get(bKey);
            if (!bucket) buckets.set(bKey, bucket = []);
            bucket.push({ key, q:pos.q, r:pos.r });
        }
        target.ref = dict;
        target.builtAt = at;
        target.buckets = buckets;
        stats.indexRebuilds++;
        stats.lastIndexBuildMs = now() - started;
        stats.maxIndexBuildMs = Math.max(stats.maxIndexBuildMs, stats.lastIndexBuildMs);
    }

    function ensureIndex(kind, dict, at = now()) {
        const target = state[kind];
        if (target.ref !== dict || at - target.builtAt >= INDEX_REFRESH_MS) rebuild(kind, dict, at);
        return target;
    }

    function selectionBounds() {
        const visible = window.getVisibleHexes?.();
        if (!visible) return null;

        // LOS for an on-screen target can start at a party member just outside
        // the camera. Expand by current vision range so temporarily hiding
        // distant tileObjects cannot make an obstacle disappear from an LOS
        // ray that still matters to what the player can see.
        let margin = Math.max(6, Number(window.LIVE_VISION_RANGE || 25));
        for (const e of (window.entities || [])) {
            if (!e?.alive || e.side !== 'player') continue;
            margin = Math.max(margin, Number(window.LIVE_VISION_RANGE || 25) + Number(e.visionBonus || 0));
        }
        margin = Math.min(80, Math.ceil(margin));
        return {
            minQ:visible.minQ-margin, maxQ:visible.maxQ+margin,
            minR:visible.minR-margin, maxR:visible.maxR+margin,
        };
    }

    function subset(kind, dict, bounds, at) {
        if (!bounds) return dict;
        const index = ensureIndex(kind, dict, at);
        const result = Object.create(null);
        const minBQ = bucketCoord(bounds.minQ), maxBQ = bucketCoord(bounds.maxQ);
        const minBR = bucketCoord(bounds.minR), maxBR = bucketCoord(bounds.maxR);
        for (let bq=minBQ; bq<=maxBQ; bq++) {
            for (let br=minBR; br<=maxBR; br++) {
                const bucket = index.buckets.get(`${bq},${br}`);
                if (!bucket) continue;
                for (const entry of bucket) {
                    if (entry.q < bounds.minQ || entry.q > bounds.maxQ || entry.r < bounds.minR || entry.r > bounds.maxR) continue;
                    // Deletions are visible immediately even if the periodic
                    // spatial index has not rebuilt yet. New keys can be at
                    // most INDEX_REFRESH_MS late before entering the index.
                    if (!Object.prototype.hasOwnProperty.call(dict, entry.key)) continue;
                    result[entry.key] = dict[entry.key];
                }
            }
        }
        return result;
    }

    let rendering = false;
    function install() {
        const current = window.renderEntities;
        if (typeof current !== 'function') return false;
        if (current.__spatialDictionaryCull) { stats.installed=true; return true; }

        const wrapped = function(...args) {
            if (rendering) return current.apply(this,args);
            const bounds = selectionBounds();
            if (!bounds) return current.apply(this,args);

            const fullMapItems = window.mapItems || {};
            const fullTileObjects = window.tileObjects || {};
            const at = now();
            const visibleMapItems = subset('mapItems', fullMapItems, bounds, at);
            const visibleTileObjects = subset('tileObjects', fullTileObjects, bounds, at);

            stats.renderCalls++;
            stats.lastMapItemsSelected = Object.keys(visibleMapItems).length;
            stats.lastTileObjectsSelected = Object.keys(visibleTileObjects).length;
            stats.mapItemsSelected += stats.lastMapItemsSelected;
            stats.tileObjectsSelected += stats.lastTileObjectsSelected;

            rendering = true;
            window.mapItems = visibleMapItems;
            window.tileObjects = visibleTileObjects;
            try {
                return current.apply(this,args);
            } finally {
                window.mapItems = fullMapItems;
                window.tileObjects = fullTileObjects;
                rendering = false;
            }
        };
        wrapped.__spatialDictionaryCull = true;
        wrapped.__original = current;
        window.renderEntities = wrapped;
        stats.installed = true;
        return true;
    }

    window.invalidateRenderSpatialIndex = () => {
        state.mapItems.builtAt = -Infinity;
        state.tileObjects.builtAt = -Infinity;
    };
    window.RenderSpatialCulling = { install, rebuild, stats, BUCKET_SIZE, INDEX_REFRESH_MS };

    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    }
})();
