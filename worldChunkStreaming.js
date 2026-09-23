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

    const activeChunks = new Set();
    const activeVerticalLayers = new Set();
    let observers = [];
    let observerBubbleCount = 0;
    let pulseCount = 0;

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

    function preloadNearbyVerticalLayers(nextObservers) {
        activeVerticalLayers.clear();
        const buildings = window.multiStoryBuildings || [];
        buildings.forEach((building, index) => {
            const id = buildingKey(building,index);
            const floors = building?.floors || [];
            const stairByFloor = new Map();

            for (const [k,obj] of Object.entries(window.tileObjects || {})) {
                if (!obj || !String(obj.type || '').startsWith('stair_')) continue;
                const [q,r] = k.split(',').map(Number);
                if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
                const inBounds = Number.isFinite(building?.minQ) && Number.isFinite(building?.maxQ)
                    ? q >= building.minQ && q <= building.maxQ && r >= building.minR && r <= building.maxR
                    : false;
                if (inBounds) {
                    if (!stairByFloor.has(0)) stairByFloor.set(0,[]);
                    stairByFloor.get(0).push({q,r,obj});
                }
            }

            floors.forEach((floorData,floorIndex) => {
                if (!floorData?.tileObjects) return;
                for (const [k,obj] of Object.entries(floorData.tileObjects)) {
                    if (!obj || !String(obj.type || '').startsWith('stair_')) continue;
                    const [q,r] = k.split(',').map(Number);
                    if (!stairByFloor.has(floorIndex)) stairByFloor.set(floorIndex,[]);
                    stairByFloor.get(floorIndex).push({q,r,obj});
                }
            });

            for (const observer of nextObservers) {
                const observerFloor = floorOf(observer);
                for (const [floorIndex,stairs] of stairByFloor) {
                    if (floorIndex !== observerFloor) continue;
                    if (!stairs.some(s => distance(observer.hex,s) <= STAIR_PRELOAD_RADIUS)) continue;
                    activeVerticalLayers.add(`${id}:${floorIndex}`);
                    for (const s of stairs) {
                        const to = Number(s.obj?.toFloor);
                        if (Number.isFinite(to)) activeVerticalLayers.add(`${id}:${to}`);
                    }
                }
            }
        });
    }

    function pulse() {
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
        get observers(){ return observers.slice(); },
        get observerBubbleCount(){ return observerBubbleCount; },
        get activeChunks(){ return new Set(activeChunks); },
        get activeVerticalLayers(){ return new Set(activeVerticalLayers); },
        get stats(){ return snapshot(); },
    };

    pulse();
    window.__worldChunkStreamingTimer = setInterval(pulse,PULSE_MS);
})();
