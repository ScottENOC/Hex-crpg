// silverhartPopulation.js
// Persistent capital population built for seamless chunk streaming. Silverhart
// has hundreds of people in the simulation, but only residents intersecting a
// hot party-centred chunk become Entity objects.
(() => {
    'use strict';

    const TARGET_POPULATION = 500;
    const PER_OBSERVER_BUDGET = 55;
    const HARD_CAP = 180;
    const PULSE_MS = 900;
    const EVENT_TYPE = 'routine:silverhart-transition';
    const ARRIVAL_INDEX_EVENT = 'routine:silverhart-reindex-arrival';

    const records = new Map();
    const materialised = new Map();
    const chunkIndex = new Map();
    const memberships = new Map();
    let installed = false;
    let pulseCount = 0;
    let materialiseCount = 0;
    let dematerialiseCount = 0;

    const FIRST = ['Alda','Bren','Caro','Dain','Elia','Fara','Galen','Hett','Iven','Jessa','Korin','Lysa','Maren','Nell','Oran','Pera','Rusk','Sera','Tarin','Vela'];
    const LAST = ['Aster','Bell','Crown','Dyer','Ember','Fallow','Gable','Hearth','Ivory','Kestrel','Lark','Mason','Nettle','Pike','Quill','Rook','Slate','Tanner','Voss','Wick'];
    const JOBS = ['labourer','merchant','clerk','guard_support','tavern_worker','smith','weaver','porter','servant','artisan','carter','unemployed'];
    const RACES = ['human','human','human','human','human','human','dwarf','elf','goblin','orc'];
    const DISTRICT_KEYS = ['commons','merchant','palace','diplomatic','warrens'];

    const scheduler = () => window.NPCRoutineScheduler;
    const stream = () => window.WorldChunkStreaming;
    const scale = () => window.SettlementScale;
    const now = () => Number(window.worldSeconds || 0);

    function unit(seed,channel) {
        if (scheduler()?.deterministicUnit) return scheduler().deterministicUnit(seed,channel);
        const text=`${seed}|${channel}`; let h=2166136261;
        for (let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
        return (h>>>0)/4294967296;
    }

    function pick(seed,channel,list){ return list[Math.min(list.length-1,Math.floor(unit(seed,channel)*list.length))]; }

    function hexAround(center,seed,channel,radius=24){
        const angle=unit(seed,`${channel}:angle`)*Math.PI*2;
        const r=4+unit(seed,`${channel}:radius`)*radius;
        return {q:Math.round(center.q+Math.cos(angle)*r),r:Math.round(center.r+Math.sin(angle)*r)};
    }

    function silverhart(){ scale()?.seedCampaign2Settlements?.(); return scale()?.get?.('silverhart'); }

    function districtCentre(id,fallback){
        const s=silverhart();
        return s?.districts?.find(d=>d.id===id)?.centre || fallback;
    }

    function makeRecord(index){
        const s=silverhart();
        if (!s?.centre) return null;
        const seed=`silverhart-civilian-${index}`;
        const district=pick(seed,'district',DISTRICT_KEYS);
        const dc=districtCentre(district,s.centre);
        const isDependent=unit(seed,'dependent')<0.19;
        const gender=unit(seed,'gender')<0.5?'female':'male';
        const race=pick(seed,'race',RACES);
        const home=hexAround(dc,seed,'home',26);
        const workDistrict=isDependent?district:pick(seed,'work-district',DISTRICT_KEYS);
        const wc=districtCentre(workDistrict,s.centre);
        const work=isDependent?home:hexAround(wc,seed,'work',22);
        const social=hexAround(dc,seed,'social',20);
        return {
            id:`silverhart-civilian:${index}`,seed,alive:true,
            name:`${pick(seed,'first',FIRST)} ${pick(seed,'last',LAST)}`,
            gender,race,district,workDistrict,isDependent,
            occupation:isDependent?'dependent':pick(seed,'job',JOBS),
            colour:['#736657','#6c735f','#6a5f73','#755f5b','#596d75'][Math.floor(unit(seed,'colour')*5)],
            appearance:{
                ageBand:isDependent?'child':pick(seed,'age',['young_adult','adult','adult','older']),
                heightScale:isDependent?0.72+unit(seed,'height')*0.16:0.90+unit(seed,'height')*0.20,
                build:pick(seed,'build',['slender','average','average','broad','stocky']),
                hair:pick(seed,'hair',['short','long','cropped','braided','tied_back','wavy','bald']),
                clothing:pick(seed,'clothing',['plain','dyed','workwear','clean','patched']),
                skinVariant:Math.floor(unit(seed,'skin')*5),
            },
            nodes:{
                home:{key:`silverhart:home:${index}`,hex:home},
                work:{key:`silverhart:work:${index}`,hex:work},
                social:{key:`silverhart:social:${index}`,hex:social},
            },
            commuteMinutes:6+Math.floor(unit(seed,'commute')*18),
            dayOffsetMinutes:Math.floor((unit(seed,'offset')-.5)*50),
        };
    }

    function routineHours(record){
        if (record.isDependent) return [
            {hour:9,target:'social',activity:'out_and_about'},
            {hour:18,target:'home',activity:'at_home'},
            {hour:21,target:'home',activity:'sleeping'},
        ];
        const o=record.dayOffsetMinutes/60;
        return [
            {hour:7.5+o,target:'work',activity:'working'},
            {hour:17.5+o,target:'social',activity:'socialising'},
            {hour:21.5+o,target:'home',activity:'sleeping'},
        ];
    }

    function targetForTime(record,at=now()){
        const h=((((at%86400)+86400)%86400)/3600);
        const hours=routineHours(record);
        if(h<hours[0].hour||h>=hours[2].hour)return 'home';
        if(h<hours[1].hour)return hours[0].target;
        return hours[1].target;
    }

    function nextTransition(record,at=now()){
        const day=Math.floor(at/86400)*86400;
        const c=routineHours(record).map(x=>({at:day+x.hour*3600,target:x.target,activity:x.activity}));
        return c.find(x=>x.at>at+.001)||{...c[0],at:c[0].at+86400};
    }

    function addIndex(id,key){ if(!key)return; if(!chunkIndex.has(key))chunkIndex.set(key,new Set()); chunkIndex.get(key).add(id); }
    function removeIndex(id,key){ const set=chunkIndex.get(key); if(!set)return; set.delete(id); if(!set.size)chunkIndex.delete(key); }
    function setMembership(id,keys){
        const prev=memberships.get(id)||new Set();
        for(const k of prev)if(!keys.has(k))removeIndex(id,k);
        for(const k of keys)if(!prev.has(k))addIndex(id,k);
        memberships.set(id,keys);
    }
    function indexAt(id,...hexes){
        const keys=new Set(hexes.filter(Boolean).map(h=>stream()?.chunkKey(h,0)).filter(Boolean));
        setMembership(id,keys);
    }

    function registerRecord(record,at=now()){
        const target=targetForTime(record,at); const node=record.nodes[target];
        scheduler().registerNpc(record.id,{simulationLevel:'dormant',activity:target==='home'?'sleeping':'scheduled',currentNode:node.key,currentHex:node.hex,metadata:{silverhartCivilian:true,district:record.district,occupation:record.occupation}});
        indexAt(record.id,node.hex);
        const next=nextTransition(record,at);
        scheduler().scheduleEvent(record.id,next.at,EVENT_TYPE,{target:next.target,activity:next.activity});
    }

    function onTransition(state,event,at){
        const record=records.get(String(state.id)); if(!record?.alive)return;
        const target=record.nodes[event.payload?.target]; if(!target)return;
        const current=scheduler().getAbstractLocation(record.id,at)?.hex||state.currentHex||record.nodes.home.hex;
        const arrivesAt=at+record.commuteMinutes*60;
        scheduler().beginAbstractTravel(record.id,{fromNode:state.currentNode,toNode:target.key,fromHex:current,toHex:target.hex,departedAt:at,arrivesAt,activity:'travelling',arrivalActivity:event.payload?.activity||'scheduled'});
        // While travelling index both ends so either hot chunk can promote the person.
        indexAt(record.id,current,target.hex);
        scheduler().scheduleEvent(record.id,arrivesAt+.01,ARRIVAL_INDEX_EVENT,{hex:target.hex});
        const next=nextTransition(record,at+1);
        scheduler().scheduleEvent(record.id,next.at,EVENT_TYPE,{target:next.target,activity:next.activity});
    }

    function onArrivalIndex(state,event){ indexAt(String(state.id),event.payload?.hex||state.currentHex); }

    function ensurePopulation(count=TARGET_POPULATION){
        const target=Math.max(0,Math.floor(Number(count)||0));
        if(!silverhart()?.centre||!scheduler()||!stream())return records.size;
        for(let i=records.size;i<target;i++){
            const record=makeRecord(i); if(!record)break;
            records.set(record.id,record); registerRecord(record);
        }
        return records.size;
    }

    function recordLocation(record,at=now()){
        return scheduler()?.getAbstractLocation(record.id,at)?.hex||scheduler()?.getState(record.id)?.currentHex||record.nodes.home.hex;
    }

    function passable(hex){
        if(!hex)return null;
        const q=[{q:Math.round(hex.q),r:Math.round(hex.r)}],seen=new Set();
        while(q.length&&seen.size<60){
            const h=q.shift(),k=`${h.q},${h.r}`; if(seen.has(k))continue; seen.add(k);
            const t=window.getTerrainAt?.(h.q,h.r)?.name;
            const occupied=(window.entities||[]).some(e=>e?.alive&&e.hex?.q===h.q&&e.hex?.r===h.r);
            if(!occupied&&!['Wall','Water','Palisade Wall','Keep Wall','Stone Wall'].includes(t))return h;
            if(window.getNeighbors)q.push(...window.getNeighbors(h.q,h.r));
        }
        return {q:Math.round(hex.q),r:Math.round(hex.r)};
    }

    function materialise(record,at=now()){
        if(!record?.alive||materialised.has(record.id)||typeof window.Entity!=='function')return null;
        const hex=passable(recordLocation(record,at)); if(!hex)return null;
        const e=new window.Entity(record.name,record.colour,hex,10);
        e.id=record.id;e.side='neutral';e.isNPC=true;e.race=record.race;e.gender=record.gender;
        e.tags=['humanoid','civilian','silverhart'];e.occupation=record.occupation;e.appearance={...record.appearance};
        e.isGeneratedCivilian=true;e.isSilverhartCivilian=true;e.generatedCivilianSeed=record.seed;
        e.hp=record.isDependent?4:7;e.maxHp=e.hp;e.visualQ=e.startQ=hex.q;e.visualR=e.startR=hex.r;
        const state=scheduler()?.getState(record.id);
        if(state?.travel?.toHex){e.destination={q:Math.round(state.travel.toHex.q),r:Math.round(state.travel.toHex.r)};e.prefersRoads=true;}
        window.entities.push(e);materialised.set(record.id,e);scheduler()?.promoteNpc(record.id,'silverhart-hot-chunk');materialiseCount++;return e;
    }

    function dematerialise(id,{force=false}={}){
        const e=materialised.get(id);if(!e||(window.isInCombat&&!force))return false;
        const state=scheduler()?.getState(id);scheduler()?.demoteNpc(id,state?.travel?'abstract':'dormant');
        const i=(window.entities||[]).indexOf(e);if(i>=0)window.entities.splice(i,1);
        materialised.delete(id);dematerialiseCount++;return true;
    }

    function candidateIds(){
        const out=new Set();
        for(const key of stream()?.activeChunks||[])for(const id of chunkIndex.get(key)||[])out.add(id);
        return out;
    }

    function pulse(){
        if(!install())return false; pulseCount++; stream().pulse(); ensurePopulation();
        const observers=stream().observers;if(!observers.length)return false;
        const at=now(), candidates=[];
        for(const id of candidateIds()){
            const record=records.get(id);if(!record?.alive)continue;
            const hex=recordLocation(record,at);if(!stream().isHexActive(hex,0))continue;
            candidates.push({record,distance:stream().nearestObserverDistance(hex,0)});
        }
        candidates.sort((a,b)=>a.distance-b.distance||a.record.id.localeCompare(b.record.id));
        const budget=Math.min(HARD_CAP,Math.max(PER_OBSERVER_BUDGET,observers.length*PER_OBSERVER_BUDGET));
        const selected=candidates.slice(0,budget),wanted=new Set(selected.map(x=>x.record.id));
        for(const {record} of selected)materialise(record,at);
        if(!window.isInCombat)for(const id of [...materialised.keys()])if(!wanted.has(id))dematerialise(id);
        return {population:records.size,candidates:candidates.length,materialised:materialised.size,budget,observers:observers.length};
    }

    function install(){
        if(installed)return true;
        if(!scheduler()||!stream()||!scale()||window.currentCampaign!=='2')return false;
        if(!silverhart()?.centre)return false;
        scheduler().registerHandler(EVENT_TYPE,onTransition);
        scheduler().registerHandler(ARRIVAL_INDEX_EVENT,onArrivalIndex);
        ensurePopulation();installed=true;return true;
    }

    window.SilverhartPopulation={
        install,pulse,ensurePopulation,materialise,dematerialise,recordLocation,
        get records(){return records;},get materialised(){return materialised;},get chunkIndex(){return chunkIndex;},
        get stats(){return {installed,population:records.size,living:[...records.values()].filter(r=>r.alive).length,materialised:materialised.size,indexedChunks:chunkIndex.size,pulseCount,materialiseCount,dematerialiseCount,targetPopulation:TARGET_POPULATION};},
        TARGET_POPULATION,PER_OBSERVER_BUDGET,HARD_CAP,
    };

    window.__silverhartPopulationTimer=setInterval(pulse,PULSE_MS);
    pulse();
})();
