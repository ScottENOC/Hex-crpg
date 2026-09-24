// npcReliability.js
// Shared hardening for generated settlement NPCs: finish appearance before
// first render/dialogue, keep civilians clear of doors, support real baldness,
// and give otherwise-silent NPCs lightweight small talk.
(() => {
    'use strict';

    const DOOR_CLEARANCE_RADIUS = 1;
    const MALE_BALD_CHANCE = 0.06;
    const BLOCKED_TERRAIN = new Set(['Wall','Water','Palisade Wall','Keep Wall','Stone Wall']);
    const DOOR_TYPES = new Set(['door_open','door_closed']);
    const styledEntities = new WeakSet();
    let talkWrapperInstalled=false, dialogueWrapperInstalled=false, renderWrapperInstalled=false;
    let creatorInstalled=false, previewWrapperInstalled=false, maintenancePasses=0, doorwayMoves=0;

    const SMALL_TALK = {
        generic: [
            "Roads have been busy lately. That's usually good news, until it isn't.",
            "If you're travelling far, fill your water skin before you leave town.",
            "Everyone's heard a different version of what happened on the road. I trust about half of any of them.",
            "Funny thing about a quiet day: you don't notice how valuable it is until you haven't had one in a while.",
            "There's always somebody arriving with news and somebody leaving before they hear it.",
            "Watch your footing outside the paved streets. Rain's made a mess of the edges.",
            "I keep meaning to take a day off. Then the day arrives and there's always something that needs doing.",
            "No grand wisdom from me. Eat when you can, sleep somewhere dry, and don't borrow from people with matching uniforms."
        ],
        farmer:["Good soil forgives a lot. Bad weather doesn't.","Half of farming is growing things. The other half is arguing with animals about where they're allowed to stand.","If the rain holds another day, I'll stop complaining about it. Maybe."],
        labourer:["If someone tells you a job will only take an hour, they've never done the job.","Back's sore, hands are sore, pay could be better. So: a normal day.","You learn which loads are heavy and which foremen only look heavy."],
        merchant:["Good roads make cheap goods. Bad roads make interesting excuses.","I can tell how safe a road is by how loudly merchants complain about tolls instead of bandits.","Everyone wants a bargain until they're the one selling."],
        smith:["You can hurry hot metal once. Usually right before you ruin it.","People notice a sword. They don't notice the hundred ordinary hinges that keep a town working.","Coal, iron, time. Mostly time."],
        fisher:["Fish don't care what time you woke up. That's the trouble with fish.","The water tells you plenty if you stop trying to make it agree with you.","Best catch is always the one somebody swears they nearly landed yesterday."],
        hunter:["Fresh tracks tell the truth better than frightened travellers do.","Woods are noisy when they're safe. Silence is when I start looking around.","If you see one deer, there are three you didn't see."],
        clerk:["Ink is cheaper than steel and somehow still starts fights.","Every urgent message becomes less urgent once somebody has to write it down properly.","I know exactly where that record is. I simply don't know which stack it's in."],
        tavern_worker:["You can learn a lot carrying cups. Mostly things nobody intended to tell you.","Quiet patrons worry me more than loud ones. Loud ones usually tell you what the problem is.","If a table wobbles, fold paper under the short leg. If a patron wobbles, point them toward the door."],
        craftsperson:["People call it simple work once they no longer remember how to do it themselves.","Measure twice. Then measure again because somebody talked to you halfway through the second one.","A good tool feels expensive once and cheap every day after."],
        artisan:["The last little correction always takes longer than the whole first attempt.","If you can see the join, I wasn't finished yet.","There's a difference between decoration and care. Good work usually has both."],
        porter:["Everyone packs as if somebody else will carry it.","The shortest route across town changes depending on what you're carrying.","Give me a crate with handles and I'll forgive whoever packed it."],
        servant:["Big houses have the same problems as little ones. They just happen in more rooms.","The trick is doing the work before anyone important notices it needed doing.","You hear every bell in the house eventually."],
        weaver:["One bad thread isn't much. A hundred bad threads is a reputation.","Patterns look clever until you've repeated them six hundred times.","Good cloth starts long before the loom."],
        carter:["A wheel always breaks at the exact point furthest from someone who can fix it.","Road looks flat until you've pulled a loaded cart over it.","Horses have opinions about schedules. Strong ones."],
        guard_support:["The guards get the songs. Somebody still has to count their boots and arrows.","A patrol without food comes home early, no matter how brave it sounded leaving.","Most defence is dull work done before anything exciting happens."],
        dependent:["I'm not supposed to go past the next street on my own.","I know a shortcut, but I'm not telling everybody.","Grown-ups say 'in a minute' when they mean much longer than a minute."]
    };

    function hashUnit(text){ let h=2166136261; for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return (h>>>0)/4294967296; }
    function eachPopulation(fn){ for(const p of [window.GeneratedCivilianPopulation,window.SilverhartPopulation]) if(p?.records) fn(p); }
    function findRecord(e){ return e?.id ? (window.GeneratedCivilianPopulation?.records?.get(e.id)||window.SilverhartPopulation?.records?.get(e.id)||null) : null; }

    function normaliseHairRecord(record){
        if(!record?.appearance) return false;
        const was=record.appearance.hair, child=record.appearance.ageBand==='child';
        if(record.gender==='male'&&!child){
            const bald=hashUnit(`${record.seed||record.id}:rare-bald`)<MALE_BALD_CHANCE;
            record.appearance.hair=bald?'bald':(was==='bald'?'cropped':was);
        } else if(was==='bald') record.appearance.hair=record.gender==='female'?'tied_back':'cropped';
        return record.appearance.hair!==was;
    }
    function normalisePopulationHair(){ let changed=0; eachPopulation(p=>{for(const r of p.records.values()) if(normaliseHairRecord(r)) changed++;}); return changed; }

    let transparentHair=null;
    function transparentCanvas(){
        if(transparentHair) return transparentHair;
        if(typeof document==='undefined') return null;
        transparentHair=document.createElement('canvas'); transparentHair.width=1; transparentHair.height=1; return transparentHair;
    }
    function installTransparentBaldHair(){
        const sets=window.DIRECTIONAL_CHARACTER_ASSETS, blank=transparentCanvas();
        if(!sets||!blank) return false;
        for(const set of Object.values(sets)) if(set?.hair&&!set.hair.bald) set.hair.bald={front:blank,side:blank,back:blank};
        return true;
    }
    function applyBaldRuntimeHints(e,record=findRecord(e)){
        if(!e) return false;
        const bald=e.hairStyle==='bald'||record?.appearance?.hair==='bald';
        if(bald){e.hairStyle='bald';e.hairSizeMult=0;e.__baldHairSizeOwned=true;}
        else if(e.__baldHairSizeOwned){delete e.hairSizeMult;e.__baldHairSizeOwned=false;}
        return bald;
    }
    function styleEntityNow(e,record=findRecord(e)){
        if(!e||!record) return false;
        normaliseHairRecord(record);
        e.equipped=e.equipped||{weapon:null,offhand:null,armor:null,helmet:null};
        window.CivilianVisualDiversity?.styleEntity?.(e,record);
        if(record.appearance?.hair==='bald') e.hairStyle='bald';
        applyBaldRuntimeHints(e,record); styledEntities.add(e); return true;
    }
    function styleGeneratedResidents(){
        let count=0;
        eachPopulation(p=>{for(const e of p.materialised?.values?.()||[]){
            const r=p.records.get(e.id);
            if(!styledEntities.has(e)||!e.__civilianVisualStyled){if(styleEntityNow(e,r))count++;}
            else applyBaldRuntimeHints(e,r);
        }});
        return count;
    }

    function doors(){const out=[];for(const [k,o] of Object.entries(window.tileObjects||{})){if(!DOOR_TYPES.has(o?.type))continue;const [q,r]=k.split(',').map(Number);if(Number.isFinite(q)&&Number.isFinite(r))out.push({q,r});}return out;}
    function hexDistance(a,b){return window.distance?window.distance(a,b):Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));}
    function inDoorClearance(hex,doorList=doors()){return !!hex&&doorList.some(d=>hexDistance(hex,d)<=DOOR_CLEARANCE_RADIUS);}
    function occupied(h,ignore){return (window.entities||[]).some(e=>e!==ignore&&e?.alive&&e.hex?.q===h.q&&e.hex?.r===h.r);}
    function safeCivilianHex(start,e,doorList){
        if(!start)return null;const q=[{q:Math.round(start.q),r:Math.round(start.r)}],seen=new Set();
        while(q.length&&seen.size<100){const h=q.shift(),k=`${h.q},${h.r}`;if(seen.has(k))continue;seen.add(k);const t=window.getTerrainAt?.(h.q,h.r)?.name;
            if(!BLOCKED_TERRAIN.has(t)&&!occupied(h,e)&&!inDoorClearance(h,doorList))return h;
            if(window.getNeighbors)q.push(...window.getNeighbors(h.q,h.r));}
        return null;
    }
    function clearGeneratedDoorways(){
        const ds=doors();if(!ds.length)return 0;let moved=0;
        for(const e of window.entities||[]){if(!e?.alive||!e.isGeneratedCivilian||!e.hex)continue;
            if(inDoorClearance(e.hex,ds)){const safe=safeCivilianHex(e.hex,e,ds);if(safe){e.hex={...safe};e.visualQ=e.startQ=safe.q;e.visualR=e.startR=safe.r;e.destination=null;moved++;doorwayMoves++;}}
            else if(e.destination&&inDoorClearance(e.destination,ds)){const safe=safeCivilianHex(e.destination,e,ds);e.destination=safe?{...safe}:null;}}
        return moved;
    }

    function smallTalkLine(npc){
        const pool=SMALL_TALK[npc?.occupation]||SMALL_TALK.generic;npc.__smallTalkCount=(npc.__smallTalkCount||0)+1;
        const salt=`${npc?.id||npc?.name}|${npc.__smallTalkCount}|${Math.floor((window.worldSeconds||0)/3600)}`;
        if(npc?.occupation&&pool!==SMALL_TALK.generic&&npc.__smallTalkCount%3===0){const g=SMALL_TALK.generic;return g[Math.floor(hashUnit(`${salt}:general`)*g.length)%g.length];}
        return pool[Math.floor(hashUnit(salt)*pool.length)%pool.length];
    }
    function installTalkFallback(){
        const original=window.talkToNPC;if(typeof original!=='function')return false;if(original.__npcReliabilitySmallTalk){talkWrapperInstalled=true;return true;}
        const wrapped=function(npc,...args){const hasTree=!!(npc?.dialogueId&&window.npcDialogueTrees?.[npc.dialogueId]);if(hasTree||npc?.arenaFlavorLine||!npc?.isNPC)return original.call(this,npc,...args);
            styleEntityNow(npc);window.showDialogue?.(npc,smallTalkLine(npc),[{label:'Take care.',action:()=>{}}]);};
        wrapped.__npcReliabilitySmallTalk=true;wrapped.__original=original;window.talkToNPC=wrapped;talkWrapperInstalled=true;return true;
    }
    function installDialogueStyling(){
        const original=window.showDialogue;if(typeof original!=='function')return false;if(original.__npcReliabilityAppearance){dialogueWrapperInstalled=true;return true;}
        const wrapped=function(npc,...args){if(npc?.isGeneratedCivilian)styleEntityNow(npc);else applyBaldRuntimeHints(npc);return original.call(this,npc,...args);};
        wrapped.__npcReliabilityAppearance=true;wrapped.__original=original;window.showDialogue=wrapped;dialogueWrapperInstalled=true;return true;
    }
    function installRenderStyling(){
        const original=window.renderEntities;if(typeof original!=='function')return false;if(original.__npcReliabilityAppearance){renderWrapperInstalled=true;return true;}
        const wrapped=function(...args){styleGeneratedResidents();clearGeneratedDoorways();return original.apply(this,args);};
        wrapped.__npcReliabilityAppearance=true;wrapped.__original=original;window.renderEntities=wrapped;renderWrapperInstalled=true;return true;
    }

    function creatorVisible(){const el=document.getElementById('characterCreator');if(!el)return false;return getComputedStyle(el).display!=='none';}
    function installCreatorBaldOption(){const s=document.getElementById('hair-style-select');if(!s)return false;if(!s.querySelector('option[value="bald"]'))s.appendChild(new Option('Bald','bald'));creatorInstalled=true;return true;}
    function syncCreatorSelectionToPlayer(){
        if(!creatorVisible())return false;
        const style=document.getElementById('hair-style-select')?.value;if(!style)return false;
        const char=window.party?.[0];if(char){char.hairStyle=style;applyBaldRuntimeHints(char,null);}
        const e=char&&(window.entities||[]).find(x=>x.name===char.name&&x.side==='player');if(e){e.hairStyle=style;applyBaldRuntimeHints(e,null);}return true;
    }
    function installCreatorSync(){
        if(!installCreatorBaldOption())return false;const s=document.getElementById('hair-style-select');
        if(!s.dataset.npcReliabilityBaldListener){s.dataset.npcReliabilityBaldListener='true';s.addEventListener('change',()=>{syncCreatorSelectionToPlayer();window.updateAppearancePreview?.();});}return true;
    }
    function installLegacyBaldPreview(){
        const current=window.updateAppearancePreview;if(typeof current!=='function')return false;if(current.__npcReliabilityBaldPreview){previewWrapperInstalled=true;return true;}
        const wrapped=function(...args){
            if(document.getElementById('hair-style-select')?.value!=='bald')return current.apply(this,args);
            installTransparentBaldHair();
            const blank=transparentCanvas(),g=window.gameVisuals||{},keys=['humanHair','humanMaleHair','elfFemaleHair','elfMaleHair','dwarfFemaleHair','dwarfMaleHair'];
            const saved=new Map();for(const k of keys){if(g[k]){saved.set(k,g[k]);g[k]=blank;}}
            try{return current.apply(this,args);}finally{for(const [k,v] of saved)g[k]=v;}
        };
        wrapped.__npcReliabilityBaldPreview=true;wrapped.__original=current;window.updateAppearancePreview=wrapped;previewWrapperInstalled=true;return true;
    }

    function maintenance(){
        maintenancePasses++;installTransparentBaldHair();normalisePopulationHair();styleGeneratedResidents();clearGeneratedDoorways();
        installTalkFallback();installDialogueStyling();installRenderStyling();installCreatorSync();installLegacyBaldPreview();syncCreatorSelectionToPlayer();
    }

    window.NPCReliability={maintenance,normaliseHairRecord,normalisePopulationHair,styleEntityNow,styleGeneratedResidents,inDoorClearance,clearGeneratedDoorways,safeCivilianHex,smallTalkLine,installTransparentBaldHair,
        get stats(){return{maintenancePasses,doorwayMoves,talkWrapperInstalled,dialogueWrapperInstalled,renderWrapperInstalled,creatorInstalled,previewWrapperInstalled};},DOOR_CLEARANCE_RADIUS,MALE_BALD_CHANCE,SMALL_TALK};

    const timer=setInterval(maintenance,350);maintenance();
    window.addEventListener('load',()=>{maintenance();setTimeout(()=>clearInterval(timer),15000);},{once:true});
})();
