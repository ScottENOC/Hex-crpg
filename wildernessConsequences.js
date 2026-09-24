// wildernessConsequences.js
// Persistent consequence layer for wilderness incidents.
//
// Emotional payoff and mechanical payoff are separate axes. Outcomes are also
// faction-agnostic: the ledger records who benefited or was harmed rather than
// assigning a hidden good/evil score. Future quests, merchants, factions and
// settlement systems can query those facts without depending on one incident ID.
(() => {
    'use strict';

    function api() { return window.WildernessIncidents; }
    function store() { return api()?.ensureStore?.() || null; }
    function now() { return Number(window.worldSeconds || 0); }

    function ensureLedger() {
        const s = store();
        if (!s) return null;
        if (!s.consequences || typeof s.consequences !== 'object') {
            s.consequences = { version:2, events:[], counters:{}, destinations:{}, people:{}, unlocks:{}, factionBenefits:{}, factionHarms:{} };
        }
        const l=s.consequences;
        l.version=Math.max(2,Number(l.version||1));
        l.events=Array.isArray(l.events)?l.events:[];
        l.counters=l.counters||{};
        l.destinations=l.destinations||{};
        l.people=l.people||{};
        l.unlocks=l.unlocks||{};
        l.factionBenefits=l.factionBenefits||{};
        l.factionHarms=l.factionHarms||{};
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
        const beneficiaries=Array.from(new Set(data.beneficiaries||[])).filter(Boolean);
        const harmedFactions=Array.from(new Set(data.harmedFactions||[])).filter(Boolean);
        const event={
            id:`outcome-${ledger.events.length+1}`,
            worldSeconds:now(),
            incidentId:data.incidentId||null,
            kind:data.kind||'flavour',
            person:data.person||null,
            origin:data.origin||null,
            destination:data.destination||null,
            tags:Array.from(new Set(data.tags||[])),
            beneficiaries,
            harmedFactions,
            note:data.note||null,
        };
        ledger.events.push(event);
        if (ledger.events.length>120) ledger.events.splice(0,ledger.events.length-120);
        event.tags.forEach(tag=>inc(ledger.counters,tag));
        inc(ledger.counters,`kind:${event.kind}`);
        beneficiaries.forEach(id=>{ inc(ledger.factionBenefits,id); inc(ledger.counters,`benefit:${id}`); });
        harmedFactions.forEach(id=>{ inc(ledger.factionHarms,id); inc(ledger.counters,`harm:${id}`); });

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
                beneficiaries:event.beneficiaries.slice(),
                harmedFactions:event.harmedFactions.slice(),
                worldSeconds:event.worldSeconds,
            };
        }
        refreshUnlocks();
        return event;
    }

    function count(tag) { return Number(ensureLedger()?.counters?.[tag]||0); }
    function factionBenefitCount(id) { return Number(ensureLedger()?.factionBenefits?.[id]||0); }
    function factionHarmCount(id) { return Number(ensureLedger()?.factionHarms?.[id]||0); }
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
        if (gate.beneficiary && factionBenefitCount(gate.beneficiary)<Number(gate.beneficiaryCount||gate.count||1)) return false;
        if (gate.harmedFaction && factionHarmCount(gate.harmedFaction)<Number(gate.harmedCount||gate.count||1)) return false;
        if (gate.person && !personOutcome(gate.person)) return false;
        if (gate.unlock && !ensureLedger()?.unlocks?.[gate.unlock]) return false;
        return true;
    }

    function refreshUnlocks() {
        const ledger=ensureLedger();
        if (!ledger) return {};
        const safe=count('safe_arrival');
        const merchants=count('merchant_arrived');
        if (safe>=2) ledger.unlocks.roadside_reputation=true;
        if (merchants>=2) ledger.unlocks.merchant_contacts=true;
        if (safe>=5) ledger.unlocks.traveller_network=true;
        if (merchants>=4) ledger.unlocks.trade_route_favours=true;
        if (factionBenefitCount('goblin_tribe')>=2) ledger.unlocks.goblin_road_intelligence=true;
        if (factionBenefitCount('thieves_guild')>=2) ledger.unlocks.guild_wilderness_contacts=true;
        if (factionBenefitCount('necromancer_cult')>=2) ledger.unlocks.vessel_seeker_field_intel=true;
        if (count('lich_claim')>=2) ledger.unlocks.lich_wilderness_network=true;
        return ledger.unlocks;
    }

    function inferDestination(incident) {
        return incident?.provenance?.destination||incident?.provenance?.origin||'Hollowmere';
    }

    function factionState() {
        return {
            goblin:!!window.isGoblinAligned?.(),
            thieves:Number(window.factions?.thieves_guild?.standing||0)>=20,
            necromancer:!window.playerIsLich && Number(window.factions?.necromancer_cult?.standing||0)>=10,
            lich:!!window.playerIsLich,
        };
    }

    function nudgeFaction(id,standing,knowledge=2) {
        const faction=window.factions?.[id];
        if (faction && typeof window.adjustReputation==='function') window.adjustReputation(faction,standing,knowledge);
    }

    function finish(incident,resolution) {
        incident.state='resolved'; incident.resolution=resolution; incident.resolvedAt=now(); incident._consequenceRecorded=true;
    }

    function recordResolvedIncident(incident) {
        if (!incident||incident._consequenceRecorded||incident.state!=='resolved') return null;
        const p=incident.provenance||{};
        let data=null;
        switch (`${incident.type}:${incident.resolution}`) {
            case 'injured_traveller:helped':
                data={kind:'systemic',person:p.person,origin:p.origin,destination:inferDestination(incident),tags:['traveller_rescued','safe_arrival'],beneficiaries:['silverhart_kingdom'],note:'An injured traveller was helped back to safety.'};
                break;
            case 'injured_traveller:robbed':
                data={kind:'systemic',person:p.person,origin:p.origin,tags:['traveller_harmed','predatory_act'],harmedFactions:['silverhart_kingdom'],note:'An injured traveller was robbed.'};
                break;
            case 'broken_cart:reported':
                data={kind:'systemic',origin:p.origin,destination:p.origin,tags:['road_hazard_reported','route_reliability'],beneficiaries:['silverhart_kingdom'],note:'A road hazard was reported instead of ignored.'};
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

    function alignedChoices(base, incident) {
        const choices=base.slice();
        const f=factionState();
        if (incident.type==='stranded_merchant') {
            if (f.goblin) choices.splice(choices.length-1,0,{label:'Tell Skarn-tooth scouts where this merchant is headed.',outcome:'goblin_intel'});
            if (f.thieves) choices.splice(choices.length-1,0,{label:'Mark the cargo for the Guild to collect later.',outcome:'guild_diversion'});
            if (f.necromancer) choices.splice(choices.length-1,0,{label:'Ask about fresh graves and deaths along the road for the Vessel-Seeker.',outcome:'cult_intel'});
            if (f.lich) choices.splice(choices.length-1,0,{label:'Compel them to carry your seal and spread word of your claim.',outcome:'lich_claim'});
        }
        if (incident.type==='injured_traveller') {
            if (f.goblin) choices.splice(choices.length-1,0,{label:'Question them about patrols and checkpoints for Skarn-tooth.',outcome:'goblin_patrol_intel'});
            if (f.thieves) choices.splice(choices.length-1,0,{label:'Take their route book for the Guild, then leave them alive.',outcome:'guild_route_book'});
            if (f.necromancer) choices.splice(choices.length-1,0,{label:'Ask where the road has buried its dead lately.',outcome:'cult_grave_intel'});
            if (f.lich) choices.splice(choices.length-1,0,{label:'Offer aid in exchange for an oath to your name.',outcome:'lich_oath'});
        }
        return choices;
    }

    function installAdditionalIncidents(w) {
        w.templates.lost_child={
            weight:2, markerTypes:[], title:'Lost Child',
            describe:i=>`A young girl is trying very hard not to cry beside the road. “My mum and dad were right behind me. I only went to see the stream.” Her family were travelling toward ${i.provenance.origin}.`,
            choices:()=>[
                {label:'Help her find her parents.',outcome:'reunite'},
                {label:'Walk her to the nearest safe road and alert travellers.',outcome:'safe_road'},
                {label:'Leave her where she is.',outcome:null},
            ],
        };

        w.templates.stranded_merchant={
            weight:2, markerTypes:['crate'], title:'Stranded Merchant',
            describe:i=>`${i.provenance.person}, a merchant bound for ${i.provenance.origin}, is crouched beside a split pack-frame. “I can mend it, but not before dark. I'd rather not spend the night here alone.”`,
            choices:i=>alignedChoices([
                {label:'Help secure the load and get them back onto the road.',outcome:'escort'},
                {label:'Buy a few damaged goods cheaply.',outcome:'buy_damaged'},
                {label:'Wish them luck and move on.',outcome:null},
            ],i),
        };

        const injured=w.templates.injured_traveller;
        if (injured && !injured.__factionChoices) {
            const original=injured.choices;
            injured.choices=i=>alignedChoices(original(i),i);
            injured.__factionChoices=true;
        }
    }

    function installResolver(w) {
        const originalResolve=w.resolveIncident;
        w.resolveIncident=function(id,outcome) {
            const incident=w.incidentById(id);
            if (!incident||!outcome) return incident;
            const p=incident.provenance||{};

            if (incident.type==='lost_child') {
                if (outcome==='reunite') {
                    finish(incident,'reunited');
                    window.showMessage?.('After a long, increasingly frantic search, two figures come running down the road. The girl bolts toward them. Her mother drops to her knees and holds on so tightly that nobody says much for a while.');
                    recordOutcome({incidentId:incident.id,kind:'flavour',person:p.person,destination:inferDestination(incident),tags:['child_reunited','safe_arrival','small_kindness'],note:'A lost child was reunited with her parents.'});
                } else if (outcome==='safe_road') {
                    finish(incident,'safe_road');
                    window.showMessage?.('You stay with her until a family wagon agrees to take her to the next settlement and send word back along the road.');
                    recordOutcome({incidentId:incident.id,kind:'flavour',person:p.person,destination:inferDestination(incident),tags:['child_helped','safe_arrival','small_kindness'],note:'A lost child was placed in safe hands.'});
                }
                return incident;
            }

            if (incident.type==='stranded_merchant') {
                if (outcome==='escort') {
                    finish(incident,'escorted');
                    window.adjustRegionStat?.(incident.regionId||'aldervale','prosperity',1);
                    window.showMessage?.(`${p.person} gets the load balanced again and reaches the safer road. “If you ever see my stall in ${inferDestination(incident)}, remind me I owe you.”`);
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,origin:p.origin,destination:inferDestination(incident),tags:['merchant_arrived','safe_arrival','route_reliability'],beneficiaries:['silverhart_kingdom'],note:'A stranded merchant reached their destination safely.'});
                } else if (outcome==='buy_damaged') {
                    const target=window.player||window.party?.[0];
                    if (target) target.gold=Number(target.gold||0)-Math.min(5,Number(target.gold||0));
                    finish(incident,'bought_damaged_goods');
                    window.showMessage?.('You buy a small bundle at a distressed price. The merchant still has the harder problem of reaching town.');
                    recordOutcome({incidentId:incident.id,kind:'flavour',person:p.person,tags:['merchant_met'],note:'You traded with a stranded merchant but did not secure their journey.'});
                } else if (outcome==='goblin_intel') {
                    finish(incident,'goblin_intel'); nudgeFaction('goblin_tribe',3,4); nudgeFaction('silverhart_kingdom',-1,1);
                    window.showMessage?.('You memorise the merchant’s destination, cargo and timing for Skarn-tooth scouts. The merchant is left to solve the broken frame alone.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,origin:p.origin,destination:inferDestination(incident),tags:['route_intelligence','merchant_exposed'],beneficiaries:['goblin_tribe'],harmedFactions:['silverhart_kingdom'],note:'Merchant route intelligence was supplied to Skarn-tooth.'});
                } else if (outcome==='guild_diversion') {
                    finish(incident,'guild_diversion'); nudgeFaction('thieves_guild',3,4);
                    window.showMessage?.('A discreet chalk mark goes onto the pack-frame. Guild eyes know what it means: unattended cargo, predictable route, owner delayed.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,origin:p.origin,destination:inferDestination(incident),tags:['diverted_trade','guild_tip'],beneficiaries:['thieves_guild'],harmedFactions:['silverhart_kingdom'],note:'A stranded merchant and cargo were marked for Guild collection.'});
                } else if (outcome==='cult_intel') {
                    finish(incident,'cult_intel'); nudgeFaction('necromancer_cult',2,3);
                    window.showMessage?.('The merchant remembers two fresh roadside burials and a hamlet with fever deaths. You keep the details for the Vessel-Seeker.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,tags:['grave_intelligence','necromantic_opportunity'],beneficiaries:['necromancer_cult'],note:'Fresh burial information was gathered for the Vessel-Seeker.'});
                } else if (outcome==='lich_claim') {
                    finish(incident,'lich_claim');
                    window.showMessage?.(`You press your seal into the merchant’s hand. “Carry that to ${inferDestination(incident)}. Tell them whose roads these are becoming.” They nod rather too quickly.`);
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,destination:inferDestination(incident),tags:['lich_claim','coerced_messenger','player_power'],beneficiaries:['player_lich'],harmedFactions:['silverhart_kingdom'],note:'A merchant was compelled to spread the player-lich’s claim.'});
                }
                return incident;
            }

            if (incident.type==='injured_traveller') {
                if (outcome==='goblin_patrol_intel') {
                    finish(incident,'goblin_patrol_intel'); nudgeFaction('goblin_tribe',2,3);
                    window.showMessage?.('Between pain and fear, the traveller gives you patrol times, a shallow ford and the checkpoint they were trying to avoid.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,tags:['patrol_intelligence','route_intelligence'],beneficiaries:['goblin_tribe'],harmedFactions:['silverhart_kingdom'],note:'Human patrol intelligence was gathered for Skarn-tooth.'});
                    return incident;
                }
                if (outcome==='guild_route_book') {
                    finish(incident,'guild_route_book'); nudgeFaction('thieves_guild',2,3);
                    window.showMessage?.('You take the route book rather than the traveller’s purse. Names, deliveries and quiet roads will be worth more to the Guild than loose coin.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,tags:['route_book_taken','guild_tip'],beneficiaries:['thieves_guild'],harmedFactions:['silverhart_kingdom'],note:'A traveller route book was taken for the Guild.'});
                    return incident;
                }
                if (outcome==='cult_grave_intel') {
                    finish(incident,'cult_grave_intel'); nudgeFaction('necromancer_cult',2,3);
                    window.showMessage?.('You leave the traveller alive, but with a careful list of recent roadside deaths committed to memory.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,tags:['grave_intelligence','necromantic_opportunity'],beneficiaries:['necromancer_cult'],note:'Recent burial sites were identified for the Vessel-Seeker.'});
                    return incident;
                }
                if (outcome==='lich_oath') {
                    finish(incident,'lich_oath');
                    window.showMessage?.('You bind the wound, but not freely. The traveller gives their name and oath, and leaves owing safety to something they now fear.');
                    recordOutcome({incidentId:incident.id,kind:'systemic',person:p.person,destination:inferDestination(incident),tags:['lich_claim','coerced_contact','player_power'],beneficiaries:['player_lich'],note:'An injured traveller was bound into the player-lich’s emerging network.'});
                    return incident;
                }
            }

            const before=incident.state;
            const result=originalResolve(id,outcome);
            if (before!=='resolved') recordResolvedIncident(result);
            return result;
        };
    }

    function installPresentation(w) {
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
                    near.add(incident.id); w.presentIncident(incident); if (!found) found=incident;
                } else if (d>w.constants.DISCOVERY_RADIUS) near.delete(incident.id);
            }
            return found;
        };

        const pulse=()=>{
            w.ensureStore(); w.expireOld(); w.maybeSpawn(); w.discoverNearby();
            for (const incident of w.ensureStore().incidents||[]) recordResolvedIncident(incident);
        };
        window.__wildernessIncidentTimer=setInterval(pulse,1200);
        pulse();
    }

    function install() {
        const w=api();
        if (!w||w.__consequenceLayerInstalled) return !!w;
        ensureLedger(); installAdditionalIncidents(w); installResolver(w); installPresentation(w);
        w.__consequenceLayerInstalled=true;
        window.WildernessConsequences={
            ensureLedger,recordOutcome,count,destinationStats,personOutcome,meetsGate,refreshUnlocks,recordResolvedIncident,
            factionState,factionBenefitCount,factionHarmCount,
        };
        return true;
    }

    if (!install()) {
        const timer=setInterval(()=>{if(install()) clearInterval(timer);},25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();