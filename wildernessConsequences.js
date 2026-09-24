// wildernessConsequences.js
// Persistent consequence layer for wilderness incidents.
//
// Emotional payoff and mechanical payoff are separate axes. Some outcomes are
// deliberately just human stories; others change a persistent ledger that
// later quests, merchants and settlement systems can query. The ledger records
// who was involved, where they were headed and tags describing what happened,
// rather than forcing future content to depend on one specific incident ID.
(() => {
    'use strict';

    function api() { return window.WildernessIncidents; }
    function store() { return api()?.ensureStore?.() || null; }
    function now() { return Number(window.worldSeconds || 0); }

    function ensureLedger() {
        const s = store();
        if (!s) return null;
        if (!s.consequences || typeof s.consequences !== 'object') {
            s.consequences = { version:1, events:[], counters:{}, destinations:{}, people:{}, unlocks:{} };
        }
        const l=s.consequences;
        l.events=Array.isArray(l.events)?l.events:[];
        l.counters=l.counters||{};
        l.destinations=l.destinations||{};
        l.people=l.people||{};
        l.unlocks=l.unlocks||{};
        return l;
    }

    function inc(obj,key,amount=1) {
        if (!key) return;
        obj[key]=Number(obj[key]||0)+amount;
    }

    function normaliseDestination(value) {
        if (!value) return null;
        return String(value).trim().toLowerCase().replace(/\s+/g,'_');
    }

    function recordOutcome(data={}) {
        const ledger=ensureLedger();
        if (!ledger) return null;
        const event={
            id:`outcome-${ledger.events.length+1}`,
            worldSeconds:now(),
            incidentId:data.incidentId||null,
            kind:data.kind||'flavour',
            person:data.person||null,
            origin:data.origin||null,
            destination:data.destination||null,
            tags:Array.from(new Set(data.tags||[])),
            note:data.note||null,
        };
        ledger.events.push(event);
        if (ledger.events.length>100) ledger.events.splice(0,ledger.events.length-100);
        event.tags.forEach(tag=>inc(ledger.counters,tag));
        inc(ledger.counters,`kind:${event.kind}`);

        const dest=normaliseDestination(event.destination);
        if (dest) {
            ledger.destinations[dest]=ledger.destinations[dest]||{arrivals:0,merchants:0,children:0,travellers:0};
            const d=ledger.destinations[dest];
            if (event.tags.includes('safe_arrival')) d.arrivals++;
            if (event.tags.includes('merchant_arrived')) d.merchants++;
            if (event.tags.includes('child_reunited')) d.children++;
            if (event.tags.includes('traveller_rescued')) d.travellers++;
        }

        if (event.person) {
            ledger.people[event.person]={
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

    function count(tag) { return Number(ensureLedger()?.counters?.[tag]||0); }
    function destinationStats(destination) {
        const key=normaliseDestination(destination);
        return ensureLedger()?.destinations?.[key]||{arrivals:0,merchants:0,children:0,travellers:0};
    }
    function personOutcome(name) { return ensureLedger()?.people?.[name]||null; }

    function meetsGate(gate={}) {
        if (gate.tag && count(gate.tag)<Number(gate.count||1)) return false;
        if (gate.destination) {
            const stats=destinationStats(gate.destination);
            const metric=gate.destinationMetric||'arrivals';
            if (Number(stats[metric]||0)<Number(gate.destinationCount||gate.count||1)) return false;
        }
        if (gate.person && !personOutcome(gate.person)) return false;
        if (gate.unlock && !ensureLedger()?.unlocks?.[gate.unlock]) return false;
        return true;
    }

    // Generic milestones: later content can opt into these, but the incident
    // itself does not suddenly spawn magical loot when a counter changes.
    function refreshUnlocks() {
        const ledger=ensureLedger();
        if (!ledger) return {};
        const safe=count('safe_arrival');
        const merchants=count('merchant_arrived');
        if (safe>=2) ledger.unlocks.roadside_reputation=true;
        if (merchants>=2) ledger.unlocks.merchant_contacts=true;
        if (safe>=5) ledger.unlocks.traveller_network=true;
        if (merchants>=4) ledger.unlocks.trade_route_favours=true;
        return ledger.unlocks;
    }

    function inferDestination(incident) {
        return incident?.provenance?.destination||incident?.provenance?.origin||'Hollowmere';
    }

    function recordResolvedIncident(incident) {
        if (!incident||incident._consequenceRecorded||incident.state!=='resolved') return null;
        const p=incident.provenance||{};
        let data=null;
        switch (`${incident.type}:${incident.resolution}`) {
            case 'injured_traveller:helped':
                data={kind:'systemic',person:p.person,origin:p.origin,destination:inferDestination(incident),tags:['traveller_rescued','safe_arrival'],note:'An injured traveller was helped back to safety.'};
                break;
            case 'injured_traveller:robbed':
                data={kind:'systemic',person:p.person,origin:p.origin,tags:['traveller_harmed','predatory_act'],note:'An injured traveller was robbed.'};
                break;
            case 'broken_cart:reported':
                data={kind:'systemic',origin:p.origin,destination:p.origin,tags:['road_hazard_reported','route_reliability'],note:'A road hazard was reported instead of ignored.'};
                break;
            case 'roadside_grave:tended':
            case 'roadside_grave:remembered':
                data={kind:'flavour',person:p.person,tags:['small_kindness','memory_kept'],note:'A forgotten roadside grave was treated with care.'};
                break;
            case 'poacher_cache:traps_destroyed':
                data={kind:'systemic',tags:['wildlife_protected'],note:'Poacher snares were destroyed.'};
                break;
        }
        if (!data) return null;
        incident._consequenceRecorded=true;
        return recordOutcome({incidentId:incident.id,...data});
    }

    function installAdditionalIncidents(w) {
        // A deliberately non-transactional vignette. The payoff is seeing a
        // frightened child reunited with her family; no gold, XP or region stat.
        w.templates.lost_child={
            weight:2,
            markerTypes:[],
            title:'Lost Child',
            describe:i=>`A young girl is trying very hard not to cry beside the road. “My mum and dad were right behind me. I only went to see the stream.” Her family were travelling toward ${i.provenance.origin}.`,
            choices:()=>[
                {label:'Help her find her parents.',outcome:'reunite'},
                {label:'Walk her to the nearest safe road and alert travellers.',outcome:'safe_road'},
                {label:'Leave her where she is.',outcome:null},
            ],
        };

        // A systemic counterpart: successful arrivals feed generic trade-route
        // gates that later merchant inventories and quest chains can query.
        w.templates.stranded_merchant={
            weight:2,
            markerTypes:['crate'],
            title:'Stranded Merchant',
            describe:i=>`${i.provenance.person}, a merchant bound for ${i.provenance.origin}, is crouched beside a split pack-frame. “I can mend it, but not before dark. I'd rather not spend the night here alone.”`,
            choices:()=>[
                {label:'Help secure the load and get them back onto the road.',outcome:'escort'},
                {label:'Buy a few damaged goods cheaply.',outcome:'buy_damaged'},
                {label:'Wish them luck and move on.',outcome:null},
            ],
        };
    }

    function installResolver(w) {
        const originalResolve=w.resolveIncident;
        w.resolveIncident=function(id,outcome) {
            const incident=w.incidentById(id);
            if (!incident||!outcome) return incident;

            if (incident.type==='lost_child') {
                if (outcome==='reunite') {
                    incident.state='resolved'; incident.resolution='reunited'; incident.resolvedAt=now();
                    window.showMessage?.('After a long, increasingly frantic search, two figures come running down the road. The girl bolts toward them. Her mother drops to her knees and holds on so tightly that nobody says much for a while.');
                    recordOutcome({incidentId:incident.id,kind:'flavour',person:incident.provenance.person,destination:inferDestination(incident),tags:['child_reunited','safe_arrival','small_kindness'],note:'A lost child was reunited with her parents.'});
                    incident._consequenceRecorded=true;
                } else if (outcome==='safe_road') {
                    incident.state='resolved'; incident.resolution='safe_road'; incident.resolvedAt=now();
                    window.showMessage?.('You stay with her until a family wagon agrees to take her to the next settlement and send word back along the road.');
                    recordOutcome({incidentId:incident.id,kind:'flavour',person:incident.provenance.person,destination:inferDestination(incident),tags:['child_helped','safe_arrival','small_kindness'],note:'A lost child was placed in safe hands.'});
                    incident._consequenceRecorded=true;
                }
                return incident;
            }

            if (incident.type==='stranded_merchant') {
                if (outcome==='escort') {
                    incident.state='resolved'; incident.resolution='escorted'; incident.resolvedAt=now();
                    window.adjustRegionStat?.(incident.regionId||'aldervale','prosperity',1);
                    window.showMessage?.(`${incident.provenance.person} gets the load balanced again and reaches the safer road. “If you ever see my stall in ${inferDestination(incident)}, remind me I owe you.”`);
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:incident.provenance.person,origin:incident.provenance.origin,destination:inferDestination(incident),tags:['merchant_arrived','safe_arrival','route_reliability'],note:'A stranded merchant reached their destination safely.'});
                    incident._consequenceRecorded=true;
                } else if (outcome==='buy_damaged') {
                    const target=window.player||window.party?.[0];
                    if (target) target.gold=Number(target.gold||0)-Math.min(5,Number(target.gold||0));
                    incident.state='resolved'; incident.resolution='bought_damaged_goods'; incident.resolvedAt=now();
                    window.showMessage?.('You buy a small bundle at a distressed price. The merchant still has the harder problem of reaching town.');
                    recordOutcome({incidentId:incident.id,kind:'flavour',person:incident.provenance.person,tags:['merchant_met'],note:'You traded with a stranded merchant but did not secure their journey.'});
                    incident._consequenceRecorded=true;
                }
                return incident;
            }

            const before=incident.state;
            const result=originalResolve(id,outcome);
            if (before!=='resolved') recordResolvedIncident(result);
            return result;
        };
    }

    function installPresentation(w) {
        // The V1 timer closes over its original presenter/resolver. Replace the
        // timer with one that calls the public API so extension incidents and
        // consequence recording always use the current resolver.
        if (window.__wildernessIncidentTimer) clearInterval(window.__wildernessIncidentTimer);
        const near=new Set();

        w.presentIncident=function(incident) {
            const template=w.templates[incident?.type];
            if (!template||incident.state==='resolved') return false;
            if (!incident.discoveredAt) incident.discoveredAt=now();
            if (incident.state==='active') incident.state='discovered';
            const options=template.choices(incident).map(c=>({label:c.label,action:()=>{if(c.outcome) w.resolveIncident(incident.id,c.outcome);}}));
            if (typeof window.showDialogue==='function') window.showDialogue({name:template.title,race:'human',gender:'female'},template.describe(incident),options);
            else window.showMessage?.(`${template.title}: ${template.describe(incident)}`);
            return true;
        };

        w.discoverNearby=function() {
            const player=(window.entities||[]).find(e=>e?.alive&&e.side==='player'&&!e.rider);
            if (!player||window.isInCombat||window.findInteriorRegion?.(player.hex)) return null;
            let found=null;
            for (const incident of w.activeIncidents()) {
                const d=typeof window.distance==='function'?window.distance(player.hex,incident.hex):Infinity;
                if (d<=w.constants.DISCOVERY_RADIUS&&!near.has(incident.id)) {
                    near.add(incident.id);
                    w.presentIncident(incident);
                    if (!found) found=incident;
                } else if (d>w.constants.DISCOVERY_RADIUS) near.delete(incident.id);
            }
            return found;
        };

        const pulse=()=>{
            w.ensureStore();
            w.expireOld();
            w.maybeSpawn();
            w.discoverNearby();
            // Saves created before this extension can contain already-resolved
            // V1 incidents. Backfill their consequence record once encountered.
            for (const incident of w.ensureStore().incidents||[]) recordResolvedIncident(incident);
        };
        window.__wildernessIncidentTimer=setInterval(pulse,1200);
        pulse();
    }

    function install() {
        const w=api();
        if (!w||w.__consequenceLayerInstalled) return !!w;
        ensureLedger();
        installAdditionalIncidents(w);
        installResolver(w);
        installPresentation(w);
        w.__consequenceLayerInstalled=true;
        window.WildernessConsequences={ensureLedger,recordOutcome,count,destinationStats,personOutcome,meetsGate,refreshUnlocks,recordResolvedIncident};
        return true;
    }

    if (!install()) {
        const timer=setInterval(()=>{if(install()) clearInterval(timer);},25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();