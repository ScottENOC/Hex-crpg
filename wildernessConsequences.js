// wildernessConsequences.js
// Persistent consequence layer for wilderness incidents.
//
// An incident can be meaningful without giving the player a stat reward. This
// module separates the immediate emotional/story outcome from longer-term
// systemic effects. It records who was helped/harmed, where they were trying
// to go, and tags describing the outcome. Future quests, shops, rumours and
// settlement systems can query those facts without depending on a specific
// incident ID or hard-coded quest flag.
(() => {
    'use strict';

    function api() { return window.WildernessIncidents; }
    function store() { return api()?.ensureStore?.() || null; }

    function ensureLedger() {
        const s = store();
        if (!s) return null;
        if (!s.consequences || typeof s.consequences !== 'object') {
            s.consequences = {
                version: 1,
                events: [],
                counters: {},
                destinations: {},
                people: {},
                unlocks: {},
            };
        }
        const l = s.consequences;
        l.events = Array.isArray(l.events) ? l.events : [];
        l.counters = l.counters || {};
        l.destinations = l.destinations || {};
        l.people = l.people || {};
        l.unlocks = l.unlocks || {};
        return l;
    }

    function inc(obj, key, amount=1) {
        if (!key) return;
        obj[key] = Number(obj[key] || 0) + amount;
    }

    function normaliseDestination(value) {
        if (!value) return null;
        return String(value).trim().toLowerCase().replace(/\s+/g, '_');
    }

    function recordOutcome(data={}) {
        const ledger = ensureLedger();
        if (!ledger) return null;
        const event = {
            id: `outcome-${ledger.events.length + 1}`,
            worldSeconds: Number(window.worldSeconds || 0),
            incidentId: data.incidentId || null,
            kind: data.kind || 'flavour',
            person: data.person || null,
            origin: data.origin || null,
            destination: data.destination || null,
            tags: Array.from(new Set(data.tags || [])),
            note: data.note || null,
        };
        ledger.events.push(event);
        if (ledger.events.length > 100) ledger.events.splice(0, ledger.events.length - 100);

        event.tags.forEach(tag => inc(ledger.counters, tag));
        if (event.kind) inc(ledger.counters, `kind:${event.kind}`);

        const dest = normaliseDestination(event.destination);
        if (dest) {
            ledger.destinations[dest] = ledger.destinations[dest] || { arrivals:0, merchants:0, children:0, travellers:0 };
            const d = ledger.destinations[dest];
            if (event.tags.includes('safe_arrival')) d.arrivals += 1;
            if (event.tags.includes('merchant_arrived')) d.merchants += 1;
            if (event.tags.includes('child_reunited')) d.children += 1;
            if (event.tags.includes('traveller_rescued')) d.travellers += 1;
        }

        if (event.person) {
            ledger.people[event.person] = {
                lastOutcomeId:event.id,
                incidentId:event.incidentId,
                destination:event.destination,
                tags:event.tags.slice(),
                worldSeconds:event.worldSeconds,
            };
        }
        refreshUnlocks();
        return event;
    }

    function count(tag) { return Number(ensureLedger()?.counters?.[tag] || 0); }
    function destinationStats(destination) {
        const key = normaliseDestination(destination);
        return ensureLedger()?.destinations?.[key] || { arrivals:0, merchants:0, children:0, travellers:0 };
    }
    function personOutcome(name) { return ensureLedger()?.people?.[name] || null; }

    function meetsGate(gate={}) {
        if (gate.tag && count(gate.tag) < Number(gate.count || 1)) return false;
        if (gate.destination) {
            const stats = destinationStats(gate.destination);
            const field = gate.destinationMetric || 'arrivals';
            if (Number(stats[field] || 0) < Number(gate.destinationCount || gate.count || 1)) return false;
        }
        if (gate.person && !personOutcome(gate.person)) return false;
        if (gate.unlock && !ensureLedger()?.unlocks?.[gate.unlock]) return false;
        return true;
    }

    // These are intentionally modest, generic gates rather than rewards wired
    // directly into a particular merchant. Content can query them later.
    function refreshUnlocks() {
        const ledger = ensureLedger();
        if (!ledger) return {};
        const safe = count('safe_arrival');
        const merchants = count('merchant_arrived');
        if (safe >= 2) ledger.unlocks.roadside_reputation = true;
        if (merchants >= 2) ledger.unlocks.merchant_contacts = true;
        if (safe >= 5) ledger.unlocks.traveller_network = true;
        if (merchants >= 4) ledger.unlocks.trade_route_favours = true;
        return ledger.unlocks;
    }

    function inferDestination(incident) {
        return incident?.provenance?.destination || incident?.provenance?.origin || 'Hollowmere';
    }

    function recordResolvedIncident(incident) {
        if (!incident || incident._consequenceRecorded || incident.state !== 'resolved') return null;
        const p = incident.provenance || {};
        let data = null;
        switch (`${incident.type}:${incident.resolution}`) {
            case 'injured_traveller:helped':
                data = { kind:'systemic', person:p.person, origin:p.origin, destination:inferDestination(incident), tags:['traveller_rescued','safe_arrival'], note:'An injured traveller was helped back to safety.' };
                break;
            case 'injured_traveller:robbed':
                data = { kind:'systemic', person:p.person, origin:p.origin, tags:['traveller_harmed','predatory_act'], note:'An injured traveller was robbed.' };
                break;
            case 'broken_cart:reported':
                data = { kind:'systemic', origin:p.origin, destination:p.origin, tags:['road_hazard_reported','route_reliability'], note:'A road hazard was reported instead of ignored.' };
                break;
            case 'roadside_grave:tended':
            case 'roadside_grave:remembered':
                data = { kind:'flavour', person:p.person, tags:['small_kindness','memory_kept'], note:'A forgotten roadside grave was treated with care.' };
                break;
            case 'poacher_cache:traps_destroyed':
                data = { kind:'systemic', tags:['wildlife_protected'], note:'Poacher snares were destroyed.' };
                break;
        }
        if (!data) return null;
        incident._consequenceRecorded = true;
        return recordOutcome({incidentId:incident.id, ...data});
    }

    function installAdditionalIncidents() {
        const w = api();
        if (!w || w.__consequenceLayerInstalled) return false;

        // Purely human-scale payoff: no prosperity/security/reputation reward.
        w.templates.lost_child = {
            weight: 2,
            markerTypes: [],
            title: 'Lost Child',
            describe: i => `A young girl is trying very hard not to cry beside the road. “My mum and dad were right behind me. I only went to see the stream.” Her family were travelling toward ${i.provenance.origin}.`,
            choices: () => [
                { label:'Help her find her parents.', outcome:'reunite' },
                { label:'Walk her to the nearest safe road and alert travellers.', outcome:'safe_road' },
                { label:'Leave her where she is.', outcome:null },
            ],
        };

        // Explicit systemic counterpart. Repeated successful merchant arrivals
        // are queryable by later inventories/quests without granting goods now.
        w.templates.stranded_merchant = {
            weight: 2,
            markerTypes: ['crate'],
            title: 'Stranded Merchant',
            describe: i => `${i.provenance.person}, a merchant bound for ${i.provenance.origin}, is crouched beside a split pack-frame. “I can mend it, but not before dark. I'd rather not spend the night here alone.”`,
            choices: () => [
                { label:'Help secure the load and get them back onto the road.', outcome:'escort' },
                { label:'Buy a few damaged goods cheaply.', outcome:'buy_damaged' },
                { label:'Wish them luck and move on.', outcome:null },
            ],
        };

        const originalResolve = w.resolveIncident;
        w.resolveIncident = function(id, outcome) {
            const incident = w.incidentById(id);
            if (!incident || !outcome) return incident;

            if (incident.type === 'lost_child') {
                if (outcome === 'reunite') {
                    incident.state='resolved'; incident.resolution='reunited'; incident.resolvedAt=Number(window.worldSeconds||0);
                    window.showMessage?.('After a long, increasingly frantic search, two figures come running down the road. The girl bolts toward them. Her mother drops to her knees and holds on so tightly that nobody says much for a while.');
                    recordOutcome({incidentId:incident.id, kind:'flavour', person:incident.provenance.person, destination:inferDestination(incident), tags:['child_reunited','safe_arrival','small_kindness'], note:'A lost child was reunited with her parents.'});
                    incident._consequenceRecorded=true;
                } else if (outcome === 'safe_road') {
                    incident.state='resolved'; incident.resolution='safe_road'; incident.resolvedAt=Number(window.worldSeconds||0);
                    window.showMessage?.('You stay with her until a family wagon agrees to take her to the next settlement and send word back along the road.');
                    recordOutcome({incidentId:incident.id, kind:'flavour', person:incident.provenance.person, destination:inferDestination(incident), tags:['child_helped','safe_arrival','small_kindness'], note:'A lost child was placed in safe hands.'});
                    incident._consequenceRecorded=true;
                }
                return incident;
            }

            if (incident.type === 'stranded_merchant') {
                if (outcome === 'escort') {
                    incident.state='resolved'; incident.resolution='escorted'; incident.resolvedAt=Number(window.worldSeconds||0);
                    window.adjustRegionStat?.(incident.regionId || 'aldervale','prosperity',1);
                    window.showMessage?.(`${incident.provenance.person} gets the load balanced again and reaches the safer road. “If you ever see my stall in ${inferDestination(incident)}, remind me I owe you.”`);
                    recordOutcome({incidentId:incident.id, kind:'systemic', person:incident.provenance.person, origin:incident.provenance.origin, destination:inferDestination(incident), tags:['merchant_arrived','safe_arrival','route_reliability'], note:'A stranded merchant reached their destination safely.'});
                    incident._consequenceRecorded=true;
                } else if (outcome === 'buy_damaged') {
                    const target=window.player || window.party?.[0];
                    if (target) target.gold=Number(target.gold||0)-Math.min(5,Number(target.gold||0));
                    incident.state='resolved'; incident.resolution='bought_damaged_goods'; incident.resolvedAt=Number(window.worldSeconds||0);
                    window.showMessage?.('You buy a small bundle at a distressed price. The merchant still has the harder problem of reaching town.');
                    recordOutcome({incidentId:incident.id, kind:'flavour', person:incident.provenance.person, tags:['merchant_met'], note:'You traded with a stranded merchant but did not secure their journey.'});
                    incident._consequenceRecorded=true;
                }
                return incident;
            }

            const before = incident.state;
            const result = originalResolve(id,outcome);
            if (before !== 'resolved') recordResolvedIncident(result);
            return result;
        };

        // presentIncident closes over the original local resolver, so replace
        // the public presenter too for the two new templates. Existing types
        // continue to use the original implementation unchanged.
        const originalPresent = w.presentIncident;
        w.presentIncident = function(incident) {
            if (!incident || !['lost_child','stranded_merchant'].includes(incident.type)) return originalPresent(incident);
            const template=w.templates[incident.type];
            if (!template || incident.state==='resolved') return false;
            if (!incident.discoveredAt) incident.discoveredAt=Number(window.worldSeconds||0);
            if (incident.state==='active') incident.state='discovered';
            const choices=template.choices(incident).map(c=>({label:c.label,action:()=>{if(c.outcome) w.resolveIncident(incident.id,c.outcome);}}));
            if (typeof window.showDialogue==='function') window.showDialogue({name:template.title,race:'human',gender:'female'},template.describe(incident),choices);
            else window.showMessage?.(`${template.title}: ${template.describe(incident)}`);
            return true;
        };

        // discoverNearby also closes over the original presenter. Wrap it only
        // for new incident types; normal discovery remains handled by V1.
        const originalDiscover=w.discoverNearby;
        w.discoverNearby=function() {
            const found=originalDiscover();
            const player=(window.entities||[]).find(e=>e?.alive&&e.side==='player'&&!e.rider);
            if (!player || window.isInCombat) return found;
            for (const incident of w.activeIncidents()) {
                if (!['lost_child','stranded_merchant'].includes(incident.type)) continue;
                const d=typeof window.distance==='function' ? window.distance(player.hex,incident.hex) : 99;
                if (d<=w.constants.DISCOVERY_RADIUS && !incident._consequencePresented) {
                    incident._consequencePresented=true;
                    w.presentIncident(incident);
                    return incident;
                }
                if (d>w.constants.DISCOVERY_RADIUS) incident._consequencePresented=false;
            }
            return found;
        };

        w.__consequenceLayerInstalled=true;
        return true;
    }

    const install=()=>{
        if (!api()) return false;
        ensureLedger();
        installAdditionalIncidents();
        window.WildernessConsequences={ensureLedger,recordOutcome,count,destinationStats,personOutcome,meetsGate,refreshUnlocks,recordResolvedIncident};
        return true;
    };

    if (!install()) {
        const timer=setInterval(()=>{ if (install()) clearInterval(timer); },25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();