// persistentRoadTravellers.js
// Sparse named travellers who actually move between Campaign 2 settlements.
// Off-screen they are only scheduler records. Near the party they become normal
// NPC entities and visibly walk short road segments, then disappear back into
// abstract travel when the player leaves their area.
(() => {
    'use strict';

    const PREFIX = 'road-traveller:';
    const DEPART_EVENT = 'road-traveller:depart';
    const PULSE_MS = 1500;
    const MATERIALISE_RADIUS = 30;
    const DEMATERIALISE_RADIUS = 38;
    const MAX_LIVE = 6;
    const SECONDS_PER_HEX = 95;
    const MIN_TRIP_SECONDS = 45 * 60;

    const records = new Map();
    const materialised = new Map();
    let handlerInstalled = false;
    let seeded = false;
    let pulseCount = 0;

    const TEMPLATES = [
        { name:'Tessa Vale', title:'Royal Courier', race:'human', gender:'female', role:'courier', route:'north', colour:'#657a9c' },
        { name:'Darin Kettle', title:'Carter', race:'human', gender:'male', role:'carter', route:'north', colour:'#80684d' },
        { name:'Elsi Willow', title:'Travelling Herbalist', race:'elf', gender:'female', role:'herbalist', route:'north', colour:'#60805c' },
        { name:'Perrin Moss', title:'Pilgrim', race:'human', gender:'male', role:'pilgrim', route:'north', colour:'#857e72' },
        { name:'Bram Sedge', title:'Peddler', race:'human', gender:'male', role:'peddler', route:'east', colour:'#836a8d' },
        { name:'Nessa Reed', title:'Fishmonger', race:'human', gender:'female', role:'fishmonger', route:'east', colour:'#557985' },
        { name:'Garran Pike', title:'Watch Messenger', race:'human', gender:'male', role:'messenger', route:'east', colour:'#596b8a' },
        { name:'Mara Yarrow', title:'Road Healer', race:'human', gender:'female', role:'healer', route:'east', colour:'#7a696f' },
        { name:'Dori Flint', title:'Ore Buyer', race:'dwarf', gender:'male', role:'ore_buyer', route:'ore', colour:'#76614c' },
        { name:'Orin Harth', title:'Miner', race:'human', gender:'male', role:'miner', route:'ore', colour:'#66645a' },
        { name:'Pella Moss', title:'Trapper', race:'human', gender:'female', role:'trapper', route:'ore', colour:'#5e704d' },
        { name:'Iven Clay', title:'Tool Carrier', race:'human', gender:'male', role:'labourer', route:'ore', colour:'#716c62' },
    ];

    const CHATTER = {
        courier: '“Roads are clear enough. I would still rather not spend the night on one.”',
        carter: '“Wheels hate stones, mud and haste. Customers insist on all three.”',
        herbalist: '“The useful plants rarely grow where the road makes them convenient.”',
        pilgrim: '“I am not lost. I am simply taking a less certain route.”',
        peddler: '“If you need it badly enough, I probably sold the last one yesterday.”',
        fishmonger: '“Fresh this morning. Less fresh every mile from here.”',
        messenger: '“Nothing urgent enough to tell strangers. Urgent enough that I should keep moving.”',
        healer: '“Most road injuries begin with someone saying they can make it before dark.”',
        ore_buyer: '“Good ore is heavy. Bad ore is also heavy. That is why I get paid to look.”',
        miner: '“Going underground is easy. It is the coming back up that makes a day.”',
        trapper: '“You learn more from what avoids a road than from what walks on it.”',
        labourer: '“Tools there, tools back. Somehow the uphill part is always the loaded part.”',
    };

    function scheduler() { return window.NPCRoutineScheduler; }
    function now() { return Number(window.worldSeconds || 0); }

    function distance(a,b) {
        if (!a || !b) return Infinity;
        if (window.distance) return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function unit(seed, channel='') {
        if (scheduler()?.deterministicUnit) return scheduler().deterministicUnit(seed,channel);
        const text=`${seed}|${channel}`;
        let h=2166136261;
        for (let i=0;i<text.length;i++) { h^=text.charCodeAt(i); h=Math.imul(h,16777619); }
        return (h>>>0)/4294967296;
    }

    function cloneHex(h) { return h && Number.isFinite(h.q) && Number.isFinite(h.r) ? {q:h.q,r:h.r} : null; }

    function routeEndpoints(routeId) {
        const hollowmere = window.campaign2Landmarks?.crossroads;
        if (!hollowmere) return null;
        if (routeId === 'north') {
            const other = window.campaign2MillbrookCenter;
            return other ? { a:{id:'hollowmere',hex:cloneHex(hollowmere)}, b:{id:'millbrook',hex:cloneHex(other)} } : null;
        }
        if (routeId === 'east') {
            const other = window.campaign2ReddaleGuardhouseCenter || window.campaign2ReddaleInnCenter || window.campaign2ReddaleReeveHouseCenter;
            return other ? { a:{id:'hollowmere',hex:cloneHex(hollowmere)}, b:{id:'reddale',hex:cloneHex(other)} } : null;
        }
        if (routeId === 'ore') {
            const other = window.campaign2EmberlodeCenter;
            return other ? { a:{id:'hollowmere',hex:cloneHex(hollowmere)}, b:{id:'emberlode',hex:cloneHex(other)} } : null;
        }
        return null;
    }

    function tripDuration(route) {
        return Math.max(MIN_TRIP_SECONDS, Math.round(distance(route.a.hex,route.b.hex) * SECONDS_PER_HEX));
    }

    function dwellSeconds(record, endpointKey) {
        return Math.round((2 + unit(record.seed,`dwell:${endpointKey}`) * 3.5) * 3600);
    }

    function nodeId(record, endpointKey) {
        const route=routeEndpoints(record.routeId);
        return route ? `road:${record.routeId}:${route[endpointKey].id}` : `road:${record.routeId}:${endpointKey}`;
    }

    function makeRecord(template,index) {
        const id=`${PREFIX}${index}`;
        const seed=`road-person-${index}-${template.name}`;
        const hairRoll=unit(seed,'hair');
        const hair = template.gender === 'male' && hairRoll < 0.055
            ? 'bald'
            : ['brown_1','braid','curly'][Math.floor(unit(seed,'hair-style')*3)%3];
        return {
            id, seed, index,
            name:template.name, title:template.title,
            race:template.race, gender:template.gender, role:template.role,
            routeId:template.route, colour:template.colour,
            alive:true,
            appearance:{
                hair,
                bodyType:unit(seed,'build') < 0.18 ? 'broad' : 'average',
                hairHue:Math.round(8 + unit(seed,'hair-hue')*48),
                shirtHue:Math.round(unit(seed,'shirt')*359),
                pantsHue:Math.round(unit(seed,'pants')*359),
            },
            materialisedEntityId:null,
            createdAt:now(),
            diedAt:null,
        };
    }

    function registerRecord(record, { freshTrip=true }={}) {
        const s=scheduler();
        const route=routeEndpoints(record.routeId);
        if (!s || !route || !record.alive) return false;
        if (s.getState(record.id)) return true;

        const startAtA = unit(record.seed,'direction') < 0.5;
        const fromKey=startAtA?'a':'b';
        const toKey=startAtA?'b':'a';
        const duration=tripDuration(route);
        s.registerNpc(record.id,{
            simulationLevel:'abstract', activity:'travelling',
            currentNode:nodeId(record,fromKey), currentHex:route[fromKey].hex,
            metadata:{ roadTraveller:true, role:record.role, race:record.race, gender:record.gender, routeId:record.routeId },
        });

        if (freshTrip) {
            // Start people at different points along the road so a fresh game
            // does not launch twelve travellers from settlement gates together.
            const progress=0.08 + unit(record.seed,'initial-progress')*0.84;
            const departedAt=now()-duration*progress;
            const arrivesAt=now()+duration*(1-progress);
            s.beginAbstractTravel(record.id,{
                fromNode:nodeId(record,fromKey), toNode:nodeId(record,toKey), routeId:record.routeId,
                fromHex:route[fromKey].hex, toHex:route[toKey].hex,
                departedAt, arrivesAt, activity:'travelling', arrivalActivity:'visiting',
            });
            s.scheduleEvent(record.id,arrivesAt+dwellSeconds(record,toKey),DEPART_EVENT,{fromKey:toKey});
        }
        return true;
    }

    function startDeparture(state,event) {
        const record=records.get(String(state.id));
        if (!record?.alive) return;
        const route=routeEndpoints(record.routeId);
        if (!route) return;
        const fromKey=event.payload?.fromKey === 'b' ? 'b' : 'a';
        const toKey=fromKey==='a'?'b':'a';
        const departedAt=now();
        const arrivesAt=departedAt+tripDuration(route);
        scheduler().beginAbstractTravel(record.id,{
            fromNode:nodeId(record,fromKey),toNode:nodeId(record,toKey),routeId:record.routeId,
            fromHex:route[fromKey].hex,toHex:route[toKey].hex,
            departedAt,arrivesAt,activity:'travelling',arrivalActivity:'visiting',
        });
        scheduler().scheduleEvent(record.id,arrivesAt+dwellSeconds(record,toKey),DEPART_EVENT,{fromKey:toKey});
        const live=materialised.get(record.id);
        if (live) setShortWalkingTarget(record,live);
    }

    function ensureHandler() {
        if (handlerInstalled) return true;
        if (!scheduler()?.registerHandler) return false;
        scheduler().registerHandler(DEPART_EVENT,startDeparture);
        handlerInstalled=true;
        return true;
    }

    function ensureTravellers() {
        if (window.currentCampaign !== '2' || !ensureHandler()) return 0;
        if (!routeEndpoints('north') || !routeEndpoints('east') || !routeEndpoints('ore')) return records.size;
        if (!records.size) {
            TEMPLATES.forEach((template,index)=>records.set(`${PREFIX}${index}`,makeRecord(template,index)));
            seeded=true;
        }
        for (const record of records.values()) if (record.alive && !scheduler().getState(record.id)) registerRecord(record);
        return records.size;
    }

    function partyHexes() {
        return (window.entities||[]).filter(e=>e?.alive && e.side==='player' && !e.rider).map(e=>e.hex).filter(Boolean);
    }

    function nearestPartyDistance(hex) {
        let best=Infinity;
        for (const p of partyHexes()) best=Math.min(best,distance(p,hex));
        return best;
    }

    function passable(h) {
        const terrain=window.getTerrainAt?.(h.q,h.r);
        if (!terrain || terrain.impassable || ['Water','Wall','Palisade Wall','Keep Wall','Stone Wall'].includes(terrain.name)) return false;
        return !(window.entities||[]).some(e=>e?.alive && e.hex?.q===h.q && e.hex?.r===h.r);
    }

    function nearestRoadHex(target,maxRadius=10) {
        if (!target) return null;
        const start={q:Math.round(target.q),r:Math.round(target.r)};
        const queue=[start];
        const seen=new Set();
        let fallback=null;
        while (queue.length && seen.size<240) {
            const h=queue.shift();
            const k=`${h.q},${h.r}`;
            if (seen.has(k)) continue;
            seen.add(k);
            if (distance(start,h)>maxRadius) continue;
            const terrain=window.getTerrainAt?.(h.q,h.r);
            if (passable(h) && !fallback) fallback=h;
            if (passable(h) && (terrain?.name==='Path' || terrain?.name==='Dirt')) return h;
            for (const n of window.getNeighbors?.(h.q,h.r)||[]) if (!seen.has(`${n.q},${n.r}`)) queue.push(n);
        }
        return fallback || start;
    }

    function shortTargetFor(record) {
        const state=scheduler()?.getState(record.id);
        const travel=state?.travel;
        if (!travel?.fromHex || !travel?.toHex) return null;
        const loc=scheduler().getAbstractLocation(record.id,now());
        const ahead=Math.min(1,(loc?.progress||0)+0.055);
        const raw={
            q:travel.fromHex.q+(travel.toHex.q-travel.fromHex.q)*ahead,
            r:travel.fromHex.r+(travel.toHex.r-travel.fromHex.r)*ahead,
        };
        return nearestRoadHex(raw,12);
    }

    function setShortWalkingTarget(record,entity) {
        if (!entity?.alive) return false;
        const target=shortTargetFor(record);
        if (!target) { entity.destination=null; return false; }
        if (distance(entity.hex,target)<=1) return false;
        entity.destination={q:target.q,r:target.r};
        entity.prefersRoads=true;
        return true;
    }

    function materialise(record) {
        if (!record?.alive || materialised.has(record.id) || typeof window.Entity!=='function') return materialised.get(record.id)||null;
        const loc=scheduler()?.getAbstractLocation(record.id,now());
        const source=loc?.hex || scheduler()?.getState(record.id)?.currentHex;
        if (!source) return null;
        const hex=nearestRoadHex(source,12);
        if (!hex || !passable(hex)) return null;

        const e=new window.Entity(record.name,record.colour||'#777',{q:hex.q,r:hex.r},8);
        e.id=record.id;
        e.side='neutral';
        e.isNPC=true;
        e.isRoadTraveller=true;
        e.roadTravellerId=record.id;
        e.title=record.title;
        e.race=record.race;
        e.gender=record.gender;
        e.occupation=record.role;
        e.factionId='silverhart_kingdom';
        e.tags=['humanoid','civilian','traveller'];
        e.equipped={weapon:null,offhand:null,armor:null,helmet:null};
        e.hairStyle=record.appearance.hair;
        e.bodyType=record.appearance.bodyType;
        e.hairHue=record.appearance.hairHue;
        e.shirtHue=record.appearance.shirtHue;
        e.pantsHue=record.appearance.pantsHue;
        e.generatedCivilianSeed=record.seed;
        e.arenaFlavorLine=CHATTER[record.role] || 'The traveller gives you a brief nod and looks back to the road.';
        e.hp=e.maxHp=7;
        e.visualQ=e.startQ=hex.q;
        e.visualR=e.startR=hex.r;
        window.entities.push(e);
        materialised.set(record.id,e);
        record.materialisedEntityId=e.id;
        scheduler()?.promoteNpc(record.id,'road-traveller-near-party');
        setShortWalkingTarget(record,e);
        window.NPCReliability?.normaliseNpcVisuals?.(e);
        return e;
    }

    function dematerialise(id,{force=false}={}) {
        const record=records.get(String(id));
        const e=materialised.get(String(id));
        if (!e || (window.isInCombat && !force)) return false;
        if (!e.alive && record) {
            record.alive=false;
            record.diedAt=record.diedAt ?? now();
            scheduler()?.unregisterNpc(record.id);
        } else if (record?.alive) {
            const state=scheduler()?.getState(record.id);
            scheduler()?.demoteNpc(record.id,state?.travel?'abstract':'dormant');
        }
        const index=(window.entities||[]).indexOf(e);
        if (index>=0) window.entities.splice(index,1);
        materialised.delete(String(id));
        if (record) record.materialisedEntityId=null;
        return true;
    }

    function syncDeaths() {
        let deaths=0;
        for (const [id,e] of materialised) {
            if (e?.alive) continue;
            const record=records.get(id);
            if (record?.alive) {
                record.alive=false;
                record.diedAt=now();
                scheduler()?.unregisterNpc(id);
                deaths++;
            }
        }
        return deaths;
    }

    function pulse() {
        pulseCount++;
        if (window.currentCampaign!=='2' || !scheduler()) return {active:false,materialised:materialised.size};
        ensureTravellers();
        syncDeaths();
        const party=partyHexes();
        if (!party.length) return {active:false,materialised:materialised.size};

        const candidates=[];
        for (const record of records.values()) {
            if (!record.alive) continue;
            const loc=scheduler().getAbstractLocation(record.id,now());
            const hex=loc?.hex || scheduler().getState(record.id)?.currentHex;
            if (!hex) continue;
            const d=nearestPartyDistance(hex);
            if (d<=MATERIALISE_RADIUS) candidates.push({record,d});
        }
        candidates.sort((a,b)=>a.d-b.d || a.record.id.localeCompare(b.record.id));
        const wanted=new Set(candidates.slice(0,MAX_LIVE).map(x=>x.record.id));

        for (const {record} of candidates.slice(0,MAX_LIVE)) {
            const e=materialised.get(record.id) || materialise(record);
            if (e?.alive) {
                const state=scheduler().getState(record.id);
                if (state?.travel && (!e.destination || distance(e.hex,e.destination)<=2)) setShortWalkingTarget(record,e);
                if (!state?.travel) e.destination=null;
            }
        }
        if (!window.isInCombat) {
            for (const id of [...materialised.keys()]) {
                const e=materialised.get(id);
                if (!wanted.has(id) || nearestPartyDistance(e?.hex)>DEMATERIALISE_RADIUS || !records.get(id)?.alive) dematerialise(id,{force:!records.get(id)?.alive});
            }
        }
        return {active:true,candidates:candidates.length,materialised:materialised.size,total:records.size};
    }

    function clear({unregister=true}={}) {
        for (const id of [...materialised.keys()]) dematerialise(id,{force:true});
        if (unregister) for (const id of records.keys()) scheduler()?.unregisterNpc(id);
        records.clear();
        seeded=false;
    }

    function install() {
        if (!scheduler()) return false;
        ensureHandler();
        ensureTravellers();
        window.PersistentRoadTravellers={
            ensureTravellers,registerRecord,pulse,materialise,dematerialise,syncDeaths,clear,
            routeEndpoints,shortTargetFor,nearestRoadHex,
            get records(){return records;},
            get materialised(){return materialised;},
            get stats(){return {seeded,total:records.size,living:[...records.values()].filter(r=>r.alive).length,materialised:materialised.size,pulseCount,maxLive:MAX_LIVE};},
            constants:{PREFIX,DEPART_EVENT,MATERIALISE_RADIUS,DEMATERIALISE_RADIUS,MAX_LIVE,SECONDS_PER_HEX},
        };
        return true;
    }

    if (!install()) {
        const boot=setInterval(()=>{if(install()) clearInterval(boot);},50);
        setTimeout(()=>clearInterval(boot),10000);
    }
    window.__persistentRoadTravellersTimer=setInterval(pulse,PULSE_MS);
    setTimeout(pulse,0);
})();
