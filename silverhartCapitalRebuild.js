// silverhartCapitalRebuild.js
// Completes Silverhart as a planned circular capital without replacing any of
// its existing authored content. The palace, merchants, embassies, noble
// houses, Warrens, thieves' guild, tunnels, NPCs and quest anchors are left in
// place; this module builds the missing roads/blocks around them as part of the
// deterministic Campaign 2 world build.
(() => {
    'use strict';

    const OUTER_RING_RADIUS = 50;
    const CITY_WALL_FALLBACK = 60;
    const BOOT_MS = 1200;
    const buildings = [];
    const avenues = [];
    const gates = [];
    let mapExpanded = false;
    let worldWrapperInstalled = false;

    const key = h => `${h.q},${h.r}`;
    const centre = () => window.campaign2PalaceThroneCenter || window.campaign2SilverhartCenter || null;

    function distance(a,b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    const DIRECTIONS = [
        {q:1,r:0,name:'east'}, {q:1,r:-1,name:'north-east'}, {q:0,r:-1,name:'north'},
        {q:-1,r:0,name:'west'}, {q:-1,r:1,name:'south-west'}, {q:0,r:1,name:'south'},
    ];

    function floorHexes(centerHex, halfW=2, halfH=2) {
        const out=[];
        for(let dq=-halfW+1;dq<=halfW-1;dq++) {
            const shift=-Math.floor(dq/2);
            for(let dr=-halfH+1;dr<=halfH-1;dr++) out.push({q:centerHex.q+dq,r:centerHex.r+dr+shift});
        }
        return out;
    }

    function wallRing(floors) {
        const f=new Set(floors.map(key)); const walls=new Map();
        for(const h of floors) for(const n of (window.getNeighbors?.(h.q,h.r)||[])) if(!f.has(key(n))) walls.set(key(n),n);
        return [...walls.values()];
    }

    function regionCentre(r) {
        return r?.center || r?.doorHex || (Number.isFinite(r?.minQ) ? {q:(r.minQ+r.maxQ)/2,r:(r.minR+r.maxR)/2}:null);
    }

    function regionTooClose(pos, radius=6) {
        return (window.interiorRegions||[]).some(r => {
            const c=regionCentre(r); return c && distance(pos,c)<radius;
        });
    }

    function canBuild(pos,halfW=2,halfH=2) {
        if(regionTooClose(pos,6)) return false;
        const floors=floorHexes(pos,halfW,halfH);
        const all=[...floors,...wallRing(floors)];
        return all.every(h => {
            const t=window.getTerrainAt?.(h.q,h.r)?.name;
            // Planned streets are sacred: buildings adapt to blocks, never
            // overwrite a ring road or avenue after it has been laid out.
            if(['Path','Water','Wall','Palisade Wall','Climbable Wall','Keep Wall','Stone Wall','Wood Floor','Cave Floor'].includes(t)) return false;
            return !window.tileObjects?.[key(h)];
        });
    }

    function nearestRoadDoor(ring, cityCentre) {
        return ring.reduce((best,h)=>distance(h,cityCentre)<distance(best,cityCentre)?h:best,ring[0]);
    }

    function buildUpperFloor(entry, groundFloors, ring, stair, floorNo=1) {
        if(!window.multiStoryBuildings) return;
        const terrain={}; const tileObjects={};
        ring.forEach(h=>terrain[key(h)]='Wall');
        groundFloors.forEach(h=>terrain[key(h)]='Wood Floor');
        tileObjects[key(stair)]={type:'stair_down',toFloor:floorNo-1};
        const usable=groundFloors.filter(h=>key(h)!==key(stair));
        if(entry.kind.includes('inn')||entry.kind.includes('tenement')||entry.kind.includes('residence')||entry.kind.includes('townhouse')||entry.kind.includes('manor')) {
            usable.filter((_,i)=>i%3===0).slice(0,6).forEach(h=>tileObjects[key(h)]={type:'bed'});
        } else {
            usable.filter((_,i)=>i%4===0).slice(0,4).forEach(h=>tileObjects[key(h)]={type:'crate'});
        }
        const building={
            minQ:Math.min(...ring.map(h=>h.q)),maxQ:Math.max(...ring.map(h=>h.q)),
            minR:Math.min(...ring.map(h=>h.r)),maxR:Math.max(...ring.map(h=>h.r)),floors:[],
            silverhartBuildingId:entry.id,
        };
        building.floors[floorNo]={terrain,tileObjects};
        window.multiStoryBuildings.push(building);
        entry.multiStoryBuilding=building;
    }

    function carveBuilding(spec) {
        const pos=spec.center;
        const halfW=spec.large?3:2,halfH=2;
        if(!canBuild(pos,halfW,halfH)) return null;
        const floors=floorHexes(pos,halfW,halfH),ring=wallRing(floors),c=centre();
        const door=nearestRoadDoor(ring,c);
        ring.forEach(h=>window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)]={type:'door_open',lightRadius:0};
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:spec.district==='warrens'?0.22:0.34,doorHex:{...door},floorHexes:floors,
            wallHexes:ring.filter(h=>key(h)!==key(door)),floorType:'Wood Floor',center:{...pos},
            silverhartBuildingId:spec.id,silverhartDistrict:spec.district,silverhartBuildingKind:spec.kind,
        };
        window.interiorRegions.push(region);
        const entry={...spec,door:{...door},region,floors:spec.floors||1};
        if((spec.floors||1)>1) {
            const stair=floors.find(h=>distance(h,door)>=2&&!window.tileObjects[key(h)]) || floors[Math.floor(floors.length/2)];
            window.tileObjects[key(stair)]={type:'stair_up',toFloor:1};
            buildUpperFloor(entry,floors,ring,stair,1);
            entry.stair={...stair};
        }
        const prop=floors.find(h=>!window.tileObjects[key(h)]&&(!entry.stair||key(h)!==key(entry.stair)));
        if(prop) {
            const type=spec.kind.includes('smith')?'anvil':spec.kind.includes('warehouse')?'crate':spec.kind.includes('inn')?'table':spec.kind.includes('shop')?'counter':'table';
            window.tileObjects[key(prop)]={type,lightRadius:0};
        }
        buildings.push(entry);
        return entry;
    }

    function paintRing(centerHex,radius) {
        const painted=[];
        for(let dq=-radius;dq<=radius;dq++) for(let dr=-radius;dr<=radius;dr++) {
            const h={q:centerHex.q+dq,r:centerHex.r+dr};
            if(distance(centerHex,h)!==radius) continue;
            const t=window.getTerrainAt?.(h.q,h.r)?.name;
            if(!['Wall','Palisade Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor'].includes(t)) {
                window.setTerrainAt(h.q,h.r,'Path'); painted.push(h);
            }
        }
        return painted;
    }

    function paintAvenues(centerHex,innerRadius,wallRadius) {
        avenues.length=0;gates.length=0;
        DIRECTIONS.forEach((dir,dirIndex)=>{
            const hexes=[];
            for(let d=innerRadius;d<=wallRadius+8;d++) {
                const h={q:centerHex.q+dir.q*d,r:centerHex.r+dir.r*d};
                const t=window.getTerrainAt?.(h.q,h.r)?.name;
                if(d===wallRadius) {
                    const lateral=DIRECTIONS[(dirIndex+2)%6];
                    for(let w=-1;w<=1;w++) {
                        const g={q:h.q+lateral.q*w,r:h.r+lateral.r*w};
                        window.setTerrainAt(g.q,g.r,'Path');
                        gates.push({direction:dir.name,hex:g});
                    }
                } else if(!['Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor','Palisade Wall'].includes(t)) {
                    window.setTerrainAt(h.q,h.r,'Path');hexes.push(h);
                }
            }
            avenues.push({id:`avenue:${dir.name}`,direction:dir.name,hexes});
        });
    }

    function connectDoorToRoad(door,maxSteps=8) {
        if(!door)return;
        let cur={...door};
        for(let i=0;i<maxSteps;i++) {
            const ns=window.getNeighbors?.(cur.q,cur.r)||[]; if(!ns.length)break;
            const path=ns.find(h=>window.getTerrainAt?.(h.q,h.r)?.name==='Path');
            if(path)return;
            const next=ns.reduce((best,h)=>{
                const score=x=>{
                    const t=window.getTerrainAt?.(x.q,x.r)?.name;
                    const blocked=['Wall','Palisade Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor'].includes(t);
                    return (blocked?10000:0)+Math.abs(distance(centre(),x)-OUTER_RING_RADIUS)*2;
                };
                return score(h)<score(best)?h:best;
            },ns[0]);
            const t=window.getTerrainAt?.(next.q,next.r)?.name;
            if(!['Wall','Palisade Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor'].includes(t))window.setTerrainAt(next.q,next.r,'Path');
            cur=next;
        }
    }

    function spec(id,district,kind,q,r,floors=2,large=false){
        const c=centre();return{id,district,kind,center:{q:c.q+q,r:c.r+r},floors,large};
    }

    function candidateSpecs() {
        const out=[];let n=0;const add=(district,kind,positions,floors=2,large=false)=>positions.forEach(([q,r])=>out.push(spec(`silverhart-${district}-${kind}-${++n}`,district,kind,q,r,floors,large)));
        // All offsets below are axial-hex distances safely inside radius 60.
        // They sit between radial avenues rather than on them.
        add('merchant','shop',[[-34,4],[-38,8],[-42,12],[-34,16],[-45,20],[-36,26]],2);
        add('merchant','warehouse',[[-47,24],[-42,29]],2,true);
        add('merchant','golden-stag-inn',[[-34,28]],3,true);

        add('wealthy','townhouse',[[34,-4],[38,-8],[42,-12],[34,-16],[45,-20],[36,-26],[47,-24],[41,-30]],3);
        add('wealthy','manor',[[28,-36],[33,-34]],2,true);

        add('civic','guildhall',[[8,-39],[18,-42]],2,true);
        add('civic','watch-hq',[[-8,-38]],2,true);
        add('civic','court',[[13,-36]],2,true);
        add('civic','scribes-hall',[[23,-38]],2);

        add('commons','tenement',[[-28,39],[-20,43],[-10,45],[12,34],[23,31],[32,20],[-35,-8],[25,-35]],3);
        add('commons','workshop',[[-39,31],[-29,41],[29,23],[38,10]],2);
        add('commons','market-inn',[[-8,40]],2,true);

        add('diplomatic','diplomatic-townhouse',[[-18,43],[-28,45]],2);
        add('diplomatic','envoys-rest-inn',[[-4,44]],3,true);
        add('diplomatic','translator-office',[[-34,42]],2);
        return out;
    }

    function addWarrensInfill(c) {
        const w=window.campaign2ThievesGuildCenter||{q:c.q+6,r:c.r+(window.campaign2SilverhartCityWallRadius||60)+10};
        const offsets=[[-14,-3],[-10,7],[-5,10],[7,9],[12,4],[15,-5],[-17,8],[17,8]];
        const kinds=['cheap-tenement','pawn-shop','gambling-den','cheap-tenement','broken-cask-inn','cheap-tenement','fence-front','cheap-tenement'];
        offsets.forEach((o,i)=>{
            const b=carveBuilding({id:`silverhart-warrens-infill-${i+1}`,district:'warrens',kind:kinds[i],center:{q:w.q+o[0],r:w.r+o[1]},floors:kinds[i].includes('inn')?2:1});
            if(b)connectDoorToRoad(b.door,5);
        });
        offsets.forEach(o=>{
            const target={q:w.q+o[0],r:w.r+o[1]}; let cur={...w};
            for(let i=0;i<18&&distance(cur,target)>1;i++) {
                const ns=window.getNeighbors?.(cur.q,cur.r)||[];if(!ns.length)break;
                const next=ns.reduce((best,h)=>distance(h,target)<distance(best,target)?h:best,ns[0]);
                const t=window.getTerrainAt?.(next.q,next.r)?.name;
                if(!['Wall','Palisade Wall','Keep Wall','Stone Wall','Water','Wood Floor','Cave Floor'].includes(t))window.setTerrainAt(next.q,next.r,'Path');
                cur=next;
            }
        });
    }

    function exposeDistricts(c) {
        window.campaign2MerchantQuarterCenter={q:c.q-38,r:c.r+14};
        window.campaign2WealthyQuarterCenter={q:c.q+38,r:c.r-14};
        window.campaign2CivicQuarterCenter={q:c.q+10,r:c.r-40};
        window.campaign2CommonsCenter={q:c.q-8,r:c.r+40};
        window.campaign2DiplomaticPlazaCenter=window.campaign2DiplomaticPlazaCenter||{q:c.q-12,r:c.r+48};
        const s=window.SettlementScale?.get?.('silverhart');
        if(s)s.districts=[
            {id:'palace',name:'Palace & Inner Court',centre:{...c},radius:29},
            {id:'merchant',name:'Merchant Quarter',centre:{...window.campaign2MerchantQuarterCenter},radius:25},
            {id:'wealthy',name:'Wealthy Quarter',centre:{...window.campaign2WealthyQuarterCenter},radius:25},
            {id:'civic',name:'Civic Quarter',centre:{...window.campaign2CivicQuarterCenter},radius:26},
            {id:'diplomatic',name:'Diplomatic Quarter',centre:{...window.campaign2DiplomaticPlazaCenter},radius:30},
            {id:'commons',name:'Commons',centre:{...window.campaign2CommonsCenter},radius:31},
            ...(window.campaign2ThievesGuildCenter?[{id:'warrens',name:'Warrens',centre:{...window.campaign2ThievesGuildCenter},radius:28}]:[]),
        ];
    }

    function expandCapital() {
        if(mapExpanded||!window.interiorRegions||!window.setTerrainAt||!window.getNeighbors)return false;
        const c=centre();if(!c)return false;
        buildings.length=0;avenues.length=0;gates.length=0;
        const inner=Number(window.campaign2SilverhartRingRoadRadius||30);
        const wall=Number(window.campaign2SilverhartCityWallRadius||CITY_WALL_FALLBACK);
        paintRing(c,inner);paintRing(c,OUTER_RING_RADIUS);paintAvenues(c,inner,wall);exposeDistricts(c);
        for(const s of candidateSpecs()) {const b=carveBuilding(s);if(b)connectDoorToRoad(b.door,8);}
        addWarrensInfill(c);
        window.campaign2SilverhartOuterRingRadius=OUTER_RING_RADIUS;
        window.SilverhartCapitalRegistry={
            buildings,avenues,gates,centre:{...c},innerRingRadius:inner,outerRingRadius:OUTER_RING_RADIUS,cityWallRadius:wall,
            get multiStoreyCount(){return buildings.filter(b=>b.floors>1).length;},
            get districtCounts(){return buildings.reduce((m,b)=>(m[b.district]=(m[b.district]||0)+1,m),{});},
        };
        mapExpanded=true;return true;
    }

    function resetWorldBuildState() {
        mapExpanded=false;buildings.length=0;avenues.length=0;gates.length=0;
        delete window.SilverhartCapitalRegistry;delete window.campaign2SilverhartOuterRingRadius;
    }

    function installWorldBuildWrapper() {
        if(worldWrapperInstalled)return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function')return false;
        if(original.__silverhartCapitalRebuild){worldWrapperInstalled=true;return true;}
        const wrapped=function(...args){
            resetWorldBuildState();const result=original.apply(this,args);
            if(expandCapital()) {
                window.connectAllRoadNetworks?.();window.reconcileRegionWallBookkeeping?.();window.reconcileAllRegionFootprints?.();
                window._campaign2TerrainBaseline={...window.overrideTerrain};window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.();window.renderEntities?.();
            }
            return result;
        };
        wrapped.__silverhartCapitalRebuild=true;wrapped.__original=original;window.setupVillageScene=wrapped;worldWrapperInstalled=true;return true;
    }

    function install(){installWorldBuildWrapper();if(window.currentCampaign!=='2'||!centre())return false;if(!mapExpanded)expandCapital();return mapExpanded;}

    window.SilverhartCapitalRebuild={
        install,expandCapital,resetWorldBuildState,installWorldBuildWrapper,
        get buildings(){return buildings;},get avenues(){return avenues;},get gates(){return gates;},
        get stats(){return{mapExpanded,buildings:buildings.length,multiStorey:buildings.filter(b=>b.floors>1).length,avenues:avenues.length,gates:gates.length,districtCounts:window.SilverhartCapitalRegistry?.districtCounts||{}};},
    };

    if(!installWorldBuildWrapper()){
        const t=setInterval(()=>{if(installWorldBuildWrapper())clearInterval(t);},25);setTimeout(()=>clearInterval(t),5000);
    }
    window.__silverhartCapitalRebuildTimer=setInterval(install,BOOT_MS);install();
})();