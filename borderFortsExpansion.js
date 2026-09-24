// borderFortsExpansion.js
// Expands the two Silverhart border forts as military settlements rather than
// generic towns. Northwatch is the active front: crowded, improvised and under
// pressure. Ridgehold is the reserve front: permanent stores, workshops,
// training space and military households behind a quieter defensive line.
(() => {
    'use strict';

    let installed = false;
    let expanded = false;
    const sites = [];
    const key = h => `${h.q},${h.r}`;
    const dist = (a,b) => typeof window.distance === 'function'
        ? window.distance(a,b)
        : Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));

    function floorHexes(c, halfW=2, halfH=2) {
        const out=[];
        for(let dq=-halfW+1;dq<=halfW-1;dq++) {
            const shift=-Math.floor(dq/2);
            for(let dr=-halfH+1;dr<=halfH-1;dr++) out.push({q:c.q+dq,r:c.r+dr+shift});
        }
        return out;
    }

    function wallRing(floors) {
        const set=new Set(floors.map(key));
        const walls=new Map();
        for(const h of floors) for(const n of (window.getNeighbors?.(h.q,h.r)||[])) {
            if(!set.has(key(n))) walls.set(key(n),n);
        }
        return [...walls.values()];
    }

    function carveBuilding(id,c,kind,halfW=2,halfH=2,wall='Wall') {
        const floors=floorHexes(c,halfW,halfH), walls=wallRing(floors);
        const outward = walls.slice().sort((a,b)=>dist(b,c)-dist(a,c))[0];
        walls.forEach(h=>window.setTerrainAt(h.q,h.r,wall));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,'Wood Floor'));
        if(outward) {
            window.setTerrainAt(outward.q,outward.r,'Wood Floor');
            window.tileObjects[key(outward)]={type:'door_open',lightRadius:0};
        }
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            floorHexes:floors,wallHexes:walls.filter(h=>!outward||key(h)!==key(outward)),
            floorType:'Wood Floor',doorHex:outward?{...outward}:null,lightMult:0.35,
            center:{...c},borderFortBuildingId:id,borderFortKind:kind,
        };
        window.interiorRegions?.push(region);
        sites.push({id,kind,center:{...c},region});
        return region;
    }

    function pathLine(from,to,type='Dirt') {
        let cur={...from}, guard=0;
        while((cur.q!==to.q||cur.r!==to.r)&&guard++<100) {
            if(!window.tileObjects?.[key(cur)]) window.setTerrainAt(cur.q,cur.r,type);
            const ns=window.getNeighbors?.(cur.q,cur.r)||[];
            if(!ns.length) break;
            cur=ns.slice().sort((a,b)=>dist(a,to)-dist(b,to))[0];
        }
        if(!window.tileObjects?.[key(to)]) window.setTerrainAt(to.q,to.r,type);
    }

    function addNpc(name,title,c,offset,faction='silverhart_kingdom') {
        if(typeof window.buildNPC!=='function' || window.entities?.some(e=>e.name===name)) return null;
        const npc=window.buildNPC({
            name,title,race:'human',gender:(name.charCodeAt(0)%2?'male':'female'),
            hex:{q:c.q+offset[0],r:c.r+offset[1]},side:'neutral',factionId:faction,
            color:'#8a7f70',dialogueId:'border_fort_resident'
        });
        npc.homeSettlementId = dist(c,window.campaign2NorthwatchCenter||c) < 3 ? 'northwatch' : 'ridgehold';
        npc.occupation=title;
        window.entities.push(npc);
        return npc;
    }

    function paintYard(c,radius,terrain='Dirt') {
        for(let dq=-radius;dq<=radius;dq++) for(let dr=-radius;dr<=radius;dr++) {
            const h={q:c.q+dq,r:c.r+dr};
            if(dist(c,h)<=radius && !window.tileObjects?.[key(h)]) window.setTerrainAt(h.q,h.r,terrain);
        }
    }

    function expandNorthwatch(c) {
        // Active front: the existing star fort remains the hard core. The
        // support settlement hugs its safer rear side and looks temporary,
        // crowded and practical rather than ceremonially planned.
        const infirmary={q:c.q-14,r:c.r+13};
        const quartermaster={q:c.q-6,r:c.r+17};
        const stable={q:c.q+7,r:c.r+17};
        const followers={q:c.q+16,r:c.r+12};
        const cookyard={q:c.q,r:c.r+14};
        paintYard(cookyard,5,'Dirt');
        const inf=carveBuilding('northwatch-infirmary',infirmary,'infirmary',3,2);
        const qm=carveBuilding('northwatch-quartermaster',quartermaster,'stores',3,2);
        const st=carveBuilding('northwatch-stable',stable,'stable',3,2,'Palisade Wall');
        const fol=carveBuilding('northwatch-followers',followers,'camp-followers',3,2);
        [inf,qm,st,fol].forEach(r=>{ if(r?.doorHex) pathLine(r.doorHex,cookyard,'Dirt'); });
        window.tileObjects[key(cookyard)]={type:'fireplace',lightRadius:6};
        window.tileObjects[key({q:cookyard.q-2,r:cookyard.r})]={type:'crate'};
        window.tileObjects[key({q:cookyard.q+2,r:cookyard.r})]={type:'bench'};
        window.tileObjects[key({q:stable.q,r:stable.r})]={type:'crate'};
        window.tileObjects[key({q:infirmary.q-1,r:infirmary.r})]={type:'bed'};
        window.tileObjects[key({q:infirmary.q+1,r:infirmary.r})]={type:'bed'};
        window.tileObjects[key({q:quartermaster.q,r:quartermaster.r})]={type:'storage_chest',items:[]};

        addNpc('Sister Elwen Marr','Field Chirurgeon',infirmary,[0,1]);
        addNpc('Tomas Grey','Wounded Scout',infirmary,[-1,0]);
        addNpc('Quartermaster Venn','Quartermaster',quartermaster,[0,1]);
        addNpc('Hessa Coil','Ostler',stable,[0,1]);
        addNpc('Merrit Dane','Camp Cook',cookyard,[1,0]);
        addNpc('Jory Pell','Teamster',followers,[0,1]);

        const districts=[
            {id:'fort-core',name:'Northwatch Star Fort',centre:c,radius:14},
            {id:'rear-camp',name:'Rear Camp',centre:cookyard,radius:12},
            {id:'field-hospital',name:'Field Hospital',centre:infirmary,radius:7},
            {id:'supply-line',name:'Stores & Stables',centre:quartermaster,radius:12},
        ];
        window.SettlementScale?.register?.({id:'northwatch',name:'Northwatch Fort',tier:'village',centre:c,populationTarget:95,radius:38,districts});
        window.NorthwatchSettlementRegistry={centre:{...c},populationTarget:95,districts,sites:sites.filter(s=>s.id.startsWith('northwatch-')),frontline:true};
    }

    function expandRidgehold(c) {
        // Reserve front: permanent facilities spread in a measured rearward
        // arc. It should feel ready for war, but not like Northwatch's triage.
        const drill={q:c.q,r:c.r+15};
        const smith={q:c.q-13,r:c.r+15};
        const magazine={q:c.q+13,r:c.r+15};
        const households={q:c.q-10,r:c.r+25};
        const mess={q:c.q+8,r:c.r+25};
        paintYard(drill,6,'Dirt');
        const sm=carveBuilding('ridgehold-armoury',smith,'armoury',3,2,'Keep Wall');
        const mag=carveBuilding('ridgehold-magazine',magazine,'magazine',3,2,'Keep Wall');
        const homes=carveBuilding('ridgehold-households',households,'households',4,2);
        const ms=carveBuilding('ridgehold-mess',mess,'mess',4,2);
        [sm,mag,homes,ms].forEach(r=>{if(r?.doorHex)pathLine(r.doorHex,drill,'Path');});
        window.tileObjects[key(drill)]={type:'training_dummy',lightRadius:0};
        window.tileObjects[key({q:drill.q-3,r:drill.r})]={type:'training_dummy',lightRadius:0};
        window.tileObjects[key({q:drill.q+3,r:drill.r})]={type:'training_dummy',lightRadius:0};
        window.tileObjects[key(smith)]={type:'anvil'};
        window.tileObjects[key(magazine)]={type:'storage_chest',items:[]};
        window.tileObjects[key({q:households.q-1,r:households.r})]={type:'bed'};
        window.tileObjects[key({q:households.q+1,r:households.r})]={type:'bed'};
        window.tileObjects[key(mess)]={type:'fireplace',lightRadius:6};
        window.tileObjects[key({q:mess.q+2,r:mess.r})]={type:'table'};

        addNpc('Sergeant Alwen Pike','Drill Sergeant',drill,[0,1]);
        addNpc('Marta Rusk','Armourer',smith,[0,1]);
        addNpc('Bel Orren','Magazine Keeper',magazine,[0,1]);
        addNpc('Nell Pike','Garrison Spouse',households,[0,1]);
        addNpc('Corin Pike','Garrison Child',households,[-1,1]);
        addNpc('Harl Fen','Mess Steward',mess,[0,1]);

        const districts=[
            {id:'fort-core',name:'Ridgehold Star Fort',centre:c,radius:14},
            {id:'drill-ground',name:'Drill Ground',centre:drill,radius:10},
            {id:'reserve-stores',name:'Armoury & Magazine',centre:magazine,radius:15},
            {id:'garrison-row',name:'Garrison Row',centre:households,radius:12},
        ];
        window.SettlementScale?.register?.({id:'ridgehold',name:'Ridgehold Fort',tier:'village',centre:c,populationTarget:78,radius:42,districts});
        window.RidgeholdSettlementRegistry={centre:{...c},populationTarget:78,districts,sites:sites.filter(s=>s.id.startsWith('ridgehold-')),frontline:false};
    }

    function repairDeepholdsFreightDoor() {
        // Parent PR compatibility repair: the freight road was painted from
        // the door hex itself, leaving an open-door tileObject standing on
        // Path. Preserve the exterior path but restore the doorway/interior
        // threshold to Cave Floor. This is intentionally idempotent.
        const d=window.campaign2DeepholdsFreightDoor;
        if(!d||!window.setTerrainAt) return;
        const obj=window.tileObjects?.[key(d)];
        if(obj?.type==='door_open') window.setTerrainAt(d.q,d.r,'Cave Floor');
    }

    function expand() {
        if(expanded) return true;
        const n=window.campaign2NorthwatchCenter, r=window.campaign2RidgeholdCenter;
        if(!n||!r||!window.setTerrainAt) return false;
        sites.length=0;
        expandNorthwatch(n);
        expandRidgehold(r);
        repairDeepholdsFreightDoor();
        window.BorderFortsSettlementRegistry={northwatch:window.NorthwatchSettlementRegistry,ridgehold:window.RidgeholdSettlementRegistry,sites};
        expanded=true;
        return true;
    }

    function reset(){expanded=false;sites.length=0;delete window.NorthwatchSettlementRegistry;delete window.RidgeholdSettlementRegistry;delete window.BorderFortsSettlementRegistry;}

    function installWorldWrapper(){
        if(installed)return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function')return false;
        if(original.__borderFortsExpansion){installed=true;return true;}
        const wrapped=function(...args){
            reset();
            const result=original.apply(this,args);
            if(expand()){
                window.connectAllRoadNetworks?.();
                window.reconcileRegionWallBookkeeping?.();
                window.reconcileAllRegionFootprints?.();
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.();window.renderEntities?.();
            }
            return result;
        };
        wrapped.__borderFortsExpansion=true;wrapped.__original=original;
        window.setupVillageScene=wrapped;installed=true;return true;
    }

    function install(){installWorldWrapper();if(window.currentCampaign!=='2'||!window.campaign2NorthwatchCenter)return false;if(!expanded)expand();return expanded;}
    window.BorderFortsExpansion={install,expand,reset,repairDeepholdsFreightDoor,get sites(){return sites;},get stats(){return{installed,expanded,sites:sites.length,northwatch:window.NorthwatchSettlementRegistry?.populationTarget||0,ridgehold:window.RidgeholdSettlementRegistry?.populationTarget||0};}};
    if(!install()) { const timer=setInterval(()=>{if(install())clearInterval(timer);},100); setTimeout(()=>clearInterval(timer),5000); }
})();