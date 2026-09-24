// emberlodeExpansion.js
// Builds around Emberlode's existing foreman's hall, bunkhouse and mine so the
// mining village feels inhabited without replacing its authored goblin/escort
// quest chain. Every added enterable building has a named resident with
// dialogue: exploration should reveal people, rumours and useful context rather
// than rows of empty decorative interiors.
(() => {
    'use strict';

    const BOOT_MS = 1200;
    const TARGET_POPULATION = 52;
    const buildings = [];
    const residents = [];
    let installed = false;
    let expanded = false;

    const key = h => `${h.q},${h.r}`;
    const centre = () => window.campaign2EmberlodeCenter || null;
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
        if ((window.interiorRegions||[]).some(r => {
            const rc=r.center || r.doorHex || (Number.isFinite(r.minQ)?{q:(r.minQ+r.maxQ)/2,r:(r.minR+r.maxR)/2}:null);
            return rc && distance(c,rc)<6;
        })) return false;
        return [...floors,...ring].every(h => !blockedTerrain(window.getTerrainAt?.(h.q,h.r)?.name) && !window.tileObjects?.[key(h)]);
    }

    function findSite(desired, halfW=2, halfH=2, maxRadius=12) {
        if(canBuild(desired,halfW,halfH)) return desired;
        for(let radius=1;radius<=maxRadius;radius++) {
            for(let dq=-radius;dq<=radius;dq++) for(let dr=-radius;dr<=radius;dr++) {
                const h={q:desired.q+dq,r:desired.r+dr};
                if(distance(desired,h)!==radius) continue;
                if(canBuild(h,halfW,halfH)) return h;
            }
        }
        return null;
    }

    function chooseDoor(ring) {
        const roads=ring.filter(h => (window.getNeighbors?.(h.q,h.r)||[])
            .some(n=>window.getTerrainAt?.(n.q,n.r)?.name==='Path'));
        if(roads.length) return roads[0];
        const c=centre();
        return ring.reduce((best,h)=>distance(h,c)<distance(best,c)?h:best,ring[0]);
    }

    function connectDoor(door,maxSteps=9) {
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

    const residentSpecs = {
        assay: {
            name:'Mara Quill', title:'Mine Assayer', gender:'female', dialogueId:'emberlode_assayer', color:'#8f7a61'
        },
        smithy: {
            name:'Hobb Fen', title:'Toolsmith', gender:'male', dialogueId:'emberlode_toolsmith', color:'#75624f'
        },
        store: {
            name:'Dorrin Slate', title:'Supply Keeper', gender:'male', dialogueId:'emberlode_supply_keeper', color:'#8a7959'
        },
        alehouse: {
            name:'Tansy Pike', title:'Alewife', gender:'female', dialogueId:'emberlode_alewife', color:'#9a6852'
        },
        shrine: {
            name:'Sister Anwen', title:'Shrine Keeper', gender:'female', dialogueId:'emberlode_shrine_keeper', color:'#8e8b79'
        },
        'home-1': {
            name:'Jory Kest', title:'Retired Miner', gender:'male', dialogueId:'emberlode_jory', color:'#77705d'
        },
        'home-2': {
            name:'Elka Marrow', title:'Ore Sorter', gender:'female', dialogueId:'emberlode_elka', color:'#8e735f'
        },
        'home-3': {
            name:'Perrin Doss', title:'Timberman', gender:'male', dialogueId:'emberlode_perrin', color:'#756b55'
        },
        'home-4': {
            name:'Nessa Vane', title:'Washerwoman', gender:'female', dialogueId:'emberlode_nessa', color:'#8b766c'
        },
        'home-5': {
            name:'Cal Wren', title:'Cart Driver', gender:'male', dialogueId:'emberlode_cal', color:'#746452'
        },
    };

    function goblinState() {
        const q=(window.questLog||[]).find(x=>x.id==='goblin_threat');
        if(window.emberlodeRaided) return 'raided';
        if(!q || q.status!=='completed') return 'threat';
        if(q.resolution==='goblin_diplomacy') return 'peace';
        if(q.resolution==='betrayal') return 'betrayal';
        return 'cleared';
    }

    function installDialogues() {
        if(!window.npcDialogueTrees) return false;
        const trees=window.npcDialogueTrees;
        if(trees.emberlode_assayer?.__emberlodeExpansion) return true;

        trees.emberlode_assayer=(npc)=>{
            const state=goblinState();
            const intro=state==='raided'
                ? "They took the stamped bars, not the raw rock. Goblins learn economics quickly when economics comes in portable ingots."
                : "Every cart gets weighed twice: once by the mine, once by me. Corran trusts miners. He trusts arithmetic more.";
            window.showDialogue(npc,intro,[
                {label:'Anything unusual coming out of the mine?',action:()=>window.showDialogue(npc,
                    "Deep seam's throwing pale glassy inclusions we never saw in the old workings. Worth nothing to a smith, but a travelling scholar paid silver for three chips and refused to say why.",
                    [{label:'A scholar buying worthless stone. Interesting.',action:()=>{}}])},
                {label:'How is trade?',action:()=>window.showDialogue(npc,
                    state==='threat' ? "Bad. Ore is easy to dig and hard to sell when teamsters think the road eats wagons." : "Moving again. When the road is safe, Emberlode remembers it exists to sell stone, not admire it.",
                    [{label:'Fair enough.',action:()=>{}}])},
                {label:'Leave her to the figures.',action:()=>{}}
            ]);
        };
        trees.emberlode_assayer.__emberlodeExpansion=true;

        trees.emberlode_toolsmith=(npc)=>window.showDialogue(npc,
            "I don't make heroes' swords. I make wedges, picks, hinges and the little iron pins that stop a loaded ore cart becoming a funeral.",[
                {label:'What breaks most?',action:()=>window.showDialogue(npc,
                    "Handles. Then pride. Handles are cheaper.",[{label:'Useful ordering.',action:()=>{}}])},
                {label:'Heard anything from the deeper workings?',action:()=>window.showDialogue(npc,
                    "Bettina says the old supports down there predate this village. I told her timber doesn't care who cut it. Still... some of those joints aren't ours.",[{label:'Old workings?',action:()=>{}}])},
                {label:'Carry on.',action:()=>{}}
            ]);

        trees.emberlode_supply_keeper=(npc)=>window.showDialogue(npc,
            goblinState()==='raided'
                ? "Inventory says I have eleven coils of rope. Reality says goblins have eleven coils of rope. I am learning which ledger wins arguments."
                : "Lamp oil, rope, salt, nails. Nothing glamorous, which is how you know everyone needs it.",[
                {label:'What is hardest to keep stocked?',action:()=>window.showDialogue(npc,
                    "Lamp oil when the road is bad. Salt when winter closes in. Patience every day of the year.",[{label:'Sounds universal.',action:()=>{}}])},
                {label:'Good luck with the inventory.',action:()=>{}}
            ]);

        trees.emberlode_alewife=(npc)=>window.showDialogue(npc,
            "Welcome to the Crooked Pick. It was straight when we hung it up. That tells you what the ale does.",[
                {label:'What are people talking about?',action:()=>{
                    const state=goblinState();
                    const text=state==='threat'
                        ? "Road, goblins, missing wagons. Then the road again. Fear makes for repetitive conversation."
                        : state==='raided'
                            ? "Mostly how brave everyone was after the goblins left. Remarkable number of heroes hid under my tables."
                            : "The reopened road, better shifts, and Mara's mysterious stone-buying scholar. In roughly that order.";
                    window.showDialogue(npc,text,[{label:'That last one is interesting.',action:()=>{}}]);
                }},
                {label:'Why the Crooked Pick?',action:()=>window.showDialogue(npc,
                    "Because 'The Occupational Lung Complaint' tested poorly with travellers.",[{label:'Hard to imagine why.',action:()=>{}}])},
                {label:'Another time.',action:()=>{}}
            ]);

        trees.emberlode_shrine_keeper=(npc)=>window.showDialogue(npc,
            "We keep no grand relics here. Just names. Every miner who did not come back up gets one carved into the beam.",[
                {label:'There are older names under the newer ones.',action:()=>window.showDialogue(npc,
                    "Yes. Found beneath whitewash when the shrine was repaired. Nobody in Emberlode remembers those families. Some are written in letters even I cannot read.",[{label:'How old is this place?',action:()=>{}}])},
                {label:'Pay respects.',action:()=>window.showMessage('You stand quietly before the memorial beam.')},
                {label:'Leave.',action:()=>{}}
            ]);

        trees.emberlode_jory=(npc)=>window.showDialogue(npc,
            "Thirty-two years underground and now the roof over my bed creaks louder than any mine. Typical.",[
                {label:'Any advice for the mine?',action:()=>window.showDialogue(npc,"If the rats run past you toward daylight, don't stop to ask what frightened them.",[{label:'Practical.',action:()=>{}}])},
                {label:'Good day.',action:()=>{}}
            ]);
        trees.emberlode_elka=(npc)=>window.showDialogue(npc,
            "Bettina's my sister. She goes underground; I sort what comes back. Mother says between us we make one sensible daughter.",[
                {label:'Does Bettina take too many risks?',action:()=>window.showDialogue(npc,"Yes. Tell her I said no and she'll know I'm lying.",[{label:'Family diplomacy.',action:()=>{}}])},
                {label:'See you.',action:()=>{}}
            ]);
        trees.emberlode_perrin=(npc)=>window.showDialogue(npc,
            "Everyone watches the ore. I watch the beams holding several thousand tons of mountain above it. We have different definitions of valuable.",[
                {label:'Those old supports worry you?',action:()=>window.showDialogue(npc,"The old ones are excellent. That's what worries me. Whoever built them knew work we don't.",[{label:'Another old-workings clue.',action:()=>{}}])},
                {label:'Stay safe.',action:()=>{}}
            ]);
        trees.emberlode_nessa=(npc)=>window.showDialogue(npc,
            "Mine dust gets into shirts, sheets, soup and marriages. I can wash three of those.",[
                {label:'Which three?',action:()=>window.showDialogue(npc,"Depends how much you're paying.",[{label:'Fair answer.',action:()=>{}}])},
                {label:'Leave her to it.',action:()=>{}}
            ]);
        trees.emberlode_cal=(npc)=>window.showDialogue(npc,
            goblinState()==='threat'
                ? "My cart's ready. My horse is ready. I am waiting for the road to become less interested in killing us."
                : "First wagon went through without losing a wheel, horse or driver. Around here that's practically a festival.",[
                {label:'How is the road beyond Hollowmere?',action:()=>window.showDialogue(npc,
                    "Better south. Northbound teamsters talk about levy columns and border trouble. If you're heading that way, expect soldiers to have bought all the cheap oats.",[{label:'Useful to know.',action:()=>{}}])},
                {label:'Safe travels.',action:()=>{}}
            ]);
        return true;
    }

    function spawnResident(spec, hex, buildingId) {
        if(!spec || !window.buildNPC) return null;
        const existing=window.entities?.find(e=>e.name===spec.name);
        if(existing) return existing;
        const npc=window.buildNPC({
            name:spec.name,title:spec.title,race:'human',gender:spec.gender,
            classLevels:[],skillPicks:[],equipment:[],side:'neutral',
            factionId:'silverhart_kingdom',color:spec.color,dialogueId:spec.dialogueId,
            hex:{...hex}
        });
        npc.emberlodeResident=true;
        npc.emberlodeBuildingId=buildingId;
        window.entities.push(npc);
        residents.push(npc);
        return npc;
    }

    function carve(spec) {
        const halfW=spec.large?3:2, halfH=2;
        const site=findSite(spec.center,halfW,halfH,spec.searchRadius||12);
        if(!site) return null;
        const floors=floorHexes(site,halfW,halfH), ring=wallRing(floors), door=chooseDoor(ring);
        ring.forEach(h=>window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,'Wood Floor'));
        window.setTerrainAt(door.q,door.r,'Wood Floor');
        window.tileObjects[key(door)]={type:'door_open',lightRadius:0};
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:0.3,doorHex:{...door},floorHexes:floors,
            wallHexes:ring.filter(h=>key(h)!==key(door)),floorType:'Wood Floor',center:{...site},
            emberlodeBuildingId:spec.id,emberlodeBuildingKind:spec.kind,
        };
        window.interiorRegions.push(region);
        const prop=floors.find(h=>distance(h,door)>1&&!window.tileObjects[key(h)]) || floors[0];
        const props={assay:'table',smithy:'anvil',store:'crate',alehouse:'table',shrine:'altar',cottage:'fireplace'};
        window.tileObjects[key(prop)]={type:props[spec.kind]||'table',lightRadius:spec.kind==='cottage'?4:0};
        const residentHex=floors.find(h=>key(h)!==key(prop)&&distance(h,door)>0&&!window.tileObjects[key(h)]) || floors[floors.length-1];
        const entry={...spec,center:{...site},door:{...door},region,residentName:spec.resident?.name||null,contentType:'dialogue'};
        buildings.push(entry);
        spawnResident(spec.resident,residentHex,spec.id);
        connectDoor(door);
        return entry;
    }

    function expand() {
        if(expanded || !centre() || !window.setTerrainAt || !window.interiorRegions) return false;
        installDialogues();
        const c=centre();
        buildings.length=0;residents.length=0;
        const specs=[
            ['assay','assay',-13,-8,true],['smithy','smithy',12,-9,true],['store','store',15,5,true],
            ['alehouse','alehouse',10,15,true],['shrine','shrine',-13,15,false],
            ['home-1','cottage',-20,-1,false],['home-2','cottage',21,-2,false],['home-3','cottage',20,14,false],
            ['home-4','cottage',-20,13,false],['home-5','cottage',-4,22,false],
        ];
        for(const [id,kind,q,r,large] of specs) carve({
            id:`emberlode-${id}`,kind,center:{q:c.q+q,r:c.r+r},large,
            resident:residentSpecs[id],searchRadius:14
        });

        window.campaign2EmberlodePopulationTarget=TARGET_POPULATION;
        window.SettlementScale?.register?.({id:'emberlode',name:'Emberlode',tier:'village',centre:c,populationTarget:TARGET_POPULATION,radius:58});
        window.EmberlodeSettlementRegistry={
            centre:{...c},buildings,residents,populationTarget:TARGET_POPULATION,
            existingAnchors:['foremans-hall','bunkhouse','mine'],
            get dwellings(){return buildings.filter(b=>b.kind==='cottage').length;},
            get publicBuildings(){return buildings.filter(b=>b.kind!=='cottage').length;},
            get contentCoveredBuildings(){return buildings.filter(b=>b.contentType&&b.residentName).length;},
            get contentCoverage(){return buildings.length ? this.contentCoveredBuildings/buildings.length : 0;},
        };
        expanded=true;
        return true;
    }

    function reset() {
        expanded=false;buildings.length=0;residents.length=0;
        delete window.EmberlodeSettlementRegistry;
        delete window.campaign2EmberlodePopulationTarget;
    }

    function installWorldWrapper() {
        if(installed) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function') return false;
        if(original.__emberlodeExpansion){installed=true;return true;}
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
        wrapped.__emberlodeExpansion=true;wrapped.__original=original;
        window.setupVillageScene=wrapped;installed=true;return true;
    }

    function install(){
        installDialogues();installWorldWrapper();
        if(window.currentCampaign!=='2'||!centre()) return false;
        if(!expanded) expand();
        return expanded;
    }

    window.EmberlodeExpansion={
        install,expand,reset,installWorldWrapper,installDialogues,
        get buildings(){return buildings;},get residents(){return residents;},
        get stats(){return{installed,expanded,buildings:buildings.length,residents:residents.length,populationTarget:TARGET_POPULATION,contentCoverage:window.EmberlodeSettlementRegistry?.contentCoverage||0};}
    };

    if(!installWorldWrapper()) {
        const t=setInterval(()=>{if(installWorldWrapper())clearInterval(t);},25);
        setTimeout(()=>clearInterval(t),5000);
    }
    window.__emberlodeExpansionTimer=setInterval(install,BOOT_MS);
    install();
})();