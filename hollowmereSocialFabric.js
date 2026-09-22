// hollowmereSocialFabric.js
// Gives Hollowmere's generated population real homes, workplaces and persistent
// relationships. It also expands the village map so the simulated headcount is
// visually credible instead of 180 people sharing a handful of buildings.
(() => {
    'use strict';

    const TARGET_POPULATION = 180;
    const BOOT_MS = 1200;
    const residences = [];
    const workplaces = [];
    const households = new Map();
    let installed = false;
    let mapExpanded = false;
    let socialisedPopulationSize = -1;

    const pop = () => window.GeneratedCivilianPopulation;
    const scheduler = () => window.NPCRoutineScheduler;
    const centre = () => window.campaign2Landmarks?.crossroads || { q: 8, r: 24 };

    function hashUnit(seed, channel) {
        const s = scheduler();
        if (s?.deterministicUnit) return s.deterministicUnit(seed, channel);
        const text = `${seed}|${channel}`;
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0) / 4294967296;
    }

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function key(h) { return `${h.q},${h.r}`; }

    function floorHexes(centerHex, halfW = 2, halfH = 2) {
        const out = [];
        for (let dq = -halfW + 1; dq <= halfW - 1; dq++) {
            const shift = -Math.floor(dq / 2);
            for (let dr = -halfH + 1; dr <= halfH - 1; dr++) {
                out.push({ q:centerHex.q+dq, r:centerHex.r+dr+shift });
            }
        }
        return out;
    }

    function wallRing(floors) {
        const f = new Set(floors.map(key));
        const walls = new Map();
        floors.forEach(h => (window.getNeighbors?.(h.q,h.r) || []).forEach(n => {
            if (!f.has(key(n))) walls.set(key(n), n);
        }));
        return [...walls.values()];
    }

    function regionTooClose(centerHex, radius = 5) {
        return (window.interiorRegions || []).some(r => {
            const rc = r.center || r.doorHex || (Number.isFinite(r.minQ) ? { q:(r.minQ+r.maxQ)/2, r:(r.minR+r.maxR)/2 } : null);
            return rc && distance(centerHex, rc) < radius;
        });
    }

    function canBuild(centerHex, halfW = 2, halfH = 2) {
        if (regionTooClose(centerHex, 5)) return false;
        const all = [...floorHexes(centerHex, halfW, halfH)];
        const ring = wallRing(all);
        return [...all, ...ring].every(h => {
            const t = window.getTerrainAt?.(h.q,h.r)?.name;
            return !['Water','Wall','Palisade Wall','Climbable Wall','Keep Wall','Stone Wall'].includes(t);
        });
    }

    function carveCottage(id, centerHex, capacity, kind = 'cottage') {
        const floors = floorHexes(centerHex, 2, 2);
        const ring = wallRing(floors);
        const c = centre();
        const door = ring.reduce((best,h) => distance(h,c) < distance(best,c) ? h : best, ring[0]);
        ring.forEach(h => window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h => window.setTerrainAt(h.q,h.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)] = { type:'door_open', lightRadius:0 };
        const hearth = floors.reduce((best,h) => distance(h,door) > distance(best,door) ? h : best, floors[0]);
        if (!window.tileObjects[key(hearth)]) window.tileObjects[key(hearth)] = { type:'fireplace', lightRadius:4 };
        const region = {
            minQ:Math.min(...floors.map(h=>h.q)), maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)), maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:0.3, doorHex:{...door}, floorHexes:floors, wallHexes:ring.filter(h=>key(h)!==key(door)),
            floorType:'Wood Floor', center:{...centerHex}, hollowmereResidenceId:id,
        };
        window.interiorRegions.push(region);
        const entry = { id, kind, center:{...centerHex}, door:{...door}, capacity, region };
        residences.push(entry);
        return entry;
    }

    function carveWorkshop(id, centerHex, type, capacity) {
        const floors = floorHexes(centerHex, 3, 2);
        const ring = wallRing(floors);
        const c = centre();
        const door = ring.reduce((best,h) => distance(h,c) < distance(best,c) ? h : best, ring[0]);
        ring.forEach(h => window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h => window.setTerrainAt(h.q,h.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)] = { type:'door_open', lightRadius:0 };
        const region = {
            minQ:Math.min(...floors.map(h=>h.q)), maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)), maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:0.35, doorHex:{...door}, floorHexes:floors, wallHexes:ring.filter(h=>key(h)!==key(door)),
            floorType:'Wood Floor', center:{...centerHex}, hollowmereWorkplaceId:id,
        };
        window.interiorRegions.push(region);
        const prop = type === 'smithy' ? 'anvil' : type === 'bakery' ? 'table' : 'crate';
        const propHex = floors[Math.floor(floors.length/2)];
        if (!window.tileObjects[key(propHex)]) window.tileObjects[key(propHex)] = { type:prop, lightRadius:type==='smithy'?2:0 };
        const entry = { id, type, center:{...centerHex}, door:{...door}, capacity, region };
        workplaces.push(entry);
        return entry;
    }

    function paintPathToward(from, to, maxSteps = 7) {
        let cur = {...from};
        for (let i=0;i<maxSteps;i++) {
            const neighbors = window.getNeighbors?.(cur.q,cur.r) || [];
            if (!neighbors.length) break;
            const next = neighbors.reduce((best,h) => distance(h,to)<distance(best,to)?h:best, neighbors[0]);
            const t = window.getTerrainAt?.(next.q,next.r)?.name;
            if (t === 'Path') break;
            if (!['Wall','Water','Palisade Wall','Climbable Wall','Keep Wall'].includes(t)) window.setTerrainAt(next.q,next.r,'Path');
            cur = next;
        }
    }

    function addExistingRegistryEntries() {
        const existing = [
            { id:'home-old-north', center:{q:0,r:-12}, door:{q:0,r:-10}, capacity:6 },
            { id:'home-mira-row', center:{q:12,r:9}, door:{q:10,r:9}, capacity:4 },
            { id:'home-oskar-row', center:{q:-6,r:9}, door:{q:-4,r:9}, capacity:4 },
            { id:'tankard-lodgings', center:{q:0,r:0}, door:{q:0,r:4}, capacity:10, kind:'lodgings' },
        ];
        existing.forEach(x => residences.push({...x, kind:x.kind || 'house'}));
        workplaces.push(
            {id:'hollow-tankard',type:'tavern',center:{q:0,r:0},door:{q:0,r:4},capacity:12},
            {id:'general-store',type:'shop',center:{q:0,r:18},door:{q:0,r:15},capacity:8},
            {id:'chapel',type:'chapel',center:{q:-14,r:0},door:{q:-11,r:0},capacity:4},
            {id:'market-green',type:'market',center:{...centre()},door:{...centre()},capacity:22},
        );
    }

    function expandMap() {
        if (mapExpanded || !window.interiorRegions || !window.setTerrainAt || !window.getNeighbors) return false;
        residences.length = 0; workplaces.length = 0;
        addExistingRegistryEntries();
        const c = centre();
        // Three loose residential lanes around the original tiny core. Candidates
        // are intentionally over-supplied; unsuitable/watery/occupied sites are
        // skipped, so future map edits do not produce overlapping buildings.
        const candidates = [];
        [-34,-26,-18,34,42].forEach(q => [-30,-20,-10,12,22,32,42].forEach(r => candidates.push({q:c.q+q,r:c.r+r})));
        [-10,0,10,20].forEach(q => [-38,-46,-54].forEach(r => candidates.push({q:c.q+q,r:c.r+r})));
        let built = 0;
        for (const pos of candidates) {
            if (built >= 30) break;
            if (!canBuild(pos,2,2)) continue;
            const capacity = 4 + (built % 3); // 4,5,6 beds; average 5.
            const home = carveCottage(`hollowmere-cottage-${String(built+1).padStart(2,'0')}`,pos,capacity,built%7===0?'tenement':'cottage');
            paintPathToward(home.door,c,8);
            built++;
        }
        const workshopCandidates = [
            {type:'smithy',pos:{q:c.q+24,r:c.r-8},cap:7},
            {type:'bakery',pos:{q:c.q-24,r:c.r+18},cap:7},
            {type:'weaver',pos:{q:c.q+26,r:c.r+22},cap:8},
            {type:'carpenter',pos:{q:c.q-28,r:c.r-20},cap:8},
        ];
        let wi=0;
        for (const w of workshopCandidates) {
            if (!canBuild(w.pos,3,2)) continue;
            const shop=carveWorkshop(`hollowmere-${w.type}`,w.pos,w.type,w.cap);
            paintPathToward(shop.door,c,9); wi++;
        }
        // Non-building jobs still need real shared destinations.
        workplaces.push(
            {id:'riverside-landing',type:'fishing',center:{q:c.q-30,r:c.r+5},door:{q:c.q-30,r:c.r+5},capacity:18},
            {id:'north-fields',type:'farm',center:{q:c.q+10,r:c.r-44},door:{q:c.q+10,r:c.r-44},capacity:42},
            {id:'south-fields',type:'farm',center:{q:c.q-12,r:c.r+48},door:{q:c.q-12,r:c.r+48},capacity:42},
            {id:'woodlot',type:'forestry',center:{q:c.q+48,r:c.r-18},door:{q:c.q+48,r:c.r-18},capacity:20},
            {id:'builders-yard',type:'labour',center:{q:c.q-34,r:c.r+30},door:{q:c.q-34,r:c.r+30},capacity:24},
        );
        window.HollowmereSettlementRegistry = { residences, workplaces, get housingCapacity(){return residences.reduce((n,r)=>n+r.capacity,0);}, get workplaceCapacity(){return workplaces.reduce((n,w)=>n+w.capacity,0);} };
        mapExpanded = true;
        return true;
    }

    function resetSocialFields(records) {
        for (const r of records) {
            r.householdId = null; r.workplaceId = null; r.spouseId = null;
            r.parentIds = []; r.childIds = []; r.friendIds = [];
            r.relationships = {};
        }
    }

    function assignHouseholds(records) {
        households.clear(); resetSocialFields(records);
        let cursor = 0;
        for (const residence of residences) {
            if (cursor >= records.length) break;
            const remaining = records.length-cursor;
            const target = Math.min(residence.capacity, remaining, 2 + Math.floor(hashUnit(residence.id,'household-size')*5));
            const members = records.slice(cursor,cursor+Math.max(1,target));
            cursor += members.length;
            if (!members.length) continue;
            const surname = members[0].name.split(' ').slice(-1)[0];
            const hid=`household:${residence.id}`;
            const household={id:hid,residenceId:residence.id,homeHex:{...residence.door},surname,memberIds:members.map(m=>m.id)};
            households.set(hid,household);
            members.forEach((m,i)=>{
                const first=m.name.split(' ')[0];
                // Most household members share a surname; occasional lodgers keep theirs.
                if (residence.kind!=='lodgings' && (i<2 || hashUnit(m.seed,'same-surname')<0.82)) m.name=`${first} ${surname}`;
                m.householdId=hid;
                m.nodes.home={key:`home:${residence.id}`,hex:{...residence.door}};
            });
            const adults=members.filter(m=>m.appearance?.ageBand!=='child');
            if (adults.length>=2) {
                const a=adults[0], b=adults.find(x=>x!==a && x.gender!==a.gender) || adults[1];
                a.spouseId=b.id; b.spouseId=a.id;
                a.relationships[b.id]='spouse'; b.relationships[a.id]='spouse';
                for (const child of members.filter(x=>x!==a&&x!==b).slice(0,3)) {
                    child.parentIds=[a.id,b.id]; a.childIds.push(child.id); b.childIds.push(child.id);
                    child.relationships[a.id]='parent'; child.relationships[b.id]='parent';
                    a.relationships[child.id]='child'; b.relationships[child.id]='child';
                }
            }
        }
        // Housing shortfall fallback: attach any overflow to the least-full house.
        while (cursor<records.length && households.size) {
            const record=records[cursor++];
            const target=[...households.values()].sort((a,b)=>a.memberIds.length-b.memberIds.length)[0];
            target.memberIds.push(record.id); record.householdId=target.id;
            const res=residences.find(r=>r.id===target.residenceId); record.nodes.home={key:`home:${res.id}`,hex:{...res.door}};
        }
    }

    const JOB_TYPES = {
        farmer:['farm'], labourer:['labour','carpenter'], merchant:['shop','market'], smith:['smithy'], fisher:['fishing'],
        hunter:['forestry'], clerk:['shop','chapel'], tavern_worker:['tavern'], craftsperson:['weaver','bakery','carpenter'], unemployed:['market'],
    };

    function assignWorkplaces(records) {
        const occupancy=new Map(workplaces.map(w=>[w.id,0]));
        for (const record of records) {
            const allowed=JOB_TYPES[record.occupation] || ['market'];
            let choices=workplaces.filter(w=>allowed.includes(w.type) && (occupancy.get(w.id)||0)<w.capacity);
            if (!choices.length) choices=workplaces.filter(w=>(occupancy.get(w.id)||0)<w.capacity);
            if (!choices.length) continue;
            choices.sort((a,b)=>distance(record.nodes.home.hex,a.door)-distance(record.nodes.home.hex,b.door) || a.id.localeCompare(b.id));
            const pick=choices[Math.min(choices.length-1,Math.floor(hashUnit(record.seed,'workplace-choice')*Math.min(3,choices.length)))];
            occupancy.set(pick.id,(occupancy.get(pick.id)||0)+1);
            record.workplaceId=pick.id;
            record.nodes.work={key:`work:${pick.id}`,hex:{...pick.door}};
        }
        workplaces.forEach(w=>w.assigned=occupancy.get(w.id)||0);
    }

    function assignFriends(records) {
        const byId=new Map(records.map(r=>[r.id,r]));
        for (const record of records) {
            const candidates=records.filter(o=>o!==record && (o.workplaceId===record.workplaceId || o.householdId!==record.householdId) && distance(o.nodes.home.hex,record.nodes.home.hex)<32);
            candidates.sort((a,b)=>hashUnit(record.seed,`friend:${a.id}`)-hashUnit(record.seed,`friend:${b.id}`));
            const target=2+Math.floor(hashUnit(record.seed,'friend-count')*3);
            record.friendIds=candidates.slice(0,target).map(x=>x.id);
            for (const fid of record.friendIds) {
                record.relationships[fid]=record.relationships[fid] || 'friend';
                const other=byId.get(fid);
                if (other && !other.friendIds.includes(record.id) && hashUnit(`${record.id}:${fid}`,'reciprocal')<0.75) {
                    other.friendIds.push(record.id); other.relationships[record.id]=other.relationships[record.id] || 'friend';
                }
            }
            const socialTarget=byId.get(record.friendIds[0]);
            if (socialTarget) record.nodes.social={key:`visit:${socialTarget.householdId}`,hex:{...socialTarget.nodes.home.hex}};
        }
    }

    function syncScheduler(records) {
        const s=scheduler(); if (!s) return;
        for (const record of records) {
            const state=s.getState(record.id); if (!state) continue;
            state.metadata={...(state.metadata||{}),householdId:record.householdId,workplaceId:record.workplaceId};
            if (!state.travel) {
                const target=pop().targetForTime(record,Number(window.worldSeconds||0));
                const node=record.nodes[target] || record.nodes.home;
                state.currentNode=node.key; state.currentHex={...node.hex};
            }
        }
    }

    function socialisePopulation() {
        const p=pop();
        if (!p?.records?.size || !mapExpanded) return false;
        const records=[...p.records.values()].sort((a,b)=>a.id.localeCompare(b.id));
        if (socialisedPopulationSize===records.length && records.every(r=>r.householdId&&r.workplaceId)) return true;
        assignHouseholds(records); assignWorkplaces(records); assignFriends(records); syncScheduler(records);
        socialisedPopulationSize=records.length;
        return true;
    }

    function install() {
        if (installed) return true;
        if (window.currentCampaign!=='2' || !pop()?.records || !window.interiorRegions || !window.campaign2Landmarks?.crossroads) return false;
        pop().ensurePopulation(TARGET_POPULATION);
        if (!expandMap()) return false;
        socialisePopulation();
        installed=true;
        return true;
    }

    function pulse() {
        if (!install()) return;
        if (pop().records.size!==socialisedPopulationSize) socialisePopulation();
    }

    window.HollowmereSocialFabric = {
        install, expandMap, socialisePopulation,
        get residences(){return residences;}, get workplaces(){return workplaces;}, get households(){return households;},
        get stats(){return {installed,mapExpanded,population:pop()?.records?.size||0,households:households.size,residences:residences.length,housingCapacity:residences.reduce((n,r)=>n+r.capacity,0),workplaces:workplaces.length,workplaceCapacity:workplaces.reduce((n,w)=>n+w.capacity,0)};},
        TARGET_POPULATION,
    };

    window.__hollowmereSocialFabricTimer=setInterval(pulse,BOOT_MS);
    pulse();
})();