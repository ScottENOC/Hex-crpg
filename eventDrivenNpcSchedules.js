// eventDrivenNpcSchedules.js
// Migrates Campaign 2's existing named NPC timetables onto NPCRoutineScheduler.
//
// getNpcSchedules() remains the authoritative content definition (and therefore
// shop hours/dialogue semantics do not change). The old updateNpcSchedules()
// caller is replaced at the global binding with this event-driven bridge:
// registration scans the small named schedule roster once, then ordinary
// progression is driven by block-boundary heap events. Large explicit clock
// jumps reconcile only the named schedule registry, never the full entity list.
(() => {
    'use strict';

    const EVENT_TYPE = 'routine:named-schedule-transition';
    const ACTIVE_RADIUS = 45;
    const REFRESH_INTERVAL_SECONDS = 60;
    const EPSILON_SECONDS = 0.001;
    const CLOCK_JUMP_RECONCILE_SECONDS = 5;

    const bindings = new Map(); // npc name -> { entityId, signature }
    let installed = false;
    let registryBuilt = false;
    let lastRefreshAt = -Infinity;
    let lastUpdateAt = null;
    let registryBuilds = 0;
    let transitionCount = 0;
    let lastOriginal = null;

    const scheduler = () => window.NPCRoutineScheduler;
    const nowSeconds = () => Number(window.worldSeconds || 0);

    function scheduleSignature(blocks) {
        return (blocks || []).map(b => [
            Number(b.start), Number(b.end),
            Number(b.hex?.q), Number(b.hex?.r), b.shop ? 1 : 0
        ].join(':')).join('|');
    }

    function currentBlock(blocks, at = nowSeconds()) {
        if (!blocks?.length) return null;
        const secondsIntoDay = ((at % 86400) + 86400) % 86400;
        const hour = secondsIntoDay / 3600;
        return blocks.find(b => hour >= b.start && hour < b.end) || null;
    }

    function nextTransitionAt(blocks, at = nowSeconds()) {
        if (!blocks?.length) return null;
        const dayStart = Math.floor(at / 86400) * 86400;
        const secondsIntoDay = at - dayStart;
        const starts = blocks
            .map(b => Number(b.start) * 3600)
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
        if (!starts.length) return null;
        const nextToday = starts.find(s => s > secondsIntoDay + EPSILON_SECONDS);
        return nextToday !== undefined ? dayStart + nextToday : dayStart + 86400 + starts[0];
    }

    function partyHexes() {
        const out = [];
        for (const e of window.entities || []) {
            if (e?.alive && e.side === 'player' && e.hex) out.push(e.hex);
        }
        return out;
    }

    function shouldWalkVisibly(entity) {
        if (!entity?.alive || !entity.hex) return false;
        // Directed neutrals are gameplay actors, not ambient background.
        if (!entity.isNPC || entity.side !== 'neutral' || entity.combatDirective) return true;
        const party = partyHexes();
        if (!party.length || typeof window.distance !== 'function') return false;
        return party.some(hex => window.distance(entity.hex, hex) <= ACTIVE_RADIUS);
    }

    function snapEntity(entity, hex) {
        if (!entity || !hex) return;
        entity.hex = { q: hex.q, r: hex.r };
        entity.visualQ = hex.q;
        entity.visualR = hex.r;
        entity.startQ = hex.q;
        entity.startR = hex.r;
        entity.destination = null;
    }

    function syncStateToBlock(entity, block, name) {
        const s = scheduler();
        if (!s || !entity || !block?.hex) return;
        const state = s.registerEntity(entity, {
            currentNode: `schedule:${name}:${block.start}`,
            currentHex: entity.hex,
            metadata: { ...(s.getState(entity.id)?.metadata || {}), scheduleName: name }
        });
        entity.prefersRoads = true;

        if (entity.hex?.q === block.hex.q && entity.hex?.r === block.hex.r) {
            entity.destination = null;
            state.currentHex = { q: block.hex.q, r: block.hex.r };
            state.currentNode = `schedule:${name}:${block.start}`;
            s.demoteNpc(entity.id, 'dormant');
            return;
        }

        if (shouldWalkVisibly(entity)) {
            // Preserve the legacy visible behaviour: the normal real-time
            // movement/pathfinding system owns the actual walk and road bias.
            entity.destination = { q: block.hex.q, r: block.hex.r };
            s.promoteNpc(entity.id, 'scheduled-visible-travel');
            state.activity = 'travelling';
        } else {
            // Preserve the legacy superposition collapse for unobserved NPCs.
            snapEntity(entity, block.hex);
            state.currentHex = { q: block.hex.q, r: block.hex.r };
            state.currentNode = `schedule:${name}:${block.start}`;
            state.activity = block.shop ? 'working' : 'scheduled';
            state.travel = null;
            s.demoteNpc(entity.id, 'dormant');
        }
    }

    function scheduleNext(name, entity, blocks, at = nowSeconds()) {
        const s = scheduler();
        if (!s || !entity?.alive) return;
        const nextAt = nextTransitionAt(blocks, at);
        if (nextAt === null) return;
        s.scheduleEvent(entity.id, nextAt, EVENT_TYPE, { name });
    }

    function bindName(name, blocks, { reschedule = true } = {}) {
        const s = scheduler();
        if (!s || !Array.isArray(blocks) || !blocks.length) return false;
        const entity = (window.entities || []).find(e => e?.alive && e.name === name);
        if (!entity) return false;

        const signature = scheduleSignature(blocks);
        const previous = bindings.get(name);
        if (previous && previous.entityId === entity.id && previous.signature === signature) return true;

        if (previous?.entityId !== undefined) s.clearNpcEvents(previous.entityId);
        bindings.set(name, { entityId: entity.id, signature });
        s.registerEntity(entity, { metadata: { scheduleName: name } });

        const block = currentBlock(blocks);
        if (block) syncStateToBlock(entity, block, name);
        if (reschedule) {
            s.clearNpcEvents(entity.id);
            scheduleNext(name, entity, blocks);
        }
        return true;
    }

    function refreshRegistry(force = false) {
        if (window.currentCampaign !== '2') return 0;
        const at = nowSeconds();
        if (!force && registryBuilt && at - lastRefreshAt < REFRESH_INTERVAL_SECONDS) return bindings.size;
        if (typeof window.getNpcSchedules !== 'function' || !scheduler()) return 0;

        const schedules = window.getNpcSchedules() || {};
        for (const [name, blocks] of Object.entries(schedules)) bindName(name, blocks);
        registryBuilt = true;
        lastRefreshAt = at;
        registryBuilds++;
        return bindings.size;
    }

    function handleTransition(state, event, at) {
        const name = event.payload?.name || state.metadata?.scheduleName;
        if (!name || typeof window.getNpcSchedules !== 'function') return;
        const blocks = window.getNpcSchedules()?.[name];
        if (!blocks?.length) return;
        const entity = (window.entities || []).find(e => e?.alive && e.id === state.id);
        if (!entity) return;

        const block = currentBlock(blocks, at);
        if (block) {
            syncStateToBlock(entity, block, name);
            transitionCount++;
        }
        scheduleNext(name, entity, blocks, at);
    }

    function reconcileBoundSchedules(at) {
        if (typeof window.getNpcSchedules !== 'function') return 0;
        const schedules = window.getNpcSchedules() || {};
        let reconciled = 0;
        for (const [name, binding] of bindings) {
            const blocks = schedules[name];
            if (!blocks?.length) continue;
            const entity = (window.entities || []).find(e => e?.alive && e.id === binding.entityId);
            if (!entity) continue;
            const block = currentBlock(blocks, at);
            if (!block) continue;
            syncStateToBlock(entity, block, name);
            reconciled++;
        }
        return reconciled;
    }

    function updateEventDrivenNpcSchedules() {
        if (window.currentCampaign !== '2' || window.isInCombat) return;
        const at = nowSeconds();
        const s = scheduler();

        // Normal progression stays O(events due): the heap top tells us whether
        // anything needs work. Calling it here also makes schedule transitions
        // deterministic with the game clock rather than waiting for a 250 ms
        // wall-clock timer to notice the same world-time change.
        if (s) s.processDueEvents(at, { maxEvents: s.DEFAULT_EVENT_BUDGET });
        refreshRegistry(false);

        // Tests, sleep/fast-forward and debug tools can move worldSeconds by
        // hours in a single assignment, including backwards. A heap can catch
        // forward events, but it cannot infer the correct state after a rewind.
        // Reconcile only the small named schedule registry on such jumps; never
        // restore the old per-step scan across window.entities.
        if (lastUpdateAt === null || Math.abs(at - lastUpdateAt) > CLOCK_JUMP_RECONCILE_SECONDS) {
            reconcileBoundSchedules(at);
        }
        lastUpdateAt = at;
    }

    function transitionNow(name, at = nowSeconds()) {
        if (typeof window.getNpcSchedules !== 'function') return false;
        refreshRegistry(true);
        const binding = bindings.get(name);
        const blocks = window.getNpcSchedules()?.[name];
        const entity = binding && (window.entities || []).find(e => e?.alive && e.id === binding.entityId);
        if (!entity || !blocks?.length) return false;
        const block = currentBlock(blocks, at);
        if (!block) return false;
        syncStateToBlock(entity, block, name);
        return true;
    }

    function install() {
        const s = scheduler();
        if (!s || typeof window.getNpcSchedules !== 'function' || typeof window.updateNpcSchedules !== 'function') return false;
        if (window.updateNpcSchedules.__eventDrivenNamedSchedules) {
            installed = true;
            return true;
        }

        lastOriginal = window.updateNpcSchedules;
        s.registerHandler(EVENT_TYPE, handleTransition);
        updateEventDrivenNpcSchedules.__eventDrivenNamedSchedules = true;
        updateEventDrivenNpcSchedules.__legacy = lastOriginal;
        window.updateNpcSchedules = updateEventDrivenNpcSchedules;
        installed = true;
        refreshRegistry(true);
        return true;
    }

    window.EventDrivenNamedNpcSchedules = {
        install,
        refreshRegistry,
        transitionNow,
        currentBlock,
        nextTransitionAt,
        reconcileBoundSchedules,
        get stats() {
            return {
                installed,
                registryBuilt,
                bindings: bindings.size,
                registryBuilds,
                transitionCount,
                lastRefreshAt,
                lastUpdateAt,
            };
        },
        get bindings() { return new Map(bindings); },
    };

    // gameEngine.js defines updateNpcSchedules later in the classic-script
    // load sequence. Install as soon as that binding and the scheduler exist.
    if (!install()) {
        const timer = setInterval(() => {
            if (install()) clearInterval(timer);
        }, 25);
        setTimeout(() => clearInterval(timer), 10000);
    }
})();
