// civilianRoutineVariety.js
// Adds purposeful civilian deviations without turning every persistent person
// into a continuously-thinking AI. Each living civilian carries ONE scattered
// daily planner event. That planner only schedules concrete visits when that
// day actually contains one. Settlement-wide events scan the population once
// when triggered, never once per tick.
(() => {
    'use strict';

    const PLAN_EVENT = 'routine:civilian-daily-plan';
    const VISIT_EVENT = 'routine:civilian-special-visit';
    const RETURN_EVENT = 'routine:civilian-special-return';
    const DISCOVERY_MS = 1200;
    const DAY = 86400;

    let installed = false;
    let plannerRuns = 0;
    let plannersScheduled = 0;
    let deviationsScheduled = 0;
    let settlementEventsTriggered = 0;
    let settlementRecordsScanned = 0;
    let lastKnownPopulation = -1;

    const pop = () => window.GeneratedCivilianPopulation;
    const scheduler = () => window.NPCRoutineScheduler;
    const now = () => Number(window.worldSeconds || 0);

    function unit(seed, channel) {
        const s = scheduler();
        if (s?.deterministicUnit) return s.deterministicUnit(seed, channel);
        const text = `${seed}|${channel}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    function dayIndex(at) { return Math.floor(Number(at || 0) / DAY); }
    function weekday(at) { return ((dayIndex(at) % 7) + 7) % 7; }
    function dayStart(at) { return dayIndex(at) * DAY; }

    function routineTraits(record) {
        const marketDay = Math.floor(unit(record.seed, 'market-day') * 7);
        const tavernDayA = Math.floor(unit(record.seed, 'tavern-day-a') * 7);
        let tavernDayB = Math.floor(unit(record.seed, 'tavern-day-b') * 7);
        if (tavernDayB === tavernDayA) tavernDayB = (tavernDayB + 3) % 7;
        return {
            marketDay,
            tavernDays: [tavernDayA, tavernDayB],
            tavernGoer: unit(record.seed, 'tavern-goer') < 0.58,
            worshipper: unit(record.seed, 'worshipper') < 0.62,
            marketRegular: unit(record.seed, 'market-regular') < 0.82,
            sociability: unit(record.seed, 'sociability'),
        };
    }

    function specialNodes() {
        const c = window.campaign2Landmarks?.crossroads || { q:8, r:24 };
        return {
            market: { key:'hollowmere:market', hex:{ q:c.q, r:c.r } },
            // The Hollow Tankard occupies the original village interior around
            // q/r zero; this is its public-room side rather than a new map.
            tavern: { key:'hollowmere:tavern', hex:{ q:0, r:2 } },
            // Campaign 2 currently has no dedicated temple building. Worship
            // therefore means the village's outdoor weekly gathering rather
            // than inventing a building that is not actually drawn on the map.
            worship: { key:'hollowmere:worship-gathering', hex:{ q:c.q-2, r:c.r+3 } },
            festival: { key:'hollowmere:festival-green', hex:{ q:c.q+2, r:c.r-1 } },
            funeral: { key:'hollowmere:funeral-gathering', hex:{ q:c.q-3, r:c.r+2 } },
        };
    }

    function plannerTimeForDay(record, day) {
        // Spread planners over 04:00-06:00 so a sleep/fast-forward does not
        // dump an entire town's daily thinking into one scheduler instant.
        return day * DAY + 4 * 3600 + Math.floor(unit(record.seed, `plan-jitter:${day}`) * 2 * 3600);
    }

    function nextPlannerTime(record, at = now()) {
        let d = dayIndex(at);
        let candidate = plannerTimeForDay(record, d);
        if (candidate <= at + 0.001) candidate = plannerTimeForDay(record, ++d);
        return candidate;
    }

    function schedulePlanner(record, at = now()) {
        const s = scheduler();
        const state = s?.getState(record.id);
        if (!record?.alive || !state) return false;
        state.metadata = state.metadata || {};
        if (Number.isFinite(state.metadata.routineVarietyPlannerAt) && state.metadata.routineVarietyPlannerAt > at) return false;
        const when = nextPlannerTime(record, at);
        s.scheduleEvent(record.id, when, PLAN_EVENT, { day: dayIndex(when) });
        state.metadata.routineVarietyPlannerAt = when;
        plannersScheduled++;
        return true;
    }

    function scheduleVisit(record, kind, startAt, endAt, returnTarget, eventSalt = '') {
        const s = scheduler();
        if (!record?.alive || !s?.getState(record.id)) return false;
        const node = specialNodes()[kind];
        if (!node || startAt <= now() - 1) return false;
        const salt = `${eventSalt}:${dayIndex(startAt)}:${kind}`;
        const jitter = Math.floor((unit(record.seed, `${salt}:arrival-jitter`) - 0.5) * 18 * 60);
        const start = Math.max(now() + 1, startAt + jitter);
        const finish = Math.max(start + 20 * 60, endAt + Math.floor((unit(record.seed, `${salt}:leave-jitter`) - 0.5) * 20 * 60));
        s.scheduleEvent(record.id, start, VISIT_EVENT, {
            kind, node, activity: kind === 'market' ? 'shopping'
                : kind === 'tavern' ? 'at_tavern'
                : kind === 'worship' ? 'worshipping'
                : kind === 'festival' ? 'celebrating'
                : 'mourning',
            salt,
        });
        s.scheduleEvent(record.id, finish, RETURN_EVENT, { target: returnTarget, kind, salt });
        deviationsScheduled += 2;
        return true;
    }

    function planDay(state, event) {
        const p = pop();
        const record = p?.records?.get(String(state.id));
        if (!record?.alive) return;
        plannerRuns++;
        state.metadata = state.metadata || {};
        delete state.metadata.routineVarietyPlannerAt;

        const day = Number.isFinite(event.payload?.day) ? event.payload.day : dayIndex(event.at);
        const start = day * DAY;
        const wd = ((day % 7) + 7) % 7;
        const traits = routineTraits(record);

        // Weekly village market. Most people attend on one stable personal
        // shopping day, but not everybody — workers and homebodies create a
        // naturally thinner crowd instead of an all-town synchronized march.
        if (traits.marketRegular && traits.marketDay === wd) {
            scheduleVisit(record, 'market', start + 12*3600, start + 14*3600, 'work', `market:${day}`);
        }

        // One shared weekly worship day (weekday 6) with stable attendance.
        // This models communal religious life without requiring per-tick faith AI.
        if (traits.worshipper && wd === 6) {
            scheduleVisit(record, 'worship', start + 9*3600, start + 10.5*3600, 'work', `worship:${day}`);
        }

        // Social drinkers have one or two stable evenings per week. A second
        // deterministic sociability gate prevents every eligible person from
        // going on both evenings every week.
        if (traits.tavernGoer && traits.tavernDays.includes(wd)) {
            const secondGate = unit(record.seed, `tavern:${day}`) < 0.45 + traits.sociability * 0.45;
            if (secondGate) scheduleVisit(record, 'tavern', start + 18.25*3600, start + 20.5*3600, 'home', `tavern:${day}`);
        }

        schedulePlanner(record, event.at + 1);
    }

    function beginTrip(record, node, activity, salt) {
        const s = scheduler();
        const state = s?.getState(record.id);
        if (!state || !node?.hex) return false;
        const live = pop()?.materialised?.get(record.id);
        const abstract = s.getAbstractLocation(record.id, now());
        const fromHex = live?.hex || abstract?.hex || state.currentHex || record.nodes?.home?.hex;
        const minutes = 5 + Math.floor(unit(record.seed, `${salt}:travel-time`) * 12);
        s.beginAbstractTravel(record.id, {
            fromNode: state.currentNode || 'unknown',
            toNode: node.key,
            fromHex,
            toHex: node.hex,
            departedAt: now(),
            arrivesAt: now() + minutes * 60,
            activity: 'travelling',
            arrivalActivity: activity,
            keepActive: !!live,
        });
        if (live) {
            live.destination = { q:Math.round(node.hex.q), r:Math.round(node.hex.r) };
            live.prefersRoads = true;
        }
        return true;
    }

    function handleVisit(state, event) {
        const record = pop()?.records?.get(String(state.id));
        if (!record?.alive) return;
        beginTrip(record, event.payload?.node, event.payload?.activity || 'visiting', event.payload?.salt || event.payload?.kind || 'visit');
    }

    function normalNode(record, target) {
        if (target === 'home' || target === 'work' || target === 'social') return record.nodes?.[target];
        const current = pop()?.targetForTime?.(record, now()) || 'home';
        return record.nodes?.[current] || record.nodes?.home;
    }

    function handleReturn(state, event) {
        const record = pop()?.records?.get(String(state.id));
        if (!record?.alive) return;
        const target = event.payload?.target || 'routine';
        const node = normalNode(record, target);
        const activity = target === 'home' ? 'sleeping' : target === 'work' ? 'working' : 'socialising';
        beginTrip(record, node, activity, `${event.payload?.salt || event.payload?.kind || 'return'}:return`);
    }

    function ensurePlanners(at = now()) {
        const p = pop();
        const s = scheduler();
        if (!p?.records || !s) return { scanned:0, scheduled:0 };
        let scanned = 0, scheduled = 0;
        for (const record of p.records.values()) {
            scanned++;
            if (schedulePlanner(record, at)) scheduled++;
        }
        lastKnownPopulation = p.records.size;
        return { scanned, scheduled };
    }

    function triggerSettlementEvent(type, options = {}) {
        const p = pop();
        if (!p?.records) return { scanned:0, participants:0 };
        if (!['festival', 'funeral'].includes(type)) throw new Error(`Unknown civilian settlement event: ${type}`);
        const at = Number(options.startAt ?? (now() + 10*60));
        const duration = Math.max(0.5, Number(options.durationHours ?? (type === 'festival' ? 4 : 2))) * 3600;
        const rate = Math.max(0, Math.min(1, Number(options.participation ?? (type === 'festival' ? 0.72 : 0.48))));
        const id = String(options.id || `${type}:${Math.floor(at)}`);
        let scanned = 0, participants = 0;
        for (const record of p.records.values()) {
            scanned++;
            if (!record.alive || unit(record.seed, `settlement-event:${id}`) >= rate) continue;
            const returnTarget = p.targetForTime?.(record, at + duration + 1) || 'home';
            if (scheduleVisit(record, type, at, at + duration, returnTarget, id)) participants++;
        }
        settlementEventsTriggered++;
        settlementRecordsScanned += scanned;
        return { id, type, scanned, participants, startAt:at, endAt:at+duration };
    }

    function install() {
        const s = scheduler();
        const p = pop();
        if (!s?.registerHandler || !p?.records) return false;
        if (installed) return true;
        s.registerHandler(PLAN_EVENT, planDay);
        s.registerHandler(VISIT_EVENT, handleVisit);
        s.registerHandler(RETURN_EVENT, handleReturn);
        installed = true;
        ensurePlanners();
        return true;
    }

    function discoveryPulse() {
        if (!install()) return;
        const p = pop();
        const first = p?.records?.values?.().next?.().value;
        const firstState = first ? scheduler()?.getState(first.id) : null;
        // O(1) normal case: only scan the population when its count changed or
        // its first live scheduler state shows that planners were reset/rebuilt.
        const missingPlanner = firstState && !Number.isFinite(firstState.metadata?.routineVarietyPlannerAt);
        if (p.records.size !== lastKnownPopulation || missingPlanner) ensurePlanners();
    }

    window.CivilianRoutineVariety = {
        install,
        ensurePlanners,
        routineTraits,
        specialNodes,
        triggerSettlementEvent,
        scheduleVisit,
        get stats() {
            return {
                installed,
                plannerRuns,
                plannersScheduled,
                deviationsScheduled,
                settlementEventsTriggered,
                settlementRecordsScanned,
                population: pop()?.records?.size || 0,
            };
        },
        EVENT_TYPES: { PLAN_EVENT, VISIT_EVENT, RETURN_EVENT },
    };

    install();
    window.__civilianRoutineVarietyTimer = setInterval(discoveryPulse, DISCOVERY_MS);
})();
