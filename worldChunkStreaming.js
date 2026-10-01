// worldChunkStreaming.js
// Continuous-world streaming for Campaign 2. Chunks are performance/LOD units,
// never gameplay zones: terrain remains addressable everywhere and there are no
// loading screens. Every alive party member contributes a hot bubble, so a
// split party simply keeps multiple distant parts of the world active at once.
(() => {
    'use strict';

    const CHUNK_SIZE = 24;
    const HOT_RADIUS_CHUNKS = 2;
    const STAIR_PRELOAD_RADIUS = 14;
    const PULSE_MS = 350;
    const MIN_PULSE_GAP_MS = 250;
    const VERTICAL_INDEX_REBUILD_MS = 5000;

    const activeChunks = new Set();
    const activeVerticalLayers = new Set();
    let observers = [];
    let observerBubbleCount = 0;
    let pulseCount = 0;
    let skippedPulseCount = 0;
    let lastPulseWallMs = -Infinity;
    let lastPulseMs = 0;
    let totalPulseMs = 0;
    let maxPulseMs = 0;

    // Stair locations are world topology, not per-frame state. The old pulse
    // rediscovered every ground-floor stair by scanning the entire tileObjects
    // dictionary once *per multi-storey building*, several times per second.
    // Cache that topology and rebuild it infrequently (or when the backing
    // collections themselves/number of buildings change).
    let verticalIndex = [];
    let verticalIndexBuiltAt = -Infinity;
    let indexedBuildingsRef = null;
    let indexedBuildingCount = -1;
    let indexedTileObjectsRef = null;
    let verticalIndexBuilds = 0;
    let lastVerticalIndexBuildMs = 0;

    const clockMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

    function floorOf(entity) {
        const f = entity?.currentFloor ?? entity?.floor ?? entity?.level;
        return Number.isFinite(Number(f)) ? Number(f) : 0;
    }

    function chunkCoord(n) {
        return Math.floor(Number(n || 0) / CHUNK_SIZE);
    }

    function chunkPosition(entity) {
        return {
            cq: chunkCoord(entity.hex.q),
            cr: chunkCoord(entity.hex.r),
            floor: floorOf(entity),
        };
    }

    function chunkKeyFromParts(cq, cr, floor = 0) {
        return `${cq},${cr},${Number(floor || 0)}`;
    }

    function chunkKey(hex, floor = 0) {
        if (!hex) return null;
        return chunkKeyFromParts(chunkCoord(hex.q), chunkCoord(hex.r), floor);
    }

    function playerObservers() {
        return (window.entities || []).filter(e =>
            e?.alive && e.side === 'player' && !e.rider && e.hex &&
            Number.isFinite(Number(e.hex.q)) && Number.isFinite(Number(e.hex.r))
        );
    }

    function bubblesOverlap(a, b) {
        if (a.floor !== b.floor) return false;
        // Each observer owns a square radius-R chunk bubble. Their expensive
        // crowd/AI budgets should be shared whenever those bubbles overlap.
        const diameter = HOT_RADIUS_CHUNKS * 2;
        return Math.abs(a.cq - b.cq) <= diameter && Math.abs(a.cr - b.cr) <= diameter;
    }

    function countObserverBubbles(nextObservers) {
        if (!nextObservers.length) return 0;
        const positions = nextObservers.map(chunkPosition);
        const seen = new Set();
        let groups = 0;
        for (let i = 0; i < positions.length; i++) {
            if (seen.has(i)) continue;
            groups++;
            const stack = [i];
            seen.add(i);
            while (stack.length) {
                const current = stack.pop();
                for (let j = 0; j < positions.length; j++) {
                    if (seen.has(j) || !bubblesOverlap(positions[current], positions[j])) continue;
                    seen.add(j);
                    stack.push(j);
                }
            }
        }
        return groups;
    }

    function distance(a,b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function buildingKey(building, index) {
        return String(building?.id || building?.key || building?.name || `building-${index}`);
    }

    function isStair(obj) {
        return !!obj && String(obj.type || '').startsWith('stair_');
    }

    function addStair(stairByFloor, floorIndex, q, r, obj) {
        if (!stairByFloor.has(floorIndex)) stairByFloor.set(floorIndex, []);
        stairByFloor.get(floorIndex).push({ q, r, obj });
    }

    function rebuildVerticalIndex(at = clockMs()) {
        const started = clockMs();
        const buildings = window.multiStoryBuildings || [];
        const globalTileObjects = window.tileObjects || {};
        const globalStairs = [];

        // One global scan, not one scan per building.
        for (const [key,obj] of Object.entries(globalTileObjects)) {
            if (!isStair(obj)) continue;
            const [q,r] = key.split(',').map(Number);
            if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
            globalStairs.push({ q, r, obj });
        }

        const next = [];
        buildings.forEach((building,index) => {
            const stairByFloor = new Map();
            const hasBounds = Number.isFinite(building?.minQ) && Number.isFinite(building?.maxQ)
                && Number.isFinite(building?.minR) && Number.isFinite(building?.maxR);

            if (hasBounds) {
                for (const stair of globalStairs) {
                    if (stair.q < building.minQ || stair.q > building.maxQ || stair.r < building.minR || stair.r > building.maxR) continue;
                    addStair(stairByFloor, 0, stair.q, stair.r, stair.obj);
                }
            }

            (building?.floors || []).forEach((floorData,floorIndex) => {
                if (!floorData?.tileObjects) return;
                for (const [key,obj] of Object.entries(floorData.tileObjects)) {
                    if (!isStair(obj)) continue;
                    const [q,r] = key.split(',').map(Number);
                    if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
                    addStair(stairByFloor, floorIndex, q, r, obj);
                }
            });

            next.push({ id:buildingKey(building,index), stairByFloor });
        });

        verticalIndex = next;
        verticalIndexBuiltAt = at;
        indexedBuildingsRef = buildings;
        indexedBuildingCount = buildings.length;
        indexedTileObjectsRef = globalTileObjects;
        verticalIndexBuilds++;
        lastVerticalIndexBuildMs = clockMs() - started;
        return verticalIndex;
    }

    function ensureVerticalIndex(at = clockMs()) {
        const buildings = window.multiStoryBuildings || [];
        const globalTileObjects = window.tileObjects || {};
        const changed = buildings !== indexedBuildingsRef
            || buildings.length !== indexedBuildingCount
            || globalTileObjects !== indexedTileObjectsRef;
        if (changed || at - verticalIndexBuiltAt >= VERTICAL_INDEX_REBUILD_MS) {
            return rebuildVerticalIndex(at);
        }
        return verticalIndex;
    }

    function preloadNearbyVerticalLayers(nextObservers) {
        activeVerticalLayers.clear();
        const index = ensureVerticalIndex();

        for (const {id,stairByFloor} of index) {
            for (const observer of nextObservers) {
                const observerFloor = floorOf(observer);
                const stairs = stairByFloor.get(observerFloor);
                if (!stairs?.length || !stairs.some(s => distance(observer.hex,s) <= STAIR_PRELOAD_RADIUS)) continue;
                activeVerticalLayers.add(`${id}:${observerFloor}`);
                for (const s of stairs) {
                    const to = Number(s.obj?.toFloor);
                    if (Number.isFinite(to)) activeVerticalLayers.add(`${id}:${to}`);
                }
            }
        }
    }

    function pulse(force = false) {
        const started = clockMs();
        // Generated-population systems also ask for a fresh stream snapshot.
        // Coalesce those requests with this module's own timer instead of doing
        // duplicate world scans back-to-back.
        if (!force && started - lastPulseWallMs < MIN_PULSE_GAP_MS) {
            skippedPulseCount++;
            return snapshot();
        }
        lastPulseWallMs = started;
        pulseCount++;
        observers = playerObservers();
        observerBubbleCount = countObserverBubbles(observers);
        activeChunks.clear();

        for (const observer of observers) {
            const floor = floorOf(observer);
            const cq = chunkCoord(observer.hex.q);
            const cr = chunkCoord(observer.hex.r);
            for (let dq=-HOT_RADIUS_CHUNKS; dq<=HOT_RADIUS_CHUNKS; dq++) {
                for (let dr=-HOT_RADIUS_CHUNKS; dr<=HOT_RADIUS_CHUNKS; dr++) {
                    activeChunks.add(chunkKeyFromParts(cq+dq,cr+dr,floor));
                }
            }
        }
        preloadNearbyVerticalLayers(observers);
        lastPulseMs = clockMs() - started;
        totalPulseMs += lastPulseMs;
        maxPulseMs = Math.max(maxPulseMs,lastPulseMs);
        return snapshot();
    }

    function isHexActive(hex, floor = 0) {
        const key = chunkKey(hex,floor);
        return !!key && activeChunks.has(key);
    }

    function nearestObserverDistance(hex, floor = 0) {
        let best = Infinity;
        for (const o of observers) {
            if (floorOf(o) !== Number(floor || 0)) continue;
            best = Math.min(best,distance(o.hex,hex));
        }
        return best;
    }

    function observersNear(hex, radius, floor = 0) {
        return observers.filter(o => floorOf(o) === Number(floor || 0) && distance(o.hex,hex) <= radius);
    }

    function snapshot() {
        return {
            chunkSize:CHUNK_SIZE,
            hotRadiusChunks:HOT_RADIUS_CHUNKS,
            observerCount:observers.length,
            observerBubbleCount,
            activeChunkCount:activeChunks.size,
            activeChunks:[...activeChunks],
            activeVerticalLayers:[...activeVerticalLayers],
            pulseCount,
            skippedPulseCount,
            lastPulseMs,
            avgPulseMs:pulseCount ? totalPulseMs / pulseCount : 0,
            maxPulseMs,
            verticalIndexBuilds,
            lastVerticalIndexBuildMs,
        };
    }

    window.WorldChunkStreaming = {
        CHUNK_SIZE,
        HOT_RADIUS_CHUNKS,
        STAIR_PRELOAD_RADIUS,
        pulse,
        chunkKey,
        isHexActive,
        nearestObserverDistance,
        observersNear,
        countObserverBubbles,
        rebuildVerticalIndex,
        get observers(){ return observers.slice(); },
        get observerBubbleCount(){ return observerBubbleCount; },
        get activeChunks(){ return new Set(activeChunks); },
        get activeVerticalLayers(){ return new Set(activeVerticalLayers); },
        get stats(){ return snapshot(); },
    };

    pulse(true);
    window.__worldChunkStreamingTimer = setInterval(pulse,PULSE_MS);
})();
