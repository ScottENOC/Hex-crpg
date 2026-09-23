// silverhartCapitalCompletion.js
// Deterministic completion pass for the capital rebuild. The primary layout
// deliberately refuses to overwrite authored interiors, so an old townhouse
// or palace wall may intersect the ideal mathematical ring. This pass routes
// the street locally around those obstacles and searches nearby free blocks for
// required urban uses (especially ordinary inns) instead of deleting/moving
// legacy quest content.
(() => {
    'use strict';

    const BLOCKED_TERRAIN = new Set(['Wall','Palisade Wall','Climbable Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor','Path']);
    const ROAD_BLOCKERS = new Set(['Wall','Palisade Wall','Climbable Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor']);
    const key = h => `${h.q},${h.r}`;
    let wrapperInstalled = false;

    function centre() {
        return window.campaign2PalaceThroneCenter || window.campaign2SilverhartCenter || null;
    }

    function distance(a,b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function floorHexes(centerHex, halfW=2, halfH=2) {
        const out=[];
        for(let dq=-halfW+1;dq<=halfW-1;dq++) {
            const shift=-Math.floor(dq/2);
            for(let dr=-halfH+1;dr<=halfH-1;dr++) out.push({q:centerHex.q+dq,r:centerHex.r+dr+shift});
        }
        return out;
    }

    function wallRing(floors) {
        const f=new Set(floors.map(key));
        const walls=new Map();
        for(const h of floors) for(const n of (window.getNeighbors?.(h.q,h.r)||[])) if(!f.has(key(n))) walls.set(key(n),n);
        return [...walls.values()];
    }

    function regionCentre(r) {
        return r?.center || r?.doorHex || (Number.isFinite(r?.minQ) ? {q:(r.minQ+r.maxQ)/2,r:(r.minR+r.maxR)/2}:null);
    }

    function canBuild(pos,halfW=2,halfH=2,{insideWall=true}={}) {
        const c=centre();
        const wall=Number(window.campaign2SilverhartCityWallRadius||60);
        if(insideWall && c && distance(c,pos)>wall-6) return false;
        if((window.interiorRegions||[]).some(r=>{const rc=regionCentre(r);return rc&&distance(pos,rc)<6;})) return false;
        const floors=floorHexes(pos,halfW,halfH);
        return [...floors,...wallRing(floors)].every(h=>{
            const terrain=window.getTerrainAt?.(h.q,h.r)?.name;
            return !BLOCKED_TERRAIN.has(terrain) && !window.tileObjects?.[key(h)];
        });
    }

    function siteNear(target,halfW=2,halfH=2,maxRadius=18) {
        if(canBuild(target,halfW,halfH)) return {...target};
        for(let radius=1;radius<=maxRadius;radius++) {
            for(let dq=-radius;dq<=radius;dq++) {
                for(let dr=-radius;dr<=radius;dr++) {
                    const h={q:target.q+dq,r:target.r+dr};
                    if(distance(target,h)!==radius) continue;
                    if(canBuild(h,halfW,halfH)) return h;
                }
            }
        }
        return null;
    }

    function nearestRoadDoor(ring) {
        const paths=ring.filter(h=>(window.getNeighbors?.(h.q,h.r)||[]).some(n=>window.getTerrainAt?.(n.q,n.r)?.name==='Path'));
        if(paths.length) return paths[0];
        const c=centre();
        return ring.reduce((best,h)=>distance(h,c)<distance(best,c)?h:best,ring[0]);
    }

    function connectDoor(door,maxSteps=12) {
        if(!door)return;
        let cur={...door};
        for(let i=0;i<maxSteps;i++) {
            const ns=window.getNeighbors?.(cur.q,cur.r)||[];
            if(ns.some(h=>window.getTerrainAt?.(h.q,h.r)?.name==='Path')) return;
            const viable=ns.filter(h=>!ROAD_BLOCKERS.has(window.getTerrainAt?.(h.q,h.r)?.name));
            if(!viable.length)return;
            const next=viable.reduce((best,h)=>distance(h,centre())<distance(best,centre())?h:best,viable[0]);
            if(window.getTerrainAt?.(next.q,next.r)?.name!=='Path') window.setTerrainAt(next.q,next.r,'Path');
            cur=next;
        }
    }

    function carve(spec) {
        const halfW=spec.large?3:2,halfH=2;
        const pos=siteNear(spec.center,halfW,halfH,spec.searchRadius||18);
        if(!pos)return null;
        const floors=floorHexes(pos,halfW,halfH),ring=wallRing(floors),door=nearestRoadDoor(ring);
        ring.forEach(h=>window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)]={type:'door_open',lightRadius:0};
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:0.34,doorHex:{...door},floorHexes:floors,wallHexes:ring.filter(h=>key(h)!==key(door)),
            floorType:'Wood Floor',center:{...pos},silverhartBuildingId:spec.id,
            silverhartDistrict:spec.district,silverhartBuildingKind:spec.kind,
        };
        window.interiorRegions.push(region);
        const entry={...spec,center:{...pos},door:{...door},region,floors:spec.floors||2};
        if(entry.floors>1 && window.multiStoryBuildings) {
            const stair=floors.find(h=>distance(h,door)>=2&&!window.tileObjects[key(h)])||floors[Math.floor(floors.length/2)];
            window.tileObjects[key(stair)]={type:'stair_up',toFloor:1};
            const terrain={},tileObjects={};
            ring.forEach(h=>terrain[key(h)]='Wall');floors.forEach(h=>terrain[key(h)]='Wood Floor');
            tileObjects[key(stair)]={type:'stair_down',toFloor:0};
            const usable=floors.filter(h=>key(h)!==key(stair));
            if(entry.kind.includes('inn')) usable.filter((_,i)=>i%2===0).slice(0,6).forEach(h=>tileObjects[key(h)]={type:'bed'});
            else usable.filter((_,i)=>i%3===0).slice(0,5).forEach(h=>tileObjects[key(h)]={type:'bed'});
            const building={minQ:Math.min(...ring.map(h=>h.q)),maxQ:Math.max(...ring.map(h=>h.q)),minR:Math.min(...ring.map(h=>h.r)),maxR:Math.max(...ring.map(h=>h.r)),floors:[],silverhartBuildingId:entry.id};
            building.floors[1]={terrain,tileObjects};window.multiStoryBuildings.push(building);
            entry.multiStoryBuilding=building;entry.stair={...stair};
        }
        const prop=floors.find(h=>!window.tileObjects[key(h)]);
        if(prop)window.tileObjects[key(prop)]={type:entry.kind.includes('inn')?'table':'crate',lightRadius:0};
        window.SilverhartCapitalRegistry.buildings.push(entry);
        connectDoor(door);
        return entry;
    }

    function ringCells(c,radius) {
        const out=[];
        for(let dq=-radius;dq<=radius;dq++) for(let dr=-radius;dr<=radius;dr++) {
            const h={q:c.q+dq,r:c.r+dr};if(distance(c,h)===radius)out.push(h);
        }
        return out;
    }

    function completeRing(c,radius) {
        const cells=ringCells(c,radius),blocked=[],detours=[];
        for(const h of cells) {
            const terrain=window.getTerrainAt?.(h.q,h.r)?.name;
            if(terrain==='Path')continue;
            if(!ROAD_BLOCKERS.has(terrain)) {window.setTerrainAt(h.q,h.r,'Path');continue;}
            blocked.push({...h});
            const around=(window.getNeighbors?.(h.q,h.r)||[]).filter(n=>{
                const t=window.getTerrainAt?.(n.q,n.r)?.name;
                const radial=distance(c,n);
                return radial>=radius-1&&radial<=radius+1&&!ROAD_BLOCKERS.has(t);
            });
            around.forEach(n=>{window.setTerrainAt(n.q,n.r,'Path');detours.push({...n});});
        }
        const pathCount=cells.filter(h=>window.getTerrainAt?.(h.q,h.r)?.name==='Path').length;
        return {radius,total:cells.length,pathCount,blocked,detours};
    }

    function ensureRequiredBuildings(c) {
        const registry=window.SilverhartCapitalRegistry;
        if(!registry)return;
        const existingInns=()=>registry.buildings.filter(b=>String(b.kind||'').includes('inn'));
        const innSpecs=[
            {id:'silverhart-completion-crown-and-lantern-inn',district:'commons',kind:'crown-and-lantern-inn',center:{q:c.q+18,r:c.r+20},floors:2,large:true,searchRadius:24},
            {id:'silverhart-completion-blue-heron-inn',district:'merchant',kind:'blue-heron-inn',center:{q:c.q-24,r:c.r+12},floors:3,large:true,searchRadius:24},
        ];
        for(const s of innSpecs) {
            if(existingInns().length>=2)break;
            if(!registry.buildings.some(b=>b.id===s.id))carve(s);
        }
        const fallback=[
            ['merchant',-20,30],['wealthy',28,-14],['civic',5,-32],['commons',20,26],['merchant',-30,18],['wealthy',24,-26],['commons',-18,32],['civic',18,-30]
        ];
        let i=0;
        while(registry.buildings.length<18&&i<fallback.length) {
            const [district,q,r]=fallback[i++];
            carve({id:`silverhart-completion-infill-${i}`,district,kind:district==='wealthy'?'townhouse':'tenement',center:{q:c.q+q,r:c.r+r},floors:2,searchRadius:22});
        }
    }

    function completeLayout() {
        const registry=window.SilverhartCapitalRegistry,c=centre();
        if(!registry||!c)return false;
        registry.ringDiagnostics={
            inner:completeRing(c,registry.innerRingRadius),
            outer:completeRing(c,registry.outerRingRadius),
        };
        ensureRequiredBuildings(c);
        window.reconcileRegionWallBookkeeping?.();window.reconcileAllRegionFootprints?.();window.connectAllRoadNetworks?.();
        return true;
    }

    function installWrapper() {
        if(wrapperInstalled)return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function'||!original.__silverhartCapitalRebuild)return false;
        if(original.__silverhartCapitalCompletion){wrapperInstalled=true;return true;}
        const wrapped=function(...args){
            const result=original.apply(this,args);
            if(completeLayout()) {
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.();window.renderEntities?.();
            }
            return result;
        };
        wrapped.__silverhartCapitalCompletion=true;wrapped.__silverhartCapitalRebuild=true;wrapped.__original=original;
        window.setupVillageScene=wrapped;wrapperInstalled=true;return true;
    }

    window.SilverhartCapitalCompletion={completeLayout,installWrapper};
    const timer=setInterval(()=>{
        if(installWrapper()) {
            if(window.currentCampaign==='2')completeLayout();
            clearInterval(timer);
        }
    },25);
    setTimeout(()=>clearInterval(timer),5000);
})();