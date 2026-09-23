// farmsteadExpansion.js
// Makes Old Mac's roadside farm read as a small working household rather than
// a lone NPC plus two sheep. Permanent geography is folded into Campaign 2's
// deterministic world build so save/load never treats it as player edits.
(() => {
    'use strict';

    let worldWrapperInstalled = false;
    let expanded = false;
    const residentNames = ['Maeve Mac','Nell Mac','Tobin Mac','Jory Pike','Hettie Vale'];

    const key = h => `${h.q},${h.r}`;
    const distance = (a,b) => typeof window.distance === 'function'
        ? window.distance(a,b)
        : Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));

    function floorHexes(center, halfW, halfH) {
        const out=[];
        for (let dq=-halfW+1; dq<=halfW-1; dq++) {
            const shift=-Math.floor(dq/2);
            for (let dr=-halfH+1; dr<=halfH-1; dr++) out.push({q:center.q+dq,r:center.r+dr+shift});
        }
        return out;
    }

    function wallRing(floors) {
        const set=new Set(floors.map(key));
        const out=new Map();
        floors.forEach(h => (window.getNeighbors?.(h.q,h.r)||[]).forEach(n => { if (!set.has(key(n))) out.set(key(n),n); }));
        return [...out.values()];
    }

    function carveOutbuilding(id, center, halfW=3, halfH=2, floorType='Dirt') {
        const floors=floorHexes(center,halfW,halfH);
        const ring=wallRing(floors);
        const farm=window.campaign2FarmHouseCenter;
        const door=ring.reduce((best,h)=>distance(h,farm)<distance(best,farm)?h:best,ring[0]);
        ring.forEach(h=>window.setTerrainAt(h.q,h.r,'Wall'));
        floors.forEach(h=>window.setTerrainAt(h.q,h.r,floorType));
        window.setTerrainAt(door.q,door.r,floorType);
        window.tileObjects[key(door)]={type:'door_open',lightRadius:0};
        const region={
            minQ:Math.min(...floors.map(h=>h.q)),maxQ:Math.max(...floors.map(h=>h.q)),
            minR:Math.min(...floors.map(h=>h.r)),maxR:Math.max(...floors.map(h=>h.r)),
            lightMult:0.45,doorHex:{...door},floorHexes:floors,
            wallHexes:ring.filter(h=>key(h)!==key(door)),floorType,center:{...center},farmsteadBuildingId:id,
        };
        window.interiorRegions.push(region);
        return {id,center:{...center},door:{...door},region,floors};
    }

    function paintFenceRect(minQ,maxQ,minR,maxR) {
        for (let q=minQ;q<=maxQ;q++) {
            window.tileObjects[`${q},${minR}`]={type:'fence'};
            window.tileObjects[`${q},${maxR}`]={type:'fence'};
        }
        for (let r=minR+1;r<maxR;r++) {
            window.tileObjects[`${minQ},${r}`]={type:'fence'};
            window.tileObjects[`${maxQ},${r}`]={type:'fence'};
        }
    }

    function paintField(id,minQ,maxQ,minR,maxR) {
        for (let q=minQ;q<=maxQ;q++) {
            for (let r=minR;r<=maxR;r++) {
                if (q===minQ||q===maxQ||r===minR||r===maxR) continue;
                window.setTerrainAt(q,r,'Dirt');
                // Sparse row markers make the field read as cultivated without
                // adding a high-cost entity/object per crop plant.
                if ((q+r)%4===0) window.tileObjects[`${q},${r}`]={type:'herb_patch',farmCrop:true,fieldId:id};
            }
        }
        paintFenceRect(minQ,maxQ,minR,maxR);
        return {id,minQ,maxQ,minR,maxR,centre:{q:Math.round((minQ+maxQ)/2),r:Math.round((minR+maxR)/2)}};
    }

    function addAnimal(name,color,hex,hp=5) {
        const e=new window.Entity(name,color,{...hex},10);
        e.hp=hp;e.maxHp=hp;e.side='neutral';e.tags=['animal'];e.isFarmsteadAnimal=true;
        window.entities.push(e);
        return e;
    }

    function addResident(spec,hex,role) {
        const npc=window.buildNPC({
            name:spec.name,title:spec.title,race:'human',gender:spec.gender,
            classLevels:spec.classLevels||[],skillPicks:spec.skillPicks||[],equipment:spec.equipment||[],
            side:'neutral',factionId:'silverhart_kingdom',color:spec.color||'#9b835f',
        });
        npc.hex={...hex};npc.isFarmsteadResident=true;npc.farmsteadRole=role;
        npc.homeHex={...window.campaign2FarmHouseCenter};
        window.entities.push(npc);
        return npc;
    }

    function buildResidents(layout) {
        const h=window.campaign2FarmHouseCenter;
        const people=[
            [{name:'Maeve Mac',title:'Farmer',gender:'female',color:'#8f7958'}, {q:h.q+1,r:h.r+1}, 'family'],
            [{name:'Nell Mac',title:'Farmer',gender:'female',classLevels:['fighter'],skillPicks:['health'],equipment:['dagger'],color:'#a48b64'}, {q:h.q-1,r:h.r+1}, 'family'],
            [{name:'Tobin Mac',title:'Farm Boy',gender:'male',color:'#b9a37a'}, {q:h.q+1,r:h.r-1}, 'family'],
            [{name:'Jory Pike',title:'Farm Hand',gender:'male',classLevels:['fighter'],skillPicks:['health'],equipment:['club'],color:'#7d6b54'}, {q:layout.bunkhouse.door.q,r:layout.bunkhouse.door.r+1}, 'worker'],
            [{name:'Hettie Vale',title:'Farm Hand',gender:'female',classLevels:['fighter'],skillPicks:['health'],equipment:['dagger'],color:'#806f59'}, {q:layout.barn.door.q,r:layout.barn.door.r+1}, 'worker'],
        ];
        people.forEach(([spec,hex,role])=>addResident(spec,hex,role));
    }

    function buildAnimals(h) {
        // Keep the original two sheep; add a modest mixed farm population.
        addAnimal('Dairy Cow','#8b6847',{q:h.q-9,r:h.r+5},12);
        addAnimal('Calf','#a88767',{q:h.q-10,r:h.r+3},7);
        addAnimal('Pig','#c88d86',{q:h.q+7,r:h.r-4},6);
        addAnimal('Pig 2','#d49b91',{q:h.q+8,r:h.r-3},6);
        [{q:h.q+5,r:h.r-6},{q:h.q+6,r:h.r-6},{q:h.q+5,r:h.r-5},{q:h.q+7,r:h.r-5}]
            .forEach((hex,i)=>addAnimal(`Chicken ${i+1}`,'#d7b45c',hex,2));
    }

    function expandFarmstead() {
        if (expanded || window.currentCampaign!=='2' || !window.campaign2FarmHouseCenter || !window.setTerrainAt || !window.buildNPC) return false;
        const h=window.campaign2FarmHouseCenter;

        const barn=carveOutbuilding('old-mac-barn',{q:h.q+8,r:h.r-8},3,2,'Dirt');
        const bunkhouse=carveOutbuilding('old-mac-workers-cottage',{q:h.q+12,r:h.r+2},2,2,'Wood Floor');
        barn.floors.slice(0,3).forEach((p,i)=>{ if (!window.tileObjects[key(p)]) window.tileObjects[key(p)]={type:i===0?'crate':'barrel'}; });
        bunkhouse.floors.slice(0,2).forEach(p=>{ if (!window.tileObjects[key(p)]) window.tileObjects[key(p)]={type:'bed'}; });

        // Two crop plots plus a second grazing paddock. The southeast corner is
        // deliberately left open for the existing authored grain-raiding bear
        // encounter and Reyna Fletcher placement.
        const northField=paintField('old-mac-north-field',h.q-2,h.q+13,h.r-16,h.r-9);
        const southField=paintField('old-mac-south-field',h.q-3,h.q+10,h.r+8,h.r+15);
        paintFenceRect(h.q-14,h.q-6,h.r+2,h.r+10);

        // Short farm tracks connect the new working buildings to the house.
        [barn.door,bunkhouse.door,northField.centre,southField.centre].forEach(target=>{
            let cur={...h};
            for (let i=0;i<18&&distance(cur,target)>1;i++) {
                const ns=window.getNeighbors?.(cur.q,cur.r)||[];
                if (!ns.length) break;
                const next=ns.reduce((best,n)=>distance(n,target)<distance(best,target)?n:best,ns[0]);
                const terrain=window.getTerrainAt?.(next.q,next.r)?.name;
                if (!['Wall','Water','Keep Wall','Palisade Wall'].includes(terrain)) window.setTerrainAt(next.q,next.r,'Path');
                cur=next;
            }
        });

        buildResidents({barn,bunkhouse});
        buildAnimals(h);

        window.campaign2FarmsteadExpansion={
            house:{...h},barn,bunkhouse,fields:[northField,southField],
            residentNames:[...residentNames],population:1+residentNames.length,
            addedAnimals:8,
        };
        expanded=true;
        return true;
    }

    function resetBuildState() {
        expanded=false;
        delete window.campaign2FarmsteadExpansion;
    }

    function installWorldWrapper() {
        if (worldWrapperInstalled) return true;
        const original=window.setupVillageScene;
        if (typeof original!=='function') return false;
        if (original.__farmsteadExpansionWorldBuild) { worldWrapperInstalled=true; return true; }
        const wrapped=function(...args) {
            resetBuildState();
            const result=original.apply(this,args);
            if (expandFarmstead()) {
                window.reconcileRegionWallBookkeeping?.();
                window.reconcileAllRegionFootprints?.();
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
                window.drawMap?.();window.renderEntities?.();
            }
            return result;
        };
        wrapped.__farmsteadExpansionWorldBuild=true;
        wrapped.__original=original;
        window.setupVillageScene=wrapped;
        worldWrapperInstalled=true;
        return true;
    }

    // Tiny routine layer: only five farm residents, and only while their farm
    // chunk is hot. Offscreen they stop receiving movement destinations.
    function updateRoutines() {
        if (window.currentCampaign!=='2' || !window.campaign2FarmsteadExpansion) return;
        const h=window.campaign2FarmHouseCenter;
        const hot=window.WorldChunkStreaming?.isHexActive?.(h,0) ?? true;
        const hour=((Number(window.worldSeconds||0)/3600)%24+24)%24;
        const fields=window.campaign2FarmsteadExpansion.fields;
        (window.entities||[]).filter(e=>e?.isFarmsteadResident).forEach((e,i)=>{
            if (!hot) { e.destinationHex=null; return; }
            let target=h;
            if (hour>=6&&hour<12) target=i<3?fields[0].centre:window.campaign2FarmsteadExpansion.barn.door;
            else if (hour>=13&&hour<18) target=i%2?fields[1].centre:window.campaign2FarmsteadExpansion.barn.door;
            else if (hour>=18&&hour<20) target={q:h.q-7,r:h.r+5};
            e.destinationHex={...target};
        });
    }

    window.FarmsteadExpansion={expandFarmstead,installWorldWrapper,updateRoutines,get stats(){return {expanded,worldWrapperInstalled,...(window.campaign2FarmsteadExpansion||{})};}};

    if (!installWorldWrapper()) {
        const t=setInterval(()=>{if(installWorldWrapper())clearInterval(t);},25);
        setTimeout(()=>clearInterval(t),5000);
    }
    window.__farmsteadRoutineTimer=setInterval(updateRoutines,2000);
})();