// wildernessLivingWorld.js
// Makes wilderness incidents part of the same persistent world as settlements.
//
// Two principles drive this layer:
//  1. people are records first and live Entity objects only while nearby;
//  2. factions learn through reports, not global omniscience.
//
// A rescued traveller can therefore leave the scene, carry what they saw down
// the road, arrive later, and only then change what a faction believes. The
// person can also be encountered again at their destination without remaining
// a permanently simulated Entity while they are off-screen.
(() => {
    'use strict';

    const MATERIALISE_RADIUS = 24;
    const DEMATERIALISE_RADIUS = 32;
    const REPORT_BASE_DELAY = 6 * 3600;
    const REPORT_JITTER = 18 * 3600;
    const ACTOR_TYPES = new Set(['injured_traveller', 'stranded_merchant', 'lost_child']);

    function incidents() { return window.WildernessIncidents; }
    function consequences() { return window.WildernessConsequences; }
    function beliefs() { return window.WildernessFactionBeliefs; }
    function now() { return Number(window.worldSeconds || 0); }

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function hashUnit(value) {
        let h = 2166136261;
        for (const ch of String(value || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        return (h >>> 0) / 4294967296;
    }

    function ensureState() {
        const store = incidents()?.ensureStore?.();
        if (!store) return null;
        if (!store.livingWorld || typeof store.livingWorld !== 'object') {
            store.livingWorld = { version:1, nextActorId:1, nextReportId:1, actors:{}, reports:[] };
        }
        const state = store.livingWorld;
        state.version = Math.max(1, Number(state.version || 1));
        state.nextActorId = Math.max(1, Number(state.nextActorId || 1));
        state.nextReportId = Math.max(1, Number(state.nextReportId || 1));
        state.actors = state.actors && typeof state.actors === 'object' ? state.actors : {};
        state.reports = Array.isArray(state.reports) ? state.reports : [];
        return state;
    }

    function settlementHex(name) {
        const key = String(name || '').trim().toLowerCase();
        if (key === 'hollowmere') return window.campaign2Landmarks?.crossroads || null;
        if (key === 'millbrook') return window.campaign2MillbrookCenter || null;
        if (key === 'emberlode') return window.campaign2EmberlodeCenter || null;
        if (key === 'reddale') return window.campaign2ReddaleCenter || null;
        if (key === 'silverhart') return window.campaign2SilverhartCenter || window.campaign2PalaceGateExteriorHex || null;
        return null;
    }

    function inferDestination(incident) {
        return incident?.provenance?.destination || incident?.provenance?.origin || 'Hollowmere';
    }

    function actorRole(type) {
        if (type === 'stranded_merchant') return 'merchant';
        if (type === 'lost_child') return 'dependent';
        return 'traveller';
    }

    function actorName(incident) {
        if (incident?.type === 'lost_child') {
            const seed = hashUnit(`${incident.id}:child-name`);
            const names = ['Annie', 'Bess', 'Cora', 'Elsie', 'Mira', 'Nell', 'Tessa', 'Willa'];
            return names[Math.floor(seed * names.length) % names.length];
        }
        return incident?.provenance?.person || `Traveller ${incident?.id || ''}`.trim();
    }

    function ensureActorForIncident(incident) {
        if (!incident || !ACTOR_TYPES.has(incident.type)) return null;
        const state = ensureState();
        if (!state) return null;
        if (incident.livingActorId && state.actors[incident.livingActorId]) return state.actors[incident.livingActorId];

        const id = `wild-actor-${state.nextActorId++}`;
        const actor = {
            id,
            incidentId:incident.id,
            name:actorName(incident),
            role:actorRole(incident.type),
            race:'human',
            gender:hashUnit(`${incident.id}:gender`) < 0.5 ? 'female' : 'male',
            origin:incident.provenance?.origin || null,
            destination:inferDestination(incident),
            state:'at_incident',
            currentHex:incident.hex ? { q:incident.hex.q, r:incident.hex.r } : null,
            createdAt:now(),
            lastOutcome:null,
            materialisedEntityId:null,
        };
        state.actors[id] = actor;
        incident.livingActorId = id;
        return actor;
    }

    function actorForIncident(incidentOrId) {
        const incident = typeof incidentOrId === 'string'
            ? incidents()?.incidentById?.(incidentOrId)
            : incidentOrId;
        if (!incident) return null;
        return ensureActorForIncident(incident);
    }

    function reportDelay(incidentId, fact) {
        return REPORT_BASE_DELAY + Math.floor(hashUnit(`${incidentId}:${fact}:delay`) * REPORT_JITTER);
    }

    function createReport({ incident, actor, event, targetFaction, fact, certainty=1, suspicion=0, exposes=false, reason=null }) {
        const state = ensureState();
        if (!state || !incident || !targetFaction || !fact) return null;
        const duplicate = state.reports.find(r => r.incidentId === incident.id && r.fact === fact && r.targetFaction === targetFaction);
        if (duplicate) return duplicate;
        const createdAt = now();
        const report = {
            id:`wild-report-${state.nextReportId++}`,
            incidentId:incident.id,
            outcomeId:event?.id || null,
            sourceActorId:actor?.id || null,
            targetFaction,
            fact,
            certainty:Number(certainty || 1),
            suspicion:Number(suspicion || 0),
            exposes:!!exposes,
            reason:reason || null,
            location:incident.hex ? { q:incident.hex.q, r:incident.hex.r } : null,
            destination:inferDestination(incident),
            createdAt,
            deliverAt:createdAt + reportDelay(incident.id, fact),
            deliveredAt:null,
            state:'travelling',
        };
        state.reports.push(report);
        if (state.reports.length > 100) state.reports.splice(0, state.reports.length - 100);
        return report;
    }

    // Only facts a plausible surviving witness can actually know are generated
    // here. Deliberate covert work (quietly memorising a route for goblins,
    // passing a Guild mark, etc.) is not magically visible to the traveller.
    function reportSpec(incident, resolution) {
        if (!incident) return null;
        if (incident.type === 'injured_traveller') {
            if (resolution === 'helped') return { targetFaction:'silverhart_kingdom', fact:'player_helped_injured_traveller', certainty:1 };
            if (resolution === 'robbed') return { targetFaction:'silverhart_kingdom', fact:'player_robbed_injured_traveller', certainty:2, suspicion:2 };
            if (resolution === 'silverhart_claim') return { targetFaction:'silverhart_kingdom', fact:'player_claimed_to_work_with_silverhart', certainty:1 };
        }
        if (incident.type === 'stranded_merchant') {
            if (resolution === 'escorted') return { targetFaction:'silverhart_kingdom', fact:'player_helped_stranded_merchant', certainty:1 };
            if (resolution === 'silverhart_route_warning') return { targetFaction:'silverhart_kingdom', fact:'player_warned_of_vulnerable_route', certainty:2 };
        }
        if (incident.type === 'lost_child') {
            if (resolution === 'reunited' || resolution === 'safe_road') {
                return { targetFaction:'silverhart_kingdom', fact:'player_helped_lost_child', certainty:1 };
            }
        }
        return null;
    }

    function latestOutcomeForIncident(incidentId, beforeCount=0) {
        const events = consequences()?.ensureLedger?.()?.events || [];
        const added = events.slice(Math.max(0, beforeCount));
        return [...added].reverse().find(e => e?.incidentId === incidentId) ||
            [...events].reverse().find(e => e?.incidentId === incidentId) || null;
    }

    function markActorAfterResolution(actor, incident) {
        if (!actor || !incident || incident.state !== 'resolved') return;
        actor.lastOutcome = incident.resolution || null;
        actor.resolvedAt = incident.resolvedAt ?? now();
        actor.destination = inferDestination(incident);
        if (['reunited','safe_road','escorted','helped','silverhart_claim','silverhart_route_warning'].includes(incident.resolution)) {
            actor.state = 'travelling_to_destination';
        } else {
            actor.state = 'departed';
        }
    }

    function deliverReport(report) {
        if (!report || report.state !== 'travelling') return false;
        const b = beliefs();
        if (!b?.recordEvidence) return false;
        b.recordEvidence(report.targetFaction, report.fact, report.certainty, {
            suspicion:report.suspicion,
            exposes:report.exposes,
            reason:report.reason || report.fact,
        });
        report.state = 'delivered';
        report.deliveredAt = now();
        const actor = report.sourceActorId ? ensureState()?.actors?.[report.sourceActorId] : null;
        if (actor && actor.state === 'travelling_to_destination') {
            actor.state = 'arrived';
            actor.arrivedAt = report.deliveredAt;
            const hex = settlementHex(actor.destination);
            if (hex) actor.currentHex = { q:hex.q, r:hex.r };
        }
        return true;
    }

    function processReports(at=now()) {
        const state = ensureState();
        if (!state) return 0;
        let delivered = 0;
        for (const report of state.reports) {
            if (report.state !== 'travelling' || Number(report.deliverAt || Infinity) > at) continue;
            // recordEvidence uses worldSeconds for its own timestamp, so tests and
            // time-skips set worldSeconds before calling this function.
            if (deliverReport(report)) delivered++;
        }
        return delivered;
    }

    function entityForActor(actor) {
        if (!actor?.materialisedEntityId) return null;
        return (window.entities || []).find(e => String(e.id) === String(actor.materialisedEntityId)) || null;
    }

    function spawnHexForActor(actor) {
        if (actor.state === 'at_incident') {
            const incident = incidents()?.incidentById?.(actor.incidentId);
            return incident?.hex || actor.currentHex || null;
        }
        if (actor.state === 'arrived') {
            const centre = settlementHex(actor.destination) || actor.currentHex;
            if (!centre) return null;
            const neighbours = window.getNeighbors?.(centre.q, centre.r) || [];
            const idx = Math.floor(hashUnit(`${actor.id}:arrival-hex`) * Math.max(1, neighbours.length));
            return neighbours[idx] || centre;
        }
        return null;
    }

    function materialiseActor(actor) {
        if (!actor || entityForActor(actor) || typeof window.Entity !== 'function') return entityForActor(actor);
        const hex = spawnHexForActor(actor);
        if (!hex) return null;
        const e = new window.Entity(actor.name, '#8d8d8d', { q:hex.q, r:hex.r }, 8);
        e.side = 'neutral';
        e.isNPC = true;
        e.isWildernessActor = true;
        e.wildernessActorId = actor.id;
        e.wildernessIncidentId = actor.incidentId;
        e.race = actor.race || 'human';
        e.gender = actor.gender || 'female';
        e.occupation = actor.role || 'traveller';
        e.dialogueId = null;
        e.hasBeenSeenByPlayer = true;
        e.homeHex = { q:hex.q, r:hex.r };
        window.entities = window.entities || [];
        window.entities.push(e);
        actor.materialisedEntityId = e.id;
        actor.currentHex = { q:hex.q, r:hex.r };
        return e;
    }

    function dematerialiseActor(actor) {
        const e = entityForActor(actor);
        if (!e) { if (actor) actor.materialisedEntityId = null; return false; }
        const index = (window.entities || []).indexOf(e);
        if (index >= 0) window.entities.splice(index, 1);
        actor.currentHex = e.hex ? { q:e.hex.q, r:e.hex.r } : actor.currentHex;
        actor.materialisedEntityId = null;
        return true;
    }

    function reconcileActors() {
        const state = ensureState();
        const player = (window.entities || []).find(e => e?.alive && e.side === 'player' && !e.rider);
        if (!state || !player?.hex) return 0;
        let changed = 0;
        for (const actor of Object.values(state.actors)) {
            const existing = entityForActor(actor);
            const target = spawnHexForActor(actor);
            if (!target) {
                if (existing && dematerialiseActor(actor)) changed++;
                continue;
            }
            const d = distance(player.hex, existing?.hex || target);
            if (!existing && d <= MATERIALISE_RADIUS) {
                if (materialiseActor(actor)) changed++;
            } else if (existing && d > DEMATERIALISE_RADIUS) {
                if (dematerialiseActor(actor)) changed++;
            }
        }
        return changed;
    }

    function recognitionText(actor) {
        if (!actor) return 'The traveller gives you a cautious nod.';
        if (actor.lastOutcome === 'escorted') return `${actor.name} recognises you immediately. “I made it after all. I said I owed you, and I meant it.”`;
        if (actor.lastOutcome === 'helped') return `${actor.name} touches the old bandage at their leg. “You got me off that road alive. I haven't forgotten.”`;
        if (actor.lastOutcome === 'reunited' || actor.lastOutcome === 'safe_road') return `${actor.name} beams when they see you. “I found them. I got home.”`;
        if (actor.lastOutcome === 'robbed') return `${actor.name} goes still when they recognise you. Whatever happens next, they remember exactly who left them on that road.`;
        return `${actor.name} recognises you from the road and watches to see whether you remember them too.`;
    }

    function installTalkWrapper() {
        const original = window.talkToNPC;
        if (typeof original !== 'function') return false;
        if (original.__wildernessLivingWorldTalk) return true;
        const wrapped = function(npc, ...args) {
            if (!npc?.isWildernessActor) return original.call(this, npc, ...args);
            const state = ensureState();
            const actor = state?.actors?.[npc.wildernessActorId];
            const incident = incidents()?.incidentById?.(npc.wildernessIncidentId);
            if (incident && incident.state !== 'resolved' && typeof incidents()?.presentIncident === 'function') {
                incidents().presentIncident(incident);
                return;
            }
            window.showDialogue?.(npc, recognitionText(actor), [{ label:'Take care.', action:()=>{} }]);
        };
        wrapped.__wildernessLivingWorldTalk = true;
        wrapped.__original = original;
        window.talkToNPC = wrapped;
        return true;
    }

    function seedActors() {
        const all = incidents()?.ensureStore?.()?.incidents || [];
        let made = 0;
        for (const incident of all) if (ensureActorForIncident(incident)) made++;
        return made;
    }

    function installResolverWrapper() {
        const api = incidents();
        if (!api || api.__livingWorldResolver) return !!api;
        const original = api.resolveIncident;
        api.resolveIncident = function(id, outcome) {
            const incident = api.incidentById?.(id);
            const actor = ensureActorForIncident(incident);
            const beforeCount = consequences()?.ensureLedger?.()?.events?.length || 0;
            const result = original?.(id, outcome);
            const resolved = result || incident;
            if (resolved?.state === 'resolved') {
                markActorAfterResolution(actor, resolved);
                const spec = reportSpec(resolved, resolved.resolution);
                if (spec) createReport({
                    incident:resolved,
                    actor,
                    event:latestOutcomeForIncident(resolved.id, beforeCount),
                    ...spec,
                });
            }
            reconcileActors();
            return result;
        };
        api.__livingWorldResolver = true;
        return true;
    }

    function pulse() {
        seedActors();
        processReports();
        reconcileActors();
        installTalkWrapper();
    }

    function install() {
        if (!incidents() || !consequences() || !beliefs()) return false;
        ensureState();
        seedActors();
        installResolverWrapper();
        installTalkWrapper();
        window.WildernessLivingWorld = {
            ensureState,ensureActorForIncident,actorForIncident,createReport,processReports,deliverReport,
            reconcileActors,materialiseActor,dematerialiseActor,recognitionText,reportSpec,settlementHex,
            constants:{MATERIALISE_RADIUS,DEMATERIALISE_RADIUS,REPORT_BASE_DELAY,REPORT_JITTER},
        };
        return true;
    }

    if (!install()) {
        const boot = setInterval(() => { if (install()) clearInterval(boot); }, 25);
        setTimeout(() => clearInterval(boot), 5000);
    }
    window.__wildernessLivingWorldTimer = setInterval(pulse, 2000);
    setTimeout(pulse, 0);
})();
