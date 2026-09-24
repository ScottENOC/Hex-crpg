// reddaleTownExpansion.js
// Expands Reddale from five quest/economy buildings into the physical town its
// existing role implies. The guardhouse, Reeve, inn, Ironbond guildhouse and
// Baron's manor remain the political/economic anchors; ordinary commerce and
// housing fill the space between them without moving quest evidence.
(() => {
    'use strict';
    const TARGET_POPULATION=220;
    let installed=false, expanded=false;
    const buildings=[];
    const key=h=>`${h.q},${h.r}`;
    const centre=()=>window.campaign2ReddaleGuardhouseCenter||null;
    const distance=(a,b)=>typeof window.distance==='function'?window.distance(a,b):Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));

    function floorHexes(c,halfW=2,halfH=2){
        const out=[];
        for(let dq=-halfW+1;dq<=halfW-1;dq++){
            const shift=-Math.floor(dq/2);
            for(let dr=-halfH+1;dr<=halfH-1;dr++)out.push({q:c.q+dq,r:c.r+dr+shift});
        }
        return out;
    }
    function wallRing(floors){
        const set=new Set(floors.map(key)), walls=new Map();
        for(const h of floors)for(const n of(window.getNeighbors?.(h.q,h.r)||[]))if(!set.has(key(n)))walls.set(key(n),n);
        return [...walls.values()];
    }
    function blocked(name){return ['Path','Water','Wall','Palisade Wall','Keep Wall','Stone Wall','Wood Floor','Cave Floor','Climbable Wall'].includes(name);}
    function canBuild(c,w=2,h=2){
        const floors=floorHexes(c,w,h), ring=wallRing(floors), all=[...floors,...ring];
        if((window.interiorRegions||[]).some(r=>{
            const rc=r.center||r.doorHex||(Number.isFinite(r.minQ)?{q:(r.minQ+r.maxQ)/2,r:(r.minR+r.maxR)/2}:null);
            return rc&&distance(c,rc)<6;
        }))return false;
        return all.every(x=>!blocked(window.getTerrainAt?.(x.q,x.r)?.name)&&!window.tileObjects?.[key(x)]);
    }
    function findSite(desired,w=2,h=2,max=14){
        if(canBuild(desired,w,h))return desired;
        for(let rad=1;rad<=max;rad++)for(let dq=-rad;dq<=rad;dq++)for(let dr=-rad;dr<=rad;dr++){
            const p={q:desired.q+dq,r:desired.r+dr};
            if(distance(desired,p)===rad&&canBuild(p,w,h))return p;
        }
        return null;
    }
    function nearestDoor(ring,target){return ring.slice().sort((a,b)=>distance(a,target)-distance(b,target))[0];}
    function connect(from,to,max=16){
        let cur={...from};
        for(let i=0;i<max&&distance(cur,to)>1;i++){
            const ns=(window.getNeighbors?.(cur.q,cur.r)||[]).filter(n=>{
                const t=window.getTerrainAt?.(n.q,n.r)?.name;
                return !['Water','Wall','Keep Wall','Palisade Wall','Climbable Wall'].includes(t);
            });
            if(!ns.length)break;
            const next=ns.sort((a,b)=>distance(a,to)-distance(b,to))[0];
            if(!window.tileObjects?.[key(next)])window.setTerrainAt(next.q,next.r,'Path');
            cur=next;
        }
    }
    function carve(id,kind,desired,w=2,h=2){
        const c=findSite(desired,w,h);if(!c)return null;
        const floors=floorHexes(c,w,h),ring=wallRing(floors),door=nearestDoor(ring,centre());
        ring.forEach(x=>window.setTerrainAt(x.q,x.r,'Wall'));
        floors.forEach(x=>window.setTerrainAt(x.q,x.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)]={type:'door_open',lightRadius:0};
        const region={minQ:Math.min(...floors.map(x=>x.q)),maxQ:Math.max(...floors.map(x=>x.q)),minR:Math.min(...floors.map(x=>x.r)),maxR:Math.max(...floors.map(x=>x.r)),floorHexes:floors,wallHexes:ring.filter(x=>key(x)!==key(door)),floorType:'Wood Floor',doorHex:{...door},lightMult:.35,center:{...c},reddaleBuildingId:id,reddaleBuildingKind:kind};
        window.interiorRegions.push(region);
        const entry={id,kind,center:{...c},door:{...door},region};buildings.push(entry);connect(door,centre());
        return entry;
    }
    function prop(entry,type,offset={q:0,r:0},extra={}){if(entry)window.tileObjects[key({q:entry.center.q+offset.q,r:entry.center.r+offset.r})]={type,...extra};}
    function addNpc(name,title,entry,offset=[0,1]){
        if(!entry||typeof window.buildNPC!=='function'||window.entities.some(e=>e.name===name))return;
        const npc=window.buildNPC({name,title,race:'human',gender:name.charCodeAt(0)%2?'male':'female',hex:{q:entry.center.q+offset[0],r:entry.center.r+offset[1]},side:'neutral',factionId:'silverhart_kingdom',color:'#8b7865',dialogueId:'reddale_resident'});
        npc.homeSettlementId='reddale';npc.occupation=title;window.entities.push(npc);
    }
    function paintMarket(anchor){
        const desired={q:anchor.q-8,r:anchor.r+8};
        let c=desired;
        for(let rad=0;rad<=10;rad++){
            const candidates=rad===0?[desired]:[];
            if(rad)for(let dq=-rad;dq<=rad;dq++)for(let dr=-rad;dr<=rad;dr++){const p={q:desired.q+dq,r:desired.r+dr};if(distance(desired,p)===rad)candidates.push(p);}
            const found=candidates.find(p=>{
                for(let dq=-3;dq<=3;dq++)for(let dr=-3;dr<=3;dr++){const h={q:p.q+dq,r:p.r+dr};if(distance(p,h)<=3&&(blocked(window.getTerrainAt(h.q,h.r)?.name)||window.tileObjects[key(h)]))return false;}return true;
            });
            if(found){c=found;break;}
        }
        for(let dq=-3;dq<=3;dq++)for(let dr=-3;dr<=3;dr++){const h={q:c.q+dq,r:c.r+dr};if(distance(c,h)<=3)window.setTerrainAt(h.q,h.r,'Path');}
        window.tileObjects[key(c)]={type:'well',lightRadius:0};
        window.tileObjects[key({q:c.q-2,r:c.r})]={type:'crate'};
        window.tileObjects[key({q:c.q+2,r:c.r})]={type:'table'};
        connect(c,anchor,20);
        window.campaign2ReddaleMarketCenter={...c};
        return c;
    }
    function expand(){
        if(expanded)return true;const a=centre();if(!a||!window.setTerrainAt)return false;
        buildings.length=0;const market=paintMarket(a);
        const specs=[
            ['warehouse-north','warehouse',{q:a.q-16,r:a.r+3},3,2],['warehouse-south','warehouse',{q:a.q-16,r:a.r+14},3,2],
            ['smithy','smithy',{q:a.q-5,r:a.r+19},3,2],['cooper','workshop',{q:a.q-12,r:a.r-9},2,2],
            ['home-1','house',{q:a.q-18,r:a.r-7},2,2],['home-2','house',{q:a.q-10,r:a.r-15},2,2],
            ['home-3','house',{q:a.q+1,r:a.r-16},2,2],['home-4','house',{q:a.q+10,r:a.r-12},2,2],
            ['home-5','house',{q:a.q-20,r:a.r+22},2,2],['chapel','chapel',{q:a.q+15,r:a.r-10},3,2],
        ];
        const entries={};for(const [id,kind,p,w,h] of specs)entries[id]=carve(`reddale-${id}`,kind,p,w,h);
        prop(entries['warehouse-north'],'crate');prop(entries['warehouse-south'],'storage_chest',{q:0,r:0},{items:[]});
        prop(entries.smithy,'anvil');prop(entries.cooper,'table');prop(entries.chapel,'throne');
        for(const id of ['home-1','home-2','home-3','home-4','home-5'])prop(entries[id],'bed');
        addNpc('Mara Fenlock','Market Broker',entries['warehouse-north']);
        addNpc('Tobren Soot','Town Smith',entries.smithy);
        addNpc('Elsa Reed','Cooper',entries.cooper);
        addNpc('Father Henn','Road Chapel Keeper',entries.chapel);
        addNpc('Pella North','Warehouse Clerk',entries['warehouse-south']);
        addNpc('Jem Vale','Cartwright',entries['home-4']);
        addNpc('Rinna Hale','Seamstress',entries['home-2']);
        const districts=[
            {id:'watch-quarter',name:'Watch Quarter',centre:window.campaign2ReddaleGuardhouseCenter||a,radius:14},
            {id:'market',name:'Market Square',centre:market,radius:16},
            {id:'ironbond',name:'Ironbond Quarter',centre:window.campaign2ReddaleGuildhouseCenter||a,radius:15},
            {id:'manor',name:"Baron's Quarter",centre:window.campaign2ReddaleManorCenter||window.campaign2ReddaleReeveHouseCenter||a,radius:15},
            {id:'residential',name:'Reddale Lanes',centre:entries['home-2']?.center||a,radius:22},
        ];
        window.SettlementScale?.register?.({id:'reddale',name:'Reddale',tier:'town',centre:a,populationTarget:TARGET_POPULATION,radius:72,districts});
        window.ReddaleSettlementRegistry={centre:{...a},market,populationTarget:TARGET_POPULATION,districts,buildings,existingAnchors:{guardhouse:window.campaign2ReddaleGuardhouseCenter,reeve:window.campaign2ReddaleReeveHouseCenter,inn:window.campaign2ReddaleInnCenter,guildhouse:window.campaign2ReddaleGuildhouseCenter,manor:window.campaign2ReddaleManorCenter}};
        expanded=true;return true;
    }
    function reset(){expanded=false;buildings.length=0;delete window.ReddaleSettlementRegistry;delete window.campaign2ReddaleMarketCenter;}
    function installWorldWrapper(){if(installed)return true;const original=window.setupVillageScene;if(typeof original!=='function')return false;if(original.__reddaleTownExpansion){installed=true;return true;}const wrapped=function(...args){reset();const result=original.apply(this,args);if(expand()){window.connectAllRoadNetworks?.();window.reconcileRegionWallBookkeeping?.();window.reconcileAllRegionFootprints?.();window._campaign2TerrainBaseline={...window.overrideTerrain};window._campaign2TileObjectsBaseline={...window.tileObjects};window.drawMap?.();window.renderEntities?.();}return result;};wrapped.__reddaleTownExpansion=true;wrapped.__original=original;window.setupVillageScene=wrapped;installed=true;return true;}
    function install(){installWorldWrapper();if(window.currentCampaign!=='2'||!centre())return false;if(!expanded)expand();return expanded;}
    window.ReddaleTownExpansion={install,expand,reset,get buildings(){return buildings;},get stats(){return{installed,expanded,buildings:buildings.length,populationTarget:TARGET_POPULATION};}};
    if(!install()){const timer=setInterval(()=>{if(install())clearInterval(timer);},100);setTimeout(()=>clearInterval(timer),5000);}
})();