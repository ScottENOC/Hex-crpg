// millbrookExpansion.js
// Turns the original one-house Millbrook quest stop into a small lived-in
// northern village while preserving Petra Hollis's house, the Border War
// quartermaster hook, dragon quest geography and every existing authored NPC.
(() => {
    'use strict';

    const BOOT_MS = 1200;
    const TARGET_POPULATION = 36;
    const buildings = [];
    let installed = false;
    let expanded = false;

    const key = h => `${h.q},${h.r}`;
    const centre = () => window.campaign2MillbrookCenter || null;
    const distance = (a,b) => typeof window.distance === 'function'
        ? window.distance(a,b)
        : Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));

    function floorHexes(c, halfW=2, halfH=2) {
        const out=[];
        for(let dq=-halfW+1; dq<=halfW-1; dq++) {
            const shift=-Math.floor(dq/2);
            for(let dr=-halfH+1; dr<=halfH-1; dr++) out.push({q:c.q+dq,r:c.r+dr+shift});
        }
        return out;
    }

    function wallRing(floors) {
        const floorSet=new Set(floors.map(key));
        const walls=new Map();
        for(const h of floors) for(const n of (window.getNeighbors?.(h.q,h.r)||[])) {
            if(!floorSet.has(key(n))) walls.set(key(n),n);
        }
        return [...walls.values()];
    }

    function blockedTerrain(name) {
        return ['Path','Water','Wall','Palisade Wall','Keep Wall','Stone Wall','Wood Floor','Cave Floor','Climbable Wall'].includes(name);
    }

    function canBuild(c, halfW=2, halfH=2) {
        const floors=floorHexes(c,halfW,halfH), ring=wallRing(floors);
        const all=[...floors,...ring];
        if ((window.interiorRegions||[]).some(r => {
            const rc=r.center || r.doorHex || (Number.isFinite(r.minQ)?{q:(r.minQ+r.maxQ)/2,r:(r.minR+r.maxR)/2}:null);
            return rc && distance(c,rc)<6;
        })) return false;
        return all.every(h => !blockedTerrain(window.getTerrainAt?.(h.q,h.r)?.name) && !window.tileObjects?.[key(h)]);
    }

    function findSite(desired, halfW=2, halfH=2, maxRadius=8) {
        if(canBuild(desired,halfW,halfH)) return desired;
        for(let radius=1; radius<=maxRadius; radius++) {
            for(let dq=-radius; dq<=radius; dq++) for(let dr=-radius; dr<=radius; dr++) {
                const h={q:desired.q+dq,r:desired.r+dr};
                if(distance(desired,h)!==radius) continue;
                if(canBuild(h,halfW,halfH)) return h;
            }
        }
        return null;
    }

    function nearestRoadDoor(ring, c) {
        const roads=[];
        for(const h of ring) {
            const near=(window.getNeighbors?.(h.q,h.r)||[]).some(n=>window.getTerrainAt?.(n.q,n.r)?.name==='Path');
            if(near) roads.push(h);
        }
        if(roads.length) return roads[0];
        const village=centre();
        return ring.reduce((best,h)=>distance(h,village)<distance(best,village)?h:best,ring[0]);
    }

    function connectDoor(door, maxSteps=7) {
        let cur={...door};
        for(let i=0;i<maxSteps;i++) {
            const ns=window.getNeighbors?.(cur.q,cur.r)||[];
            if(ns.some(n=>window.getTerrainAt?.(n.q,n.r)?.name==='Path')) return;
            const c=centre();
            const next=ns.filter(n=>!blockedTerrain(window.getTerrainAt?.(n.q,n.r)?.name))
                .sort((a,b)=>distance(a,c)-distance(b,c))[0];
            if(!next) return;
            window.setTerrainAt(next.q,next.r,'Path');
            cur=next;
        }
    }

    function addUpperFloor(entry, floors, ring, stair) {
        if(!window.multiStoryBuildings) return;
        const terrain={}, tileObjects={};
        ring.forEach(h=>terrain[key(h)]='Wall');
        floors.forEach(h=>terrain[key(h)]='Wood Floor');
        tileObjects[key(stair)]={type:'stair_down',toFloor:0};
        floors.filter(h=>key(h)!==key(stair)).filter((_,i)=>i%3===0).slice(0,5)
            .forEach(h=>tileObjects[key(h)]={type:'bed'});
        const b={
            minQ:Math.min(...ring.map(h=>h.q)),maxQ:Math.max(...ring.map(h=>h.q)),
            minR:Math.min(...ring.map(h=>h.r)),maxR:Math.max(...ring.map(h=>h.r)),
            floors:[],millbrookBuildingId:entry.id,
        };
        b.floors[1]={terrain,tileObjects};
        window.multiStoryBuildings.push(b);
        entry.multiStoryBuilding=b;
    }

    function carve(spec) {
        const halfW=spec.large?3:2, halfH=2;
        const site=findSite(spec.center,halfW,halfH,spec.searchRadius||8);
        if(!site) return null;
        const floors=floorHexes(site,halfW,halfH), ring=wallRing(floors);
        const door=nearestRoadDoor(ring,site);
        ring.forEach(h=>window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)]={type:'door_open',lightRadius:0};
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:0.3,doorHex:{...door},floorHexes:floors,
            wallHexes:ring.filter(h=>key(h)!==key(door)),floorType:'Wood Floor',
            center:{...site},millbrookBuildingId:spec.id,millbrookBuildingKind:spec.kind,
        };
        window.interiorRegions.push(region);
        const entry={...spec,center:{...site},door:{...door},region};
        const prop=floors.find(h=>!window.tileObjects[key(h)]);
        if(prop) {
            const type=spec.kind==='smithy'?'anvil':spec.kind==='barn'?'crate':spec.kind==='inn'?'table':spec.kind==='chapel'?'altar':'fireplace';
            window.tileObjects[key(prop)]={type,lightRadius:spec.kind==='cottage'?5:0};
        }
        if(spec.kind==='inn') {
            const stair=floors.find(h=>distance(h,door)>=2&&!window.tileObjects[key(h)]) || floors[Math.floor(floors.length/2)];
            window.tileObjects[key(stair)]={type:'stair_up',toFloor:1};
            addUpperFloor(entry,floors,ring,stair);
            entry.stair={...stair};
        }
        buildings.push(entry);
        connectDoor(door);
        return entry;
    }

    function paintGreen(c) {
        const green={q:c.q+5,r:c.r+6};
        for(let dq=-2;dq<=2;dq++) for(let dr=-2;dr<=2;dr++) {
            const h={q:green.q+dq,r:green.r+dr};
            if(distance(green,h)<=2 && !blockedTerrain(window.getTerrainAt?.(h.q,h.r)?.name)) window.setTerrainAt(h.q,h.r,'Path');
        }
        window.tileObjects[key(green)]={type:'well',lightRadius:0};
        window.tileObjects[key({q:green.q-2,r:green.r})]={type:'bench'};
        window.campaign2MillbrookGreenCenter={...green};
        return green;
    }

    function expand() {
        if(expanded || !centre() || !window.setTerrainAt || !window.interiorRegions) return false;
        const c=centre();
        buildings.length=0;
        const green=paintGreen(c);
        const specs=[
            ['home-1','cottage',-10,-8],['home-2','cottage',-3,-10],['home-3','cottage',6,-9],['home-4','cottage',12,-4],
            ['home-5','cottage',13,6],['home-6','cottage',8,13],['home-7','cottage',-2,14],['home-8','cottage',-11,10],
            ['inn','inn',15,14],['smithy','smithy',17,-11],['chapel','chapel',-15,-12],['barn','barn',-16,15],
        ];
        for(const [id,kind,q,r] of specs) carve({id:`millbrook-${id}`,kind,center:{q:c.q+q,r:c.r+r},large:['inn','barn'].includes(kind),searchRadius:10});

        // A maintained lane between Petra's existing house, the village green
        // and the through-road to Silverhart. Existing quest/NPC coordinates
        // remain untouched.
        let cur={...green};
        for(let i=0;i<10 && distance(cur,c)>1;i++) {
            const ns=(window.getNeighbors?.(cur.q,cur.r)||[]).filter(n=>!blockedTerrain(window.getTerrainAt?.(n.q,n.r)?.name));
            if(!ns.length) break;
            const next=ns.sort((a,b)=>distance(a,c)-distance(b,c))[0];
            window.setTerrainAt(next.q,next.r,'Path');cur=next;
        }

        window.campaign2MillbrookPopulationTarget=TARGET_POPULATION;
        window.SettlementScale?.register?.({id:'millbrook',name:'Millbrook',tier:'hamlet',centre:c,populationTarget:TARGET_POPULATION,radius:48});
        window.MillbrookSettlementRegistry={
            centre:{...c},green:{...green},buildings,
            populationTarget:TARGET_POPULATION,
            get dwellings(){return 1+buildings.filter(b=>b.kind==='cottage').length;},
            get publicBuildings(){return buildings.filter(b=>b.kind!=='cottage').length;},
            get multiStorey(){return buildings.filter(b=>!!b.multiStoryBuilding).length;},
        };
        expanded=true;
        return true;
    }

    function reset() {
        expanded=false;buildings.length=0;
        delete window.MillbrookSettlementRegistry;
        delete window.campaign2MillbrookGreenCenter;
    }

    function installWorldWrapper() {
        if(installed) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function') return false;
        if(original.__millbrookExpansion){installed=true;return true;}
        const wrapped=function(...args){
            reset();
            const result=original.apply(this,args);
            if(expand()) {
                window.connectAllRoadNetworks?.();
                window.reconcileRegionWallBookkeeping?.();
                window.reconcileAllRegionFootprints?.();
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.();window.renderEntities?.();
            }
            return result;
        };
        wrapped.__millbrookExpansion=true;wrapped.__original=original;
        window.setupVillageScene=wrapped;installed=true;return true;
    }

    function install(){installWorldWrapper();if(window.currentCampaign!=='2'||!centre())return false;if(!expanded)expand();return expanded;}

    window.MillbrookExpansion={install,expand,reset,installWorldWrapper,get buildings(){return buildings;},get stats(){return{installed,expanded,buildings:buildings.length,dwellings:window.MillbrookSettlementRegistry?.dwellings||0,publicBuildings:window.MillbrookSettlementRegistry?.publicBuildings||0,multiStorey:window.MillbrookSettlementRegistry?.multiStorey||0,populationTarget:TARGET_POPULATION};}};

    if(!installWorldWrapper()) {
        const t=setInterval(()=>{if(installWorldWrapper())clearInterval(t);},25);
        setTimeout(()=>clearInterval(t),5000);
    }
    window.__millbrookExpansionTimer=setInterval(install,BOOT_MS);
    install();
})();