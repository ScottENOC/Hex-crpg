// silthandrielCanopyExpansion.js
// Turns Sil'thandriel from three quest platforms into a dispersed, inhabited
// canopy capital. Unlike Kragmoor's dense carved levels, elven districts are
// separate living-tree platforms joined by long bridges, gardens and several
// independent climbs. The forest floor remains deliberately sparse.
(() => {
    'use strict';

    const TARGET_POPULATION = 430;
    let installed = false;
    let expanded = false;
    const platforms = [];

    const key = h => `${h.q},${h.r}`;
    const building = () => window.campaign2SilthandrielBuilding || null;
    const centre = () => window.campaign2ElvenCourtCenter || null;
    const distance = (a,b) => typeof window.distance === 'function'
        ? window.distance(a,b)
        : Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));

    function ensureFloor(floorN) {
        const b=building();
        if(!b) return null;
        b.floors[floorN]=b.floors[floorN]||{terrain:{},tileObjects:{}};
        b.floors[floorN].terrain=b.floors[floorN].terrain||{};
        b.floors[floorN].tileObjects=b.floors[floorN].tileObjects||{};
        return b.floors[floorN];
    }

    function floorHexes(c,halfW=3,halfH=2) {
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

    // Elven platforms are open-sided: no Wall ring. The surrounding absent
    // floor simply falls back to the terrain below, while movement remains on
    // the carved Wood Floor bridge/platform hexes. This keeps the capital from
    // reading as a collection of human rooms floating in trees.
    function carvePlatform(id,floorN,c,halfW=3,halfH=2,floorType='Wood Floor') {
        const f=ensureFloor(floorN);
        if(!f) return null;
        const floors=floorHexes(c,halfW,halfH);
        floors.forEach(h=>f.terrain[key(h)]=floorType);
        const entry={id,floor:floorN,center:{...c},floorHexes:floors};
        platforms.push(entry);
        return entry;
    }

    function bridge(floorN,from,to,floorType='Wood Floor') {
        const f=ensureFloor(floorN);
        if(!f) return;
        let cur={...from}, guard=0;
        while((cur.q!==to.q||cur.r!==to.r)&&guard++<120) {
            f.terrain[key(cur)]=floorType;
            const ns=window.getNeighbors?.(cur.q,cur.r)||[];
            if(!ns.length) break;
            cur=ns.slice().sort((a,b)=>distance(a,to)-distance(b,to))[0];
        }
        f.terrain[key(to)]=floorType;
    }

    function linkFloors(hex,fromFloor,toFloor) {
        const from=fromFloor===0?{tileObjects:window.tileObjects}:ensureFloor(fromFloor);
        const to=toFloor===0?{tileObjects:window.tileObjects}:ensureFloor(toFloor);
        if(!from||!to) return;
        from.tileObjects[key(hex)]={type:toFloor>fromFloor?'stair_up':'stair_down',toFloor};
        to.tileObjects[key(hex)]={type:fromFloor<toFloor?'stair_down':'stair_up',toFloor:fromFloor};
    }

    function prop(floorN,h,type,extra={}) {
        const f=floorN===0?{tileObjects:window.tileObjects}:ensureFloor(floorN);
        if(f) f.tileObjects[key(h)]={type,...extra};
    }

    function addGroundLife(c) {
        // The ground is still forest, not a conventional city street grid:
        // a spring, herb garden and a small gathering ring sit beneath the
        // canopy. Buildings remain above.
        const spring={q:c.q+5,r:c.r+8};
        window.setTerrainAt?.(spring.q,spring.r,'Water');
        prop(0,{q:spring.q+1,r:spring.r},'herb_patch',{hasHerbs:true});
        prop(0,{q:spring.q-1,r:spring.r+1},'herb_patch',{hasHerbs:true});
        const ring={q:c.q-6,r:c.r+8};
        prop(0,ring,'fireplace',{lightRadius:4});
        prop(0,{q:ring.q-2,r:ring.r},'bench');
        prop(0,{q:ring.q+2,r:ring.r},'bench');
        window.campaign2SilthandrielGroundSpring={...spring};
        return {spring,ring};
    }

    function addLowerCanopy(c) {
        // Existing archive (-12,+2), lodge (+12,+2), and main tree stair stay.
        // New inhabited platforms fill the lower canopy without becoming a
        // continuous slab: every room is its own bough linked by bridges.
        const moonwell={q:c.q,r:c.r+11};
        const craft={q:c.q+7,r:c.r-10};
        const kitchen={q:c.q-7,r:c.r-10};
        const homesWest={q:c.q-14,r:c.r+10};
        const homesEast={q:c.q+14,r:c.r+10};
        [
            ['moonwell-commons',moonwell,4,3],['craft-bower',craft,3,2],['hearth-bower',kitchen,3,2],
            ['lower-homes-west',homesWest,4,3],['lower-homes-east',homesEast,4,3],
        ].forEach(([id,p,w,h])=>carvePlatform(id,1,p,w,h));
        const stair=window.campaign2SilthandrielTreeStairHex || {q:c.q,r:c.r-2};
        [moonwell,craft,kitchen].forEach(p=>bridge(1,stair,p));
        bridge(1,moonwell,homesWest); bridge(1,moonwell,homesEast);
        prop(1,moonwell,'fountain');
        prop(1,{q:moonwell.q-2,r:moonwell.r},'bench');
        prop(1,{q:moonwell.q+2,r:moonwell.r},'bench');
        prop(1,craft,'table');
        prop(1,{q:craft.q+1,r:craft.r},'anvil');
        prop(1,kitchen,'fireplace',{lightRadius:5});
        prop(1,{q:kitchen.q+1,r:kitchen.r},'table');
        for(const h of [homesWest,homesEast]) {
            prop(1,{q:h.q-1,r:h.r},'bed'); prop(1,{q:h.q+1,r:h.r},'bed');
        }
        return {moonwell,craft,kitchen,homesWest,homesEast};
    }

    function addUpperCanopy(c) {
        const memory={q:c.q-13,r:c.r-7};
        const song={q:c.q+13,r:c.r-7};
        const residencesW={q:c.q-11,r:c.r+10};
        const residencesE={q:c.q+11,r:c.r+10};
        carvePlatform('memory-bower',2,memory,4,3);
        carvePlatform('song-garden',2,song,4,3);
        carvePlatform('upper-residences-west',2,residencesW,4,3);
        carvePlatform('upper-residences-east',2,residencesE,4,3);
        [memory,song,residencesW,residencesE].forEach(p=>bridge(2,c,p));
        prop(2,memory,'journal',{readId:'silthandriel_memory_bower',lightRadius:0});
        prop(2,song,'fireplace',{lightRadius:3});
        prop(2,{q:song.q-2,r:song.r},'bench');
        prop(2,{q:song.q+2,r:song.r},'bench');
        for(const h of [residencesW,residencesE]) {
            prop(2,{q:h.q-1,r:h.r},'bed'); prop(2,{q:h.q+1,r:h.r},'bed');
        }
        return {memory,song,residencesW,residencesE};
    }

    function addHighBough(c) {
        // A third height gives Sil'thandriel a skyline instead of capping out
        // at the royal court. These are small, exposed platforms: observatory,
        // ranger roost and wind shrine rather than another dense district.
        const stair={q:c.q,r:c.r-2};
        const observatory={q:c.q,r:c.r-10};
        const roost={q:c.q+11,r:c.r-3};
        const shrine={q:c.q-11,r:c.r-3};
        carvePlatform('star-observatory',3,observatory,3,2,'Stone Floor');
        carvePlatform('ranger-roost',3,roost,3,2);
        carvePlatform('wind-shrine',3,shrine,3,2);
        bridge(3,stair,observatory); bridge(3,observatory,roost); bridge(3,observatory,shrine);
        linkFloors(stair,2,3);
        prop(3,observatory,'pedestal');
        prop(3,roost,'table');
        prop(3,shrine,'journal',{readId:'silthandriel_wind_shrine',lightRadius:0});
        window.campaign2SilthandrielHighBough={...observatory};
        return {stair,observatory,roost,shrine};
    }

    function addSecondAscent(c, lower) {
        // The city no longer depends on one trunk stair. A second climb at the
        // eastern edge rises from the forest to the lower canopy, then another
        // stair nearby continues to the royal level. It is circulation, not a
        // teleport; all three floor maps share the same coordinates.
        const ground={q:c.q+13,r:c.r+5};
        window.setTerrainAt?.(ground.q,ground.r,'Grass');
        bridge(1,ground,lower.homesEast);
        linkFloors(ground,0,1);
        const upper={q:ground.q-1,r:ground.r};
        bridge(1,ground,upper); bridge(2,upper,{q:c.q+11,r:c.r+10});
        linkFloors(upper,1,2);
        window.campaign2SilthandrielEastAscent={ground:{...ground},upper:{...upper}};
        return {ground,upper};
    }

    function addResidents(c, lower, upper, high) {
        if(typeof window.buildNPC!=='function') return;
        const specs=[
            ['Lethiel Reedvoice','Storykeeper',1,lower.moonwell,0,1],
            ['Faelar Greenhand','Woodshaper',1,lower.craft,0,1],
            ['Mirael Hearthleaf','Cook',1,lower.kitchen,0,1],
            ['Sarith Vale','Weaver',1,lower.homesWest,0,1],
            ['Nuala Fern','Gardener',1,lower.homesEast,0,1],
            ['Thalen Moonsong','Singer',2,upper.song,0,1],
            ['Ilyra Remembering','Memory Keeper',2,upper.memory,0,1],
            ['Caelir Dawnstep','Court Attendant',2,upper.residencesW,0,1],
            ['Vaelis Rowan','Diplomatic Scribe',2,upper.residencesE,0,1],
            ['Erenor Farwatch','Star Watcher',3,high.observatory,0,1],
            ['Syla Swiftbranch','Ranger',3,high.roost,0,1],
            ['Naeris Windward','Shrine Keeper',3,high.shrine,0,1],
        ];
        specs.forEach(([name,title,floor,p,dq,dr],i)=>{
            if(window.entities?.some(e=>e.name===name)) return;
            const npc=window.buildNPC({
                name,title,race:'elf',gender:i%2?'male':'female',hex:{q:p.q+dq,r:p.r+dr},
                side:'neutral',factionId:'sylvan_court',color:'#6f9f72',dialogueId:'silthandriel_resident',
            });
            npc.floor=floor; npc.homeSettlementId='silthandriel'; npc.occupation=title;
            window.entities.push(npc);
        });
    }

    function register(c, lower, upper, high) {
        const districts=[
            {id:'forest-floor',name:'Rootward Clearing',centre:c,floor:0,radius:20},
            {id:'lower-canopy',name:'Lower Canopy',centre:lower.moonwell,floor:1,radius:26},
            {id:'silver-leaf-court',name:'Court of the Silver Leaf',centre:c,floor:2,radius:22},
            {id:'memory-and-song',name:'Memory & Song Bowers',centre:upper.memory,floor:2,radius:20},
            {id:'high-boughs',name:'High Boughs',centre:high.observatory,floor:3,radius:18},
        ];
        window.SettlementScale?.register?.({
            id:'silthandriel',name:"Sil'thandriel",tier:'capital',centre:c,populationTarget:TARGET_POPULATION,radius:35,districts,
        });
        window.SilthandrielSettlementRegistry={
            centre:{...c},populationTarget:TARGET_POPULATION,districts,platforms,
            floors:[0,1,2,3],
            get inhabitedPlatforms(){return platforms.length;},
            get bridgeHexes(){
                const b=building();
                return [1,2,3].reduce((n,f)=>n+Object.values(b?.floors?.[f]?.terrain||{}).filter(v=>v==='Wood Floor'||v==='Stone Floor').length,0);
            },
        };
    }

    function expand() {
        const c=centre();
        if(expanded||!c||!building()||!window.setTerrainAt) return false;
        platforms.length=0;
        addGroundLife(c);
        const lower=addLowerCanopy(c);
        const upper=addUpperCanopy(c);
        const high=addHighBough(c);
        addSecondAscent(c,lower);
        addResidents(c,lower,upper,high);
        register(c,lower,upper,high);
        expanded=true;
        return true;
    }

    function reset(){expanded=false;platforms.length=0;delete window.SilthandrielSettlementRegistry;}

    function installWorldWrapper() {
        if(installed) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function') return false;
        if(original.__silthandrielCanopyExpansion){installed=true;return true;}
        const wrapped=function(...args){
            reset();
            const result=original.apply(this,args);
            if(expand()) {
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.(); window.renderEntities?.();
            }
            return result;
        };
        wrapped.__silthandrielCanopyExpansion=true; wrapped.__original=original;
        window.setupVillageScene=wrapped; installed=true; return true;
    }

    function install(){installWorldWrapper(); if(window.currentCampaign!=='2'||!centre())return false; if(!expanded)expand(); return expanded;}

    window.SilthandrielCanopyExpansion={install,expand,reset,get platforms(){return platforms;},get stats(){return{installed,expanded,platforms:platforms.length,populationTarget:TARGET_POPULATION};}};

    if(!install()) {
        const timer=setInterval(()=>{if(install())clearInterval(timer);},25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();