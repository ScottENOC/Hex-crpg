// millbrookContent.js
// Content pass for the Millbrook physical expansion. The village should reward
// opening doors: every new cottage/public building gets a named resident and a
// small piece of authored dialogue, information, humour or plot texture.
(() => {
    'use strict';

    const BOOT_MS = 700;
    let lastFirstBuilding = null;
    let residents = [];

    const specs = {
        'millbrook-inn': { name:'Edda Crowl', title:'Innkeeper', gender:'female', dialogueId:'millbrook_innkeeper', color:'#9b7358' },
        'millbrook-smithy': { name:'Bran Tallow', title:'Village Smith', gender:'male', dialogueId:'millbrook_smith', color:'#6f6254' },
        'millbrook-chapel': { name:'Brother Cale', title:'Chapel Keeper', gender:'male', dialogueId:'millbrook_chapel_keeper', color:'#89836e' },
        'millbrook-barn': { name:'Marda Pell', title:'Storehouse Keeper', gender:'female', dialogueId:'millbrook_storehouse', color:'#8b7456' },
        'millbrook-home-1': { name:'Iven Noll', title:'Charcoal Burner', gender:'male', dialogueId:'millbrook_iven', color:'#726557' },
        'millbrook-home-2': { name:'Rilla Noll', title:'Mender', gender:'female', dialogueId:'millbrook_rilla', color:'#8d6f65' },
        'millbrook-home-3': { name:'Tom Ewer', title:'Goatherd', gender:'male', dialogueId:'millbrook_tom', color:'#7d725c' },
        'millbrook-home-4': { name:'Mae Ewer', title:'Cheesemaker', gender:'female', dialogueId:'millbrook_mae', color:'#9a8264' },
        'millbrook-home-5': { name:'Elsin Ward', title:'Retired Scout', gender:'female', dialogueId:'millbrook_elsin', color:'#68705d' },
        'millbrook-home-6': { name:'Pate Durn', title:'Woodcutter', gender:'male', dialogueId:'millbrook_pate', color:'#6f634f' },
        'millbrook-home-7': { name:'Sella Durn', title:'Herb Gatherer', gender:'female', dialogueId:'millbrook_sella', color:'#758167' },
        'millbrook-home-8': { name:'Nim Orrel', title:'Tinker', gender:'male', dialogueId:'millbrook_nim', color:'#7c7062' },
    };

    function quest(id) { return (window.questLog || []).find(q => q.id === id); }

    function installDialogues() {
        const trees=window.npcDialogueTrees;
        if(!trees) return false;
        if(trees.millbrook_innkeeper?.__millbrookContent) return true;

        trees.millbrook_innkeeper=(npc)=>window.showDialogue(npc,
            "The Northbound Hare. Beds upstairs, stew downstairs, leaks everywhere the rain can find. Luxury by Millbrook standards.",[
                {label:'Who comes through here?',action:()=>window.showDialogue(npc,
                    "Teamsters for Silverhart, levy riders for the border, pilgrims when the roads are kind. Lately the soldiers outnumber everyone else.",[{label:'The border is that bad?',action:()=>{}}])},
                {label:'Any local advice?',action:()=>window.showDialogue(npc,
                    "If Petra Hollis tells you to pack extra socks, pack extra socks. Quartermasters survive wars by being right about boring things.",[{label:'Noted.',action:()=>{}}])},
                {label:'Maybe later.',action:()=>{}}
            ]);
        trees.millbrook_innkeeper.__millbrookContent=true;

        trees.millbrook_smith=(npc)=>window.showDialogue(npc,
            "Mostly shoeing horses and straightening bent farm iron. These days I mend spearheads too. Same metal, worse reason.",[
                {label:'For the northern levy?',action:()=>window.showDialogue(npc,
                    "Aye. Wagons come south with broken kit and fewer men than went north. Nobody calls that news because saying it aloud makes it real.",[{label:'That tells me enough.',action:()=>{}}])},
                {label:'Anything strange in the hills?',action:()=>window.showDialogue(npc,
                    quest('dragon_hunt') ? "Ask the hunters. I'm done laughing at scorch marks since people started finding them where no campfire was." : "Hunters tell stories. Smiths charge them for repairing whatever the story broke.",[{label:'Fair.',action:()=>{}}])},
                {label:'Leave him to the forge.',action:()=>{}}
            ]);

        trees.millbrook_chapel_keeper=(npc)=>window.showDialogue(npc,
            "Small chapel, small bell, large list of people who ask the gods to keep someone safe on the northern road.",[
                {label:'I noticed a silver flame scratched into the lintel.',action:()=>window.showDialogue(npc,
                    "Older than me. Travelling brothers used that mark before their order had a proper chapterhouse. You'll see finer versions in Silverhart. This one matters because somebody carved it when this was wilderness.",[{label:'A breadcrumb from the old road.',action:()=>{}}])},
                {label:'Anyone I should pray for?',action:()=>window.showDialogue(npc,
                    "Everyone north of here. If the gods charge by the name, I'll owe them money.",[{label:'Efficient theology.',action:()=>{}}])},
                {label:'Leave quietly.',action:()=>{}}
            ]);

        trees.millbrook_storehouse=(npc)=>window.showDialogue(npc,
            "Grain, lamp oil, tack, salt. Petra counts what the army needs; I count what remains after the army discovers it needs ours.",[
                {label:'Are supplies tight?',action:()=>window.showDialogue(npc,
                    "Not starving-tight. Annoying-tight. The distinction is whether people complain about porridge or stop having porridge.",[{label:'A useful distinction.',action:()=>{}}])},
                {label:'What goes north most?',action:()=>window.showDialogue(npc,
                    "Oats, arrows, bandages. You can learn a lot about a war from a storehouse without seeing a battlefield.",[{label:'I suppose you can.',action:()=>{}}])},
                {label:'Carry on.',action:()=>{}}
            ]);

        const simple={
            millbrook_iven:["Charcoal smoke follows you home. My wife says I smell like a chimney. I say chimneys don't complain this much.","What uses all the charcoal?","Smithy first. Travellers second. Army when it remembers fire exists."],
            millbrook_rilla:["If a coat survives one winter here, it deserves repairing. If it survives two, it gets a name.","Do soldiers bring work?","Too much. Torn cloaks, split packs, straps cut in a hurry. Cloth tells stories people won't."],
            millbrook_tom:["Goats don't care about border wars. Sensible creatures. They care about fences and eating things I own.","Anything unusual lately?","They won't graze the high eastern slope after dusk. Probably wolves. Probably."],
            millbrook_mae:["Cheese keeps longer than courage and travels better than soup. That's why soldiers buy mine.","Business is good, then?","I prefer customers who come back for more, not replacements wearing the same badge."],
            millbrook_elsin:["Used to scout the north road. Knees retired before I did.","What should I watch for?","Silence. Birds know trouble before patrols do. If a wood goes quiet, don't congratulate yourself on the peace."],
            millbrook_pate:["Trees are honest. Lean wrong, cut wrong, they kill you. People usually take longer to explain why.","How is the forest?","Too many fresh axe marks north-east, not ours. Could be soldiers. Could be something building."],
            millbrook_sella:["Yarrow, feverfew, willow bark. Half of healing is knowing what grows under your boots.","And the other half?","Convincing injured men that ale is not a dosage unit."],
            millbrook_nim:["Pots, buckles, lanterns, hinges. I fix everything except marriages and royal policy; both require specialist tools.","Hear much on the road?","Enough. Reddale talks trade, Silverhart talks court, Millbrook talks weather. The border patrols mostly don't talk."],
        };
        Object.entries(simple).forEach(([id,[intro,label,reply]])=>{
            trees[id]=(npc)=>window.showDialogue(npc,intro,[
                {label,action:()=>window.showDialogue(npc,reply,[{label:'Thanks.',action:()=>{}}])},
                {label:'Good day.',action:()=>{}}
            ]);
        });
        return true;
    }

    function occupantHex(building) {
        const floors=building?.region?.floorHexes || [];
        const occupied=new Set((window.entities||[]).filter(e=>e.hex).map(e=>`${e.hex.q},${e.hex.r}`));
        return floors.find(h=>!window.tileObjects?.[`${h.q},${h.r}`]&&!occupied.has(`${h.q},${h.r}`))
            || floors.find(h=>!occupied.has(`${h.q},${h.r}`))
            || building?.center;
    }

    function populate() {
        const registry=window.MillbrookSettlementRegistry;
        if(!registry?.buildings?.length || !window.buildNPC || !installDialogues()) return false;
        if(registry.buildings[0]===lastFirstBuilding && residents.length) return true;
        residents=[];
        for(const building of registry.buildings) {
            const spec=specs[building.id];
            if(!spec) continue;
            let npc=(window.entities||[]).find(e=>e.name===spec.name);
            if(!npc) {
                npc=window.buildNPC({
                    name:spec.name,title:spec.title,race:'human',gender:spec.gender,
                    classLevels:[],skillPicks:[],equipment:[],side:'neutral',factionId:'silverhart_kingdom',
                    color:spec.color,dialogueId:spec.dialogueId,hex:{...occupantHex(building)}
                });
                npc.millbrookResident=true;npc.millbrookBuildingId=building.id;
                window.entities.push(npc);
            }
            building.residentName=spec.name;
            building.contentType='dialogue';
            residents.push(npc);
        }
        registry.residents=residents;
        Object.defineProperties(registry,{
            contentCoveredBuildings:{configurable:true,get(){return this.buildings.filter(b=>b.contentType&&b.residentName).length;}},
            contentCoverage:{configurable:true,get(){return this.buildings.length?this.contentCoveredBuildings/this.buildings.length:0;}}
        });
        lastFirstBuilding=registry.buildings[0];
        return residents.length===registry.buildings.length;
    }

    window.MillbrookContent={
        install:populate,installDialogues,
        get residents(){return residents;},
        get stats(){return{residents:residents.length,coverage:window.MillbrookSettlementRegistry?.contentCoverage||0};}
    };
    installDialogues();populate();
    window.__millbrookContentTimer=setInterval(populate,BOOT_MS);
})();