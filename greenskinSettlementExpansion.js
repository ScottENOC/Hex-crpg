// greenskinSettlementExpansion.js
// Expands the existing greenskin settlements without turning them into reskinned
// human towns. Skarnak's Hold sprawls outward as an improvised militarised
// surface settlement; the Skarn-tooth forward camp stays an outpost on human
// land but acquires a cramped hidden warren beneath it.
(() => {
    'use strict';

    let installed=false, expanded=false;
    const key=h=>`${h.q},${h.r}`;
    const dist=(a,b)=>typeof window.distance==='function'?window.distance(a,b):Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));

    function paintBlob(c,radius,type,seed=0) {
        const painted=[];
        for(let dq=-radius;dq<=radius;dq++) for(let dr=-radius;dr<=radius;dr++) {
            const h={q:c.q+dq,r:c.r+dr};
            if(dist(c,h)>radius) continue;
            const edge=dist(c,h)>=radius-1;
            const keep=!edge || (window.pseudoRandom?.(h.q*1.73+seed,h.r*2.11-seed) ?? 0.5)>.32;
            if(!keep) continue;
            const current=window.getTerrainAt?.(h.q,h.r)?.name;
            if(['Wall','Keep Wall','Water','Deep Water'].includes(current)) continue;
            window.setTerrainAt?.(h.q,h.r,type); painted.push(h);
        }
        return painted;
    }

    function addOrcResident(name,title,hex) {
        if(window.entities?.some(e=>e.name===name)||typeof window.createMonster!=='function') return;
        const e=window.createMonster('orc',hex,null,null,'neutral');
        e.name=name; e.title=title; e.isNPC=true; e.factionId='orc_raiders'; e.dialogueId='orc_stronghold_resident';
        e.homeSettlementId='skarnaks_hold'; e.occupation=title; e.aiState='idle';
        window.entities.push(e);
    }

    function expandOrcHold() {
        const c=window.campaign2OrcStrongholdCenter;
        if(!c) return null;
        // Existing stockade remains the hard core. Three irregular annexes make
        // the settlement look accreted rather than planned around a grid.
        const forge={q:c.q+10,r:c.r-5};
        const beast={q:c.q-10,r:c.r+5};
        const pit={q:c.q+5,r:c.r+11};
        const shrine={q:c.q-7,r:c.r-10};
        paintBlob(forge,5,'Dirt',11); paintBlob(beast,5,'Dirt',23); paintBlob(pit,5,'Dirt',31); paintBlob(shrine,4,'Dirt',47);

        // Broad rough paths, not straight formal streets.
        [forge,beast,pit,shrine].forEach(target=>{
            let cur={...c},guard=0;
            while(dist(cur,target)>1&&guard++<40) {
                const ns=window.getNeighbors?.(cur.q,cur.r)||[];
                const next=ns.sort((a,b)=>dist(a,target)-dist(b,target))[0];
                if(!next) break;
                if(!['Wall','Keep Wall','Water','Deep Water'].includes(window.getTerrainAt?.(next.q,next.r)?.name)) window.setTerrainAt(next.q,next.r,'Dirt');
                cur=next;
            }
        });

        window.tileObjects[key(forge)]={type:'anvil'};
        window.tileObjects[key({q:forge.q+1,r:forge.r})]={type:'fireplace',lightRadius:6};
        window.tileObjects[key(beast)]={type:'fence_h'};
        window.tileObjects[key({q:beast.q+2,r:beast.r})]={type:'fence_v'};
        window.tileObjects[key(pit)]={type:'fireplace',lightRadius:4};
        window.tileObjects[key({q:pit.q-2,r:pit.r})]={type:'bench'};
        window.tileObjects[key({q:pit.q+2,r:pit.r})]={type:'bench'};
        window.tileObjects[key(shrine)]={type:'trophy_pole'};

        // Scattered huts and trophies deliberately ignore symmetry.
        [[12,-1],[9,5],[-12,1],[-9,9],[2,14],[-3,13],[-11,-8],[8,-11]].forEach(([dq,dr],i)=>{
            const h={q:c.q+dq,r:c.r+dr};
            if(!window.tileObjects[key(h)]) window.tileObjects[key(h)]={type:i%3===0?'hut_large':'hut',lightRadius:0};
        });
        [[-4,8],[7,7],[-8,-4],[11,-7]].forEach(([dq,dr])=>window.tileObjects[key({q:c.q+dq,r:c.r+dr})]={type:'trophy_pole'});

        addOrcResident('Morga Ironjaw','Pit Master',{q:pit.q,r:pit.r+1});
        addOrcResident('Dreg Ashhammer','Camp Smith',{q:forge.q,r:forge.r+1});
        addOrcResident('Usha Bonecord','Beast Keeper',{q:beast.q,r:beast.r+1});
        addOrcResident('Ruk One-Eye','Old Raider',{q:shrine.q+1,r:shrine.r});

        window.SettlementScale?.register?.({
            id:'skarnaks_hold',name:"Skarnak's Hold",tier:'village',centre:c,populationTarget:110,radius:28,
            districts:[
                {id:'stockade',name:'Old Stockade',centre:c,radius:10},
                {id:'forge-yard',name:'Forge Yard',centre:forge,radius:7},
                {id:'beast-pens',name:'Beast Pens',centre:beast,radius:7},
                {id:'fighting-pit',name:'Fighting Pit',centre:pit,radius:7},
                {id:'trophy-ground',name:'Trophy Ground',centre:shrine,radius:6},
            ],
        });
        return {centre:{...c},forge,beast,pit,shrine,populationTarget:110};
    }

    function goblinBuilding(c) {
        const radius=11;
        const b={minQ:c.q-radius,maxQ:c.q+radius,minR:c.r-radius,maxR:c.r+radius,floors:[],greenskinWarren:true};
        b.floors[-1]={terrain:{},tileObjects:{}};
        // Unlike the elven air layer, underground absence is solid rock.
        for(let q=b.minQ;q<=b.maxQ;q++) for(let r=b.minR;r<=b.maxR;r++) b.floors[-1].terrain[`${q},${r}`]='Wall';
        window.multiStoryBuildings.push(b);
        return b;
    }

    function carveWarrenRoom(b,c,radius=3) {
        const f=b.floors[-1];
        for(let dq=-radius;dq<=radius;dq++) for(let dr=-radius;dr<=radius;dr++) {
            const h={q:c.q+dq,r:c.r+dr};
            if(dist(c,h)<=radius) f.terrain[key(h)]='Cave Floor';
        }
    }

    function tunnel(b,a,z) {
        const f=b.floors[-1]; let cur={...a},guard=0;
        while(dist(cur,z)>0&&guard++<60) {
            f.terrain[key(cur)]='Cave Floor';
            const ns=window.getNeighbors?.(cur.q,cur.r)||[];
            cur=ns.sort((x,y)=>dist(x,z)-dist(y,z))[0]||cur;
        }
        f.terrain[key(z)]='Cave Floor';
    }

    function addGoblinResident(name,title,hex,floor=0) {
        if(window.entities?.some(e=>e.name===name)||typeof window.createMonster!=='function') return;
        const e=window.createMonster('goblin',hex,null,null,'neutral');
        e.name=name; e.title=title; e.isNPC=true; e.factionId='goblin_tribe'; e.dialogueId='goblin_camp_resident';
        e.homeSettlementId='skarn_tooth_outpost'; e.occupation=title; e.aiState='idle'; e.floor=floor;
        window.entities.push(e);
    }

    function expandGoblinOutpost() {
        const c=window.campaign2GoblinCampCenter;
        if(!c) return null;
        // Surface remains a forward camp: scavenged commerce and sleeping
        // shelters extend it, but no grand walls or civic plan appear.
        const bazaar={q:c.q+8,r:c.r+2};
        const cook={q:c.q-7,r:c.r+4};
        const scrap={q:c.q+4,r:c.r-8};
        paintBlob(bazaar,3,'Dirt',71); paintBlob(cook,3,'Dirt',83); paintBlob(scrap,3,'Dirt',97);
        window.tileObjects[key(bazaar)]={type:'crate'};
        window.tileObjects[key({q:bazaar.q+1,r:bazaar.r})]={type:'table'};
        window.tileObjects[key(cook)]={type:'fireplace',lightRadius:5};
        window.tileObjects[key(scrap)]={type:'anvil'};
        [[7,5],[10,-2],[-8,7],[-10,2],[6,-10],[1,-11]].forEach(([dq,dr])=>{
            const h={q:c.q+dq,r:c.r+dr}; if(!window.tileObjects[key(h)]) window.tileObjects[key(h)]={type:'hut'};
        });

        // Hidden warren: cramped communal chamber, stash room and escape den,
        // with two surface openings. This is not dwarven monumental planning;
        // tunnels bend between opportunistically enlarged pockets.
        const b=goblinBuilding(c);
        const common={q:c.q,r:c.r};
        const stash={q:c.q+7,r:c.r-4};
        const den={q:c.q-7,r:c.r+5};
        carveWarrenRoom(b,common,4); carveWarrenRoom(b,stash,3); carveWarrenRoom(b,den,3);
        tunnel(b,common,stash); tunnel(b,common,den);
        b.floors[-1].tileObjects[key(common)]={type:'fireplace',lightRadius:4};
        b.floors[-1].tileObjects[key(stash)]={type:'storage_chest',items:[]};
        b.floors[-1].tileObjects[key({q:den.q+1,r:den.r})]={type:'bed'};
        b.floors[-1].tileObjects[key({q:den.q-1,r:den.r})]={type:'bed'};

        const main={q:c.q+1,r:c.r+1};
        const escape={q:c.q-9,r:c.r+7};
        window.tileObjects[key(main)]={type:'stair_down',toFloor:-1};
        b.floors[-1].terrain[key(main)]='Cave Floor';
        b.floors[-1].tileObjects[key(main)]={type:'stair_up',toFloor:0};
        window.setTerrainAt(escape.q,escape.r,'Dirt');
        window.tileObjects[key(escape)]={type:'stair_down',toFloor:-1};
        b.floors[-1].terrain[key(escape)]='Cave Floor';
        b.floors[-1].tileObjects[key(escape)]={type:'stair_up',toFloor:0};
        tunnel(b,den,escape);

        addGoblinResident('Nib Coppernose','Scavenger',{q:bazaar.q,r:bazaar.r+1});
        addGoblinResident('Skit Emberpot','Cook',{q:cook.q,r:cook.r+1});
        addGoblinResident('Vekk Bentnail','Tinker',{q:scrap.q,r:scrap.r+1});
        addGoblinResident('Mog Underroot','Warren Keeper',{q:common.q,r:common.r+1},-1);

        window.SettlementScale?.register?.({
            id:'skarn_tooth_outpost',name:'Skarn-tooth Outpost',tier:'hamlet',centre:c,populationTarget:40,radius:22,
            districts:[
                {id:'surface-camp',name:'Surface Camp',centre:c,radius:12},
                {id:'scavenger-row',name:'Scavenger Row',centre:bazaar,radius:5},
                {id:'warren',name:'Underroot Warren',centre:common,floor:-1,radius:11},
            ],
        });
        window.campaign2GoblinWarrenBuilding=b;
        window.campaign2GoblinWarrenMain=main;
        window.campaign2GoblinWarrenEscape=escape;
        return {centre:{...c},bazaar,cook,scrap,building:b,main,escape,populationTarget:40};
    }

    function expand() {
        if(expanded) return true;
        if(!window.campaign2OrcStrongholdCenter&&!window.campaign2GoblinCampCenter) return false;
        const orc=expandOrcHold(); const goblin=expandGoblinOutpost();
        window.GreenskinSettlementRegistry={orc,goblin};
        expanded=!!(orc||goblin); return expanded;
    }

    function reset(){expanded=false;delete window.GreenskinSettlementRegistry;delete window.campaign2GoblinWarrenBuilding;}

    function installWorldWrapper() {
        if(installed) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function') return false;
        if(original.__greenskinSettlementExpansion){installed=true;return true;}
        const wrapped=function(...args){
            reset(); const result=original.apply(this,args);
            if(expand()) {
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.(); window.renderEntities?.();
            }
            return result;
        };
        wrapped.__greenskinSettlementExpansion=true; wrapped.__original=original;
        window.setupVillageScene=wrapped; installed=true; return true;
    }

    function install(){installWorldWrapper();if(window.currentCampaign!=='2')return false;if(!expanded)expand();return expanded;}
    window.GreenskinSettlementExpansion={install,expand,reset,get stats(){return{installed,expanded,orc:!!window.GreenskinSettlementRegistry?.orc,goblin:!!window.GreenskinSettlementRegistry?.goblin};}};
    if(!install()){const t=setInterval(()=>{if(install())clearInterval(t);},25);setTimeout(()=>clearInterval(t),5000);}
})();