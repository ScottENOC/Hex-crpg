// npcRoutineScheduler.js
// Lightweight persistent routine state for large civilian populations.
//
// The important rule is that an NPC does NOT need an exact map position or an
// AI update every tick just because they exist. Most civilians can sit in a
// node/activity state, or travel abstractly between two nodes. Only code that
// actually needs a position (rendering, combat promotion, dialogue, etc.) asks
// for one. Routine transitions are driven by a min-heap of future events, so
// cost is proportional to events that become due rather than population size.
(() => {
    'use strict';

    const DEFAULT_EVENT_BUDGET = 128;
    const TICK_MS = 250;
    const states = new Map();
    const entityRefs = new Map();
    const handlers = new Map();
    const heap = [];
    // A deleted NPC can later be recreated with the same stable ID. Keep the
    // last event generation outside the live state map so lazily-cancelled heap
    // entries from the old incarnation can never become live again when that ID
    // is reused (critical for population resizing and save/load reconstruction).
    const generationTombstones = new Map();
    let sequence = 0;
    let lastObservedWorldSeconds = null;

    const keyOf = id => String(id);

    function compareEvents(a, b) {
        return a.at - b.at || a.sequence - b.sequence;
    }

    function heapSwap(a, b) {
        const tmp = heap[a]; heap[a] = heap[b]; heap[b] = tmp;
    }

    function heapPush(event) {
        heap.push(event);
        let i = heap.length - 1;
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (compareEvents(heap[p], heap[i]) <= 0) break;
            heapSwap(i, p); i = p;
        }
    }

    function heapPop() {
        if (!heap.length) return null;
        const root = heap[0];
        const tail = heap.pop();
        if (heap.length) {
            heap[0] = tail;
            let i = 0;
            while (true) {
                const left = i * 2 + 1;
                const right = left + 1;
                let smallest = i;
                if (left < heap.length && compareEvents(heap[left], heap[smallest]) < 0) smallest = left;
                if (right < heap.length && compareEvents(heap[right], heap[smallest]) < 0) smallest = right;
                if (smallest === i) break;
                heapSwap(i, smallest); i = smallest;
            }
        }
        return root;
    }

    function cloneHex(hex) {
        return hex && Number.isFinite(hex.q) && Number.isFinite(hex.r)
            ? { q: hex.q, r: hex.r }
            : null;
    }

    function registerNpc(id, spec = {}) {
        const key = keyOf(id);
        const existing = states.get(key);
        if (existing) {
            Object.assign(existing, spec);
            existing.id = id;
            return existing;
        }
        const inheritedGeneration = generationTombstones.get(key) || 0;
        const state = {
            id,
            simulationLevel: spec.simulationLevel || 'dormant',
            activity: spec.activity || 'idle',
            currentNode: spec.currentNode ?? null,
            currentHex: cloneHex(spec.currentHex),
            travel: spec.travel ? { ...spec.travel } : null,
            metadata: spec.metadata ? { ...spec.metadata } : {},
            eventGeneration: Number.isFinite(spec.eventGeneration) ? spec.eventGeneration : inheritedGeneration,
            travelGeneration: Number.isFinite(spec.travelGeneration) ? spec.travelGeneration : 0,
        };
        generationTombstones.set(key, state.eventGeneration);
        states.set(key, state);
        return state;
    }

    function registerEntity(entity, spec = {}) {
        if (!entity || entity.id === undefined || entity.id === null) return null;
        const state = registerNpc(entity.id, {
            currentHex: entity.hex,
            ...spec,
        });
        entityRefs.set(keyOf(entity.id), entity);
        return state;
    }

    function unregisterNpc(id) {
        const key = keyOf(id);
        const state = states.get(key);
        const previous = state?.eventGeneration ?? generationTombstones.get(key) ?? 0;
        const nextGeneration = previous + 1;
        if (state) state.eventGeneration = nextGeneration;
        generationTombstones.set(key, nextGeneration);
        states.delete(key);
        entityRefs.delete(key);
    }

    function getState(id) {
        return states.get(keyOf(id)) || null;
    }

    function scheduleEvent(id, atWorldSeconds, type, payload = null) {
        if (!Number.isFinite(atWorldSeconds)) throw new Error('NPC routine event time must be finite');
        const state = getState(id) || registerNpc(id);
        const event = {
            npcId: id,
            at: atWorldSeconds,
            type,
            payload,
            generation: state.eventGeneration,
            sequence: sequence++,
        };
        heapPush(event);
        return event;
    }

    function clearNpcEvents(id) {
        const state = getState(id);
        if (state) {
            state.eventGeneration++;
            generationTombstones.set(keyOf(id), state.eventGeneration);
        } else {
            const key = keyOf(id);
            generationTombstones.set(key, (generationTombstones.get(key) || 0) + 1);
        }
        // Stale heap entries are intentionally left in place. They are skipped
        // lazily when they reach the top, avoiding an O(queue) delete pass.
    }

    function registerHandler(type, fn) {
        if (typeof fn !== 'function') throw new Error('NPC routine handler must be a function');
        handlers.set(type, fn);
    }

    function processDueEvents(now = Number(window.worldSeconds || 0), options = {}) {
        const maxEvents = Math.max(1, Number(options.maxEvents || DEFAULT_EVENT_BUDGET));
        let processed = 0;
        let skipped = 0;
        while (heap.length && heap[0].at <= now && processed < maxEvents) {
            const event = heapPop();
            const state = getState(event.npcId);
            if (!state || event.generation !== state.eventGeneration) {
                skipped++;
                continue;
            }
            const handler = handlers.get(event.type);
            if (handler) handler(state, event, now);
            processed++;
        }
        return {
            processed,
            skipped,
            remainingDue: !!(heap.length && heap[0].at <= now),
            queued: heap.length,
            population: states.size,
        };
    }

    function setSimulationLevel(id, level, reason = null) {
        if (!['dormant', 'abstract', 'active'].includes(level)) throw new Error(`Unknown NPC simulation level: ${level}`);
        const state = getState(id) || registerNpc(id);
        state.simulationLevel = level;
        state.activeReason = reason;
        return state;
    }

    function promoteNpc(id, reason = 'nearby') {
        return setSimulationLevel(id, 'active', reason);
    }

    function demoteNpc(id, level = 'abstract') {
        return setSimulationLevel(id, level, null);
    }

    function beginAbstractTravel(id, trip) {
        const state = getState(id) || registerNpc(id);
        const departedAt = Number(trip.departedAt ?? window.worldSeconds ?? 0);
        const arrivesAt = Number(trip.arrivesAt);
        if (!Number.isFinite(arrivesAt) || arrivesAt < departedAt) {
            throw new Error('Abstract NPC travel requires arrivesAt >= departedAt');
        }
        state.travelGeneration++;
        const token = state.travelGeneration;
        state.simulationLevel = trip.keepActive ? 'active' : 'abstract';
        state.activity = trip.activity || 'travelling';
        state.travel = {
            fromNode: trip.fromNode ?? state.currentNode ?? null,
            toNode: trip.toNode ?? null,
            routeId: trip.routeId ?? null,
            fromHex: cloneHex(trip.fromHex || state.currentHex),
            toHex: cloneHex(trip.toHex),
            departedAt,
            arrivesAt,
            arrivalActivity: trip.arrivalActivity || 'idle',
            token,
        };
        scheduleEvent(id, arrivesAt, 'routine:arrive', { token });
        return state.travel;
    }

    function getAbstractLocation(id, now = Number(window.worldSeconds || 0)) {
        const state = getState(id);
        if (!state) return null;
        if (!state.travel) {
            return {
                kind: 'node',
                node: state.currentNode,
                hex: cloneHex(state.currentHex),
                progress: 1,
            };
        }
        const t = state.travel;
        const duration = Math.max(0, t.arrivesAt - t.departedAt);
        const progress = duration === 0 ? 1 : Math.max(0, Math.min(1, (now - t.departedAt) / duration));
        let hex = null;
        if (t.fromHex && t.toHex) {
            hex = {
                q: t.fromHex.q + (t.toHex.q - t.fromHex.q) * progress,
                r: t.fromHex.r + (t.toHex.r - t.fromHex.r) * progress,
            };
        }
        return {
            kind: 'travel',
            fromNode: t.fromNode,
            toNode: t.toNode,
            routeId: t.routeId,
            progress,
            hex,
            departedAt: t.departedAt,
            arrivesAt: t.arrivesAt,
        };
    }

    // Stable, inexpensive per-person variation. This is for things like
    // wake-time offsets, market-day preferences and tavern chance — values
    // that should not reroll every time the NPC is materialised.
    function deterministicUnit(seed, channel = '') {
        const text = `${seed}|${channel}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    function deterministicRange(seed, channel, min, max) {
        return min + (max - min) * deterministicUnit(seed, channel);
    }

    function exportState() {
        return {
            version: 1,
            states: Array.from(states.values()).map(state => ({
                ...state,
                currentHex: cloneHex(state.currentHex),
                travel: state.travel ? { ...state.travel, fromHex: cloneHex(state.travel.fromHex), toHex: cloneHex(state.travel.toHex) } : null,
                metadata: { ...state.metadata },
            })),
            events: heap.map(event => ({ ...event })),
            sequence,
        };
    }

    function importState(snapshot) {
        states.clear();
        entityRefs.clear();
        heap.length = 0;
        generationTombstones.clear();
        sequence = Number(snapshot?.sequence || 0);
        for (const raw of snapshot?.states || []) registerNpc(raw.id, raw);
        for (const raw of snapshot?.events || []) heapPush({ ...raw });
    }

    registerHandler('routine:arrive', (state, event) => {
        const travel = state.travel;
        if (!travel || event.payload?.token !== travel.token) return;
        state.currentNode = travel.toNode;
        state.currentHex = cloneHex(travel.toHex) || state.currentHex;
        state.activity = travel.arrivalActivity || 'idle';
        state.travel = null;
        if (state.simulationLevel === 'abstract') state.simulationLevel = 'dormant';

        // If a currently materialised entity is bound, arrival may cheaply
        // snap it only when no higher-detail movement has taken ownership.
        const entity = entityRefs.get(keyOf(state.id));
        if (entity && state.currentHex && state.simulationLevel !== 'active' && !entity.destination) {
            entity.hex = { q: Math.round(state.currentHex.q), r: Math.round(state.currentHex.r) };
            entity.visualQ = entity.hex.q;
            entity.visualR = entity.hex.r;
        }
    });

    function tick() {
        const now = Number(window.worldSeconds || 0);
        if (now === lastObservedWorldSeconds) return;
        lastObservedWorldSeconds = now;
        processDueEvents(now, { maxEvents: DEFAULT_EVENT_BUDGET });
    }

    const api = {
        registerNpc,
        registerEntity,
        unregisterNpc,
        getState,
        scheduleEvent,
        clearNpcEvents,
        registerHandler,
        processDueEvents,
        setSimulationLevel,
        promoteNpc,
        demoteNpc,
        beginAbstractTravel,
        getAbstractLocation,
        deterministicUnit,
        deterministicRange,
        exportState,
        importState,
        get queueSize() { return heap.length; },
        get populationSize() { return states.size; },
        DEFAULT_EVENT_BUDGET,
    };

    window.NPCRoutineScheduler = api;
    window.registerNpcRoutine = registerNpc;
    window.scheduleNpcRoutineEvent = scheduleEvent;
    window.beginNpcAbstractTravel = beginAbstractTravel;
    window.getNpcAbstractLocation = getAbstractLocation;
    window.promoteNpcRoutine = promoteNpc;
    window.demoteNpcRoutine = demoteNpc;

    // Constant-cost clock observation: no civilian registry scan here. The
    // heap itself decides whether anything needs work.
    setInterval(tick, TICK_MS);
})();
