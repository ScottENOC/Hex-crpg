// deepholdsCityExpansion.js
// Expands Kragmoor from a linear quest-delving route into an inhabited vertical
// capital. The mountain surface remains almost entirely solid rock: a public
// gate hall and a smaller freight gate are the only obvious entrances. The
// city itself spreads laterally across floors -1, -2 and -3; -4 and -5 remain
// the dangerous old/deep works from the existing quest line.
(() => {
    'use strict';

    const TARGET_POPULATION = 480;
    let installed = false;
    let expanded = false;
    const rooms = [];

    const key = h => `${h.q},${h.r}`;
    const building = () => window.campaign2DeepholdsBuilding || null;
    const hall = () => window.campaign2DeepholdsHallCenter || null;

    function distance(a,b) {
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function floorHexes(c, halfW, halfH) {
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

    function ensureFloor(floorN) {
        const b=building();
        if(!b) return null;
        b.floors[floorN]=b.floors[floorN]||{terrain:{},tileObjects:{}};
        b.floors[floorN].terrain=b.floors[floorN].terrain||{};
        b.floors[floorN].tileObjects=b.floors[floorN].tileObjects||{};
        return b.floors[floorN];
    }

    function carveRoom(id,floorN,c,halfW=3,halfH=3,floorType='Cave Floor') {
        const f=ensureFloor(floorN);
        if(!f) return null;
        const floors=floorHexes(c,halfW,halfH), walls=wallRing(floors);
        walls.forEach(h=>{ if(!f.terrain[key(h)]) f.terrain[key(h)]='Wall'; });
        floors.forEach(h=>{ f.terrain[key(h)]=floorType; });
        const entry={id,floor:floorN,center:{...c},floorHexes:floors,wallHexes:walls};
        rooms.push(entry);
        return entry;
    }

    function carveSurfaceRoom(id,c,halfW=3,halfH=2,doorHex=null) {
        const floors=floorHexes(c,halfW,halfH), walls=wallRing(floors);
        walls.forEach(h=>window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,'Cave Floor'));
        if(doorHex) {
            window.setTerrainAt(doorHex.q,doorHex.r,'Cave Floor');
            window.tileObjects[key(doorHex)]={type:'door_open',lightRadius:0,openTerrain:'Cave Floor',closedTerrain:'Wall'};
        }
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            floorHexes:floors,wallHexes:walls.filter(h=>!doorHex||key(h)!==key(doorHex)),
            floorType:'Cave Floor',lightMult:0.2,doorHex:doorHex?{...doorHex}:null,
            center:{...c},deepholdsRoomId:id,
        };
        window.interiorRegions?.push(region);
        rooms.push({id,floor:0,center:{...c},floorHexes:floors,wallHexes:walls,region});
        return region;
    }

    function corridor(floorN,from,to,floorType='Cave Floor') {
        const f=ensureFloor(floorN);
        if(!f) return;
        let cur={...from};
        let guard=0;
        while((cur.q!==to.q||cur.r!==to.r)&&guard++<120) {
            f.terrain[key(cur)]=floorType;
            const ns=window.getNeighbors?.(cur.q,cur.r)||[];
            if(!ns.length) break;
            cur=ns.slice().sort((a,b)=>distance(a,to)-distance(b,to))[0];
        }
        f.terrain[key(to)]=floorType;
    }

    function linkFloors(hex,fromFloor,toFloor) {
        const a=fromFloor===0?null:ensureFloor(fromFloor);
        const b=toFloor===0?null:ensureFloor(toFloor);
        const down={type:'stair_down',toFloor:toFloor};
        const up={type:'stair_up',toFloor:fromFloor};
        if(fromFloor===0) window.tileObjects[key(hex)]=down; else a.tileObjects[key(hex)]=down;
        if(toFloor===0) window.tileObjects[key(hex)]=up; else b.tileObjects[key(hex)]=up;
    }

    function prop(floorN,h,type,extra={}) {
        const f=floorN===0?{tileObjects:window.tileObjects}:ensureFloor(floorN);
        if(f) f.tileObjects[key(h)]={type,...extra};
    }

    function addDistricts(anchor) {
        // -1: civic / social level. The existing Great Hall stays the axial
        // landmark; ordinary dwarven life branches away from it.
        const tavern={q:anchor.q+13,r:anchor.r+8};
        const commons={q:anchor.q+13,r:anchor.r-7};
        const shrine={q:anchor.q-10,r:anchor.r-10};
        const barracks={q:anchor.q+1,r:anchor.r-12};
        carveRoom('iron-keg-tavern',-1,tavern,4,3);
        carveRoom('common-hall',-1,commons,4,3);
        carveRoom('ancestor-shrine',-1,shrine,3,3);
        carveRoom('gate-barracks',-1,barracks,4,3);
        [tavern,commons,shrine,barracks].forEach(c=>corridor(-1,hall(),c));
        prop(-1,tavern,'fireplace',{lightRadius:7});
        prop(-1,{q:tavern.q-2,r:tavern.r},'table');
        prop(-1,{q:tavern.q+2,r:tavern.r},'table');
        prop(-1,commons,'table');
        prop(-1,{q:shrine.q,r:shrine.r-1},'throne'); // reused as a stone ancestor dais/altar
        prop(-1,{q:barracks.q-1,r:barracks.r},'bed');
        prop(-1,{q:barracks.q+1,r:barracks.r},'bed');

        // -2: trade / craft level. The existing vault and Runeforge remain;
        // a market arcade and craft halls make this a functioning economy.
        const market={q:anchor.q+10,r:anchor.r-7};
        const smithrow={q:anchor.q+18,r:anchor.r-8};
        const storehall={q:anchor.q+9,r:anchor.r+9};
        const guesthall={...tavern};
        carveRoom('market-arcade',-2,market,4,3);
        carveRoom('smith-row',-2,smithrow,4,3);
        carveRoom('store-hall',-2,storehall,4,3);
        carveRoom('iron-keg-cellar-and-rooms',-2,guesthall,4,3);
        corridor(-2,{q:anchor.q,r:anchor.r},market);
        corridor(-2,market,smithrow);
        corridor(-2,market,storehall);
        corridor(-2,storehall,guesthall);
        prop(-2,market,'table');
        prop(-2,{q:market.q-2,r:market.r},'crate');
        prop(-2,{q:market.q+2,r:market.r},'crate');
        prop(-2,smithrow,'anvil');
        prop(-2,{q:smithrow.q+1,r:smithrow.r},'rune_forge',{lightRadius:4});
        prop(-2,storehall,'storage_chest',{items:[]});
        prop(-2,{q:guesthall.q-2,r:guesthall.r},'bed');
        prop(-2,{q:guesthall.q+2,r:guesthall.r},'bed');

        // The Iron Keg itself spans two absolute city levels. This is the
        // two-storey tavern mechanism pushed underground: a taproom on -1,
        // guest rooms/cellar on -2, at the same world hex footprint.
        const tavernStair={q:tavern.q,r:tavern.r+1};
        linkFloors(tavernStair,-1,-2);

        // -3: workers' ward beside the mine. Family halls and bath/kitchen
        // spaces distinguish an inhabited mining city from a dungeon corridor.
        const familyA={q:anchor.q+7,r:anchor.r+7};
        const familyB={q:anchor.q+15,r:anchor.r+12};
        const baths={q:anchor.q+16,r:anchor.r+2};
        const minersHall={q:anchor.q+5,r:anchor.r+16};
        carveRoom('family-hall-east',-3,familyA,4,3);
        carveRoom('family-hall-south',-3,familyB,4,3);
        carveRoom('steam-baths',-3,baths,3,3);
        carveRoom('miners-mess',-3,minersHall,4,3);
        corridor(-3,{q:anchor.q-18,r:anchor.r+10},familyA);
        corridor(-3,familyA,baths);
        corridor(-3,familyA,familyB);
        corridor(-3,familyB,minersHall);
        prop(-3,{q:familyA.q-2,r:familyA.r},'bed');
        prop(-3,{q:familyA.q+2,r:familyA.r},'bed');
        prop(-3,{q:familyB.q-2,r:familyB.r},'bed');
        prop(-3,{q:familyB.q+2,r:familyB.r},'bed');
        prop(-3,baths,'fountain');
        prop(-3,minersHall,'fireplace',{lightRadius:7});
        prop(-3,{q:minersHall.q+2,r:minersHall.r},'table');

        // Public workers' stair: a second vertical spine independent of the
        // royal/vault route, preventing the capital from reading as one linear
        // dungeon. It connects the inhabited city levels only; -4/-5 remain
        // on the old mine quest progression.
        const workersStair={q:anchor.q+10,r:anchor.r+4};
        corridor(-1,commons,workersStair);
        corridor(-2,market,workersStair);
        corridor(-3,familyA,workersStair);
        linkFloors(workersStair,-1,-2);
        // A second stair one hex away links -2 -> -3 so each floor has a real
        // landing rather than one tile trying to be both up and down at once.
        const workersStair2={q:workersStair.q+1,r:workersStair.r};
        corridor(-2,workersStair,workersStair2);
        corridor(-3,workersStair,workersStair2);
        linkFloors(workersStair2,-2,-3);

        return {tavern,commons,shrine,barracks,market,smithrow,storehall,guesthall,familyA,familyB,baths,minersHall,workersStair,workersStair2};
    }

    function addFreightGate(anchor, marketCenter) {
        // A second, much smaller opening on the east face of the mountain.
        // Surface travellers see rock, the monumental south gate, and this
        // functional freight door — never a surface city painted around it.
        const center={q:anchor.q+20,r:anchor.r};
        const door={q:anchor.q+23,r:anchor.r-1};
        carveSurfaceRoom('freight-gate',center,3,2,door);
        for(let q=door.q;q<=anchor.q+27;q++) window.setTerrainAt(q,door.r,'Path');
        const stair={q:center.q-1,r:center.r};
        corridor(-2,marketCenter,stair);
        linkFloors(stair,0,-2);
        window.campaign2DeepholdsFreightGateCenter={...center};
        window.campaign2DeepholdsFreightDoor={...door};
        window.campaign2DeepholdsFreightStair={...stair};
        return {center,door,stair};
    }

    function addAmbientResidents(anchor, d) {
        if(typeof window.buildNPC!=='function') return;
        const specs=[
            ['Bera Flintbraid','Innkeeper',-1,d.tavern,0,1],
            ['Dori Caskson','Brewer',-1,d.tavern,-1,0],
            ['Hurn Deepbell','Hall Steward',-1,d.commons,0,1],
            ['Sella Anvilward','Gate Captain',-1,d.barracks,0,1],
            ['Orri Stoneprayer','Ancestor Keeper',-1,d.shrine,0,1],
            ['Kelda Coppercount','Market Factor',-2,d.market,0,1],
            ['Brom Emberhand','Smith',-2,d.smithrow,0,1],
            ['Tavi Gemscale','Lapidary',-2,d.smithrow,-1,1],
            ['Mara Kegward','Guest Keeper',-2,d.guesthall,0,1],
            ['Fenri Hearthdelver','Miner',-3,d.familyA,0,1],
            ['Runi Hearthdelver','Miner',-3,d.familyA,-1,1],
            ['Kori Deepwell','Bath Keeper',-3,d.baths,0,1],
            ['Dagna Orewise','Mine Cook',-3,d.minersHall,0,1],
        ];
        specs.forEach(([name,title,floor,c,dq,dr],i)=>{
            if(window.entities?.some(e=>e.name===name)) return;
            const npc=window.buildNPC({
                name,title,race:'dwarf',gender:i%2?'male':'female',
                hex:{q:c.q+dq,r:c.r+dr},side:'neutral',factionId:'dwarven_kingdom',
                color:'#8b7355',dialogueId:'deepholds_resident',
            });
            npc.floor=floor;
            npc.homeSettlementId='deepholds';
            npc.occupation=title;
            window.entities.push(npc);
        });
    }

    function registerSettlement(anchor,d) {
        const districts=[
            {id:'crown-halls',name:'Crown Halls',centre:hall(),floor:-1,radius:18},
            {id:'ale-and-commons',name:'Ale Hall & Commons',centre:d.tavern,floor:-1,radius:15},
            {id:'forge-market',name:'Forge Market',centre:d.market,floor:-2,radius:18},
            {id:'workers-ward',name:"Workers' Ward",centre:d.familyA,floor:-3,radius:18},
            {id:'deep-mine',name:'Deep Mine',centre:window.campaign2DeepholdsMineCenter,floor:-3,radius:12},
        ].filter(x=>x.centre);
        window.SettlementScale?.register?.({
            id:'deepholds',name:'Kragmoor',tier:'capital',centre:anchor,
            populationTarget:TARGET_POPULATION,radius:28,districts,
        });
        window.DeepholdsSettlementRegistry={
            centre:{...anchor},populationTarget:TARGET_POPULATION,districts,rooms,
            floors:[0,-1,-2,-3,-4,-5],
            surfaceEntrances:2,
            get inhabitedRooms(){return rooms.filter(r=>r.floor>=-3).length;},
        };
    }

    function expand() {
        if(expanded||!building()||!hall()||!window.campaign2DeepholdsMineCenter) return false;
        const b=building();
        const anchor={q:(b.minQ+b.maxQ)/2,r:(b.minR+b.maxR)/2};
        rooms.length=0;
        const districts=addDistricts(anchor);
        const freight=addFreightGate(anchor,districts.market);
        addAmbientResidents(anchor,districts);
        registerSettlement(anchor,districts);
        window.campaign2DeepholdsCityDistricts={...districts,freight};
        expanded=true;
        return true;
    }

    function reset() {
        expanded=false; rooms.length=0;
        delete window.DeepholdsSettlementRegistry;
        delete window.campaign2DeepholdsCityDistricts;
        delete window.campaign2DeepholdsFreightGateCenter;
        delete window.campaign2DeepholdsFreightDoor;
        delete window.campaign2DeepholdsFreightStair;
    }

    function installWorldWrapper() {
        if(installed) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function') return false;
        if(original.__deepholdsCityExpansion){installed=true;return true;}
        const wrapped=function(...args){
            reset();
            const result=original.apply(this,args);
            if(expand()) {
                window.connectAllRoadNetworks?.();
                window.reconcileRegionWallBookkeeping?.();
                window.reconcileAllRegionFootprints?.();
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                if(window.serializeEntity) {
                    window._campaign2NpcBaseline=window._campaign2NpcBaseline||{};
                    window.entities.filter(e=>e.isNPC).forEach(e=>{ window._campaign2NpcBaseline[e.name]=window.serializeEntity(e); });
                }
                window.drawMap?.(); window.renderEntities?.();
            }
            return result;
        };
        wrapped.__deepholdsCityExpansion=true;
        wrapped.__original=original;
        window.setupVillageScene=wrapped;
        installed=true;
        return true;
    }

    function install() {
        installWorldWrapper();
        if(window.currentCampaign!=='2'||!building()) return false;
        if(!expanded) expand();
        return expanded;
    }

    window.DeepholdsCityExpansion={
        install,expand,reset,installWorldWrapper,
        get rooms(){return rooms;},
        get stats(){return{
            installed,expanded,rooms:rooms.length,populationTarget:TARGET_POPULATION,
            inhabitedRooms:window.DeepholdsSettlementRegistry?.inhabitedRooms||0,
            surfaceEntrances:window.DeepholdsSettlementRegistry?.surfaceEntrances||0,
        };}
    };

    install();
    if(!installed) {
        const timer=setInterval(()=>{if(installWorldWrapper()) clearInterval(timer);},25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();