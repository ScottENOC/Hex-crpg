// dialogueHearing.js
// Volume-aware overhearing, reactive appearance chatter, and rendered coverage sampling.
(() => {
    'use strict';

    const BUILD = '20260929-dialogue-hearing-v2';
    const VOLUMES = {
        whisper:{clear:2,max:4,fontScale:.82,italic:true},
        quiet:{clear:3,max:6,fontScale:.90,italic:true},
        normal:{clear:5,max:9,fontScale:1},
        loud:{clear:8,max:13,fontScale:1.16,bold:true},
        shout:{clear:12,max:19,fontScale:1.30,bold:true,upper:true},
    };
    const REACTION_RANGE=7, EXPOSURE_THRESHOLD=.75, REACTION_CHECK_SECONDS=16;
    const reactionCooldowns=new Map();
    let reactionAccum=0;

    function hash01(text){
        let h=2166136261;
        for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
        h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
        return (h>>>0)/4294967296;
    }
    function distance(a,b){
        if(!a||!b)return Infinity;
        if(window.distance)return window.distance(a,b);
        const dq=a.q-b.q,dr=a.r-b.r;return(Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;
    }
    function slotVisible(e,slot){return window.equipmentAppearanceSystem?.isSlotVisible?.(e,slot)!==false;}

    function installElfHearingSkill(){
        if(!window.skills)return;
        if(!window.skills.keen_hearing){
            window.skills.keen_hearing={name:'Keen Hearing',description:'Passive: Hear conversations clearly from farther away and make out more words at the edge of hearing.',tree:'elf',maxRanks:1,apply:()=>{}};
            return;
        }
        const skill=window.skills.keen_hearing;
        if(!/conversation/i.test(skill.description||'')){
            skill.description=`${skill.description||'Passive: Keen elven hearing.'} Also hear conversations clearly from 3 hexes farther away and make out speech up to 5 hexes farther away.`;
        }
    }

    // Use the real front-view compositor but suppress its first drawImage (the body).
    // The sampled alpha therefore contains exactly clothing + armour coverage.
    function getHumanoidPelvisTransparency(entity){
        if(!entity||typeof document==='undefined'||!window.drawDirectionalHumanoidInBounds)return null;
        if(!['human_female','human_male','elf_female'].includes(`${entity.race}_${entity.gender}`))return null;
        const canvas=document.createElement('canvas');canvas.width=96;canvas.height=192;
        const real=canvas.getContext('2d',{willReadFrequently:true});if(!real)return null;
        let skipFirst=true;
        const ctx=new Proxy(real,{
            get(target,prop){
                if(prop==='drawImage')return(...args)=>{if(skipFirst){skipFirst=false;return;}return target.drawImage(...args);};
                const value=target[prop];return typeof value==='function'?value.bind(target):value;
            },
            set(target,prop,value){target[prop]=value;return true;},
        });
        const clone={...entity,facing:'down',equipped:{...(entity.equipped||{}),weapon:null,offhand:null,helmet:null},clothingColors:entity.clothingColors?JSON.parse(JSON.stringify(entity.clothingColors)):{}};
        const diagnostic={order:window.__humanoidRendererLastLayerOrder,draw:window.__humanoidRendererLastDraw,armour:window.__humanoidRendererLastArmour};
        let rendered=false;
        try{rendered=!!window.drawDirectionalHumanoidInBounds(ctx,clone,{left:2,top:4,width:92,height:184},'down');}
        catch(_){return null;}
        finally{
            window.__humanoidRendererLastLayerOrder=diagnostic.order;
            window.__humanoidRendererLastDraw=diagnostic.draw;
            window.__humanoidRendererLastArmour=diagnostic.armour;
        }
        if(!rendered||skipFirst)return null;
        const left=Math.floor(2+92*.43),right=Math.ceil(2+92*.57),top=Math.floor(4+184*.585),bottom=Math.ceil(4+184*.655);
        let data;try{data=real.getImageData(left,top,Math.max(1,right-left),Math.max(1,bottom-top)).data;}catch(_){return null;}
        if(!data.length)return null;
        let alpha=0;for(let i=3;i<data.length;i+=4)alpha+=data[i]/255;
        return Math.max(0,Math.min(1,1-alpha/(data.length/4)));
    }

    function listeners(){return(window.entities||[]).filter(e=>e?.alive&&e.side==='player'&&!e.rider&&e.hex);}
    function bestHearing(speaker,volumeName){
        const volume=VOLUMES[volumeName]||VOLUMES.normal;let best=null;
        for(const listener of listeners()){
            const d=distance(speaker.hex,listener.hex),ranks=Number(listener.skills?.keen_hearing||0);
            let clear=volume.clear+ranks*3,max=volume.max+ranks*5,occluded=false;
            if(window.hasLineOfSight){try{occluded=!window.hasLineOfSight(listener.hex,speaker.hex);}catch(_){}}
            if(occluded){clear*=.65;max*=.65;}
            if(d>max)continue;
            let clarity=d<=clear?1:Math.max(.15,1-((d-clear)/Math.max(.001,max-clear))*.85);
            if(occluded)clarity*=.55;
            const candidate={listener,distance:d,clarity:Math.max(0,Math.min(1,clarity)),clear,max,occluded};
            if(!best||candidate.clarity>best.clarity||(candidate.clarity===best.clarity&&d<best.distance))best=candidate;
        }
        return best;
    }
    function maskText(text,clarity,seed){
        const words=String(text||'').split(/\s+/).filter(Boolean);if(clarity>=.995||!words.length)return words.join(' ');
        const out=words.map((word,i)=>hash01(`${seed}|${i}`)<=clarity?word:'…');
        return out.filter((word,i)=>word!=='…'||i===0||out[i-1]!=='…').join(' ');
    }
    function parseSpawnArgs(durationOrOptions,options){
        if(durationOrOptions&&typeof durationOrOptions==='object')return{duration:Number(durationOrOptions.durationMs||3200),options:durationOrOptions};
        return{duration:Number(durationOrOptions||3200),options:options||{}};
    }

    function installSpeechSystem(){
        if(!window.speechBubbles||window.spawnSpeechBubble?.__volumeAware)return;
        const spawn=function(speakerName,text,durationOrOptions=3200,options={}){
            const parsed=parseSpawnArgs(durationOrOptions,options),volume=VOLUMES[parsed.options.volume]?parsed.options.volume:'normal',start=performance.now();
            window.speechBubbles.push({speakerName,text:String(text||''),start,duration:parsed.duration,volume,hearingSeed:`${speakerName}|${text}|${Math.floor(start)}`});
        };
        spawn.__volumeAware=true;window.spawnSpeechBubble=spawn;

        window.renderSpeechBubbles=function(ctx,hexToPixel,zoom){
            const now=performance.now();window.speechBubbles=window.speechBubbles.filter(b=>now-b.start<b.duration);const placed=[];
            window.speechBubbles.forEach(b=>{
                const ent=(window.entities||[]).find(e=>e.name===b.speakerName&&e.alive);if(!ent?.hex)return;
                const hearing=bestHearing(ent,b.volume||'normal');if(!hearing)return;
                const style=VOLUMES[b.volume]||VOLUMES.normal;
                let text=maskText(b.text,hearing.clarity,b.hearingSeed||`${b.speakerName}|${b.text}|${b.start}`);if(style.upper)text=text.toUpperCase();if(!text)return;
                const{x,y}=hexToPixel(ent.hex.q,ent.hex.r),fontPx=Math.max(8,Math.round(12*style.fontScale*zoom)),lineHeight=Math.max(10*zoom,14*style.fontScale*zoom),maxW=160*zoom*Math.max(1,style.fontScale*.9),padding=8*zoom;
                ctx.save();ctx.font=`${style.italic?'italic ':''}${style.bold?'700 ':''}${fontPx}px sans-serif`;ctx.textAlign='center';
                const lines=[];let current='';
                text.split(' ').forEach(word=>{const candidate=current?`${current} ${word}`:word;if(current&&ctx.measureText(candidate).width>maxW){lines.push(current);current=word;}else current=candidate;});if(current)lines.push(current);if(!lines.length){ctx.restore();return;}
                const boxW=Math.min(maxW,Math.max(...lines.map(l=>ctx.measureText(l).width)))+padding*2,boxH=lines.length*lineHeight+padding*2,boxX=x-boxW/2;let boxY=y-45*zoom-boxH;
                const overlaps=(a,r)=>a.x<r.x+r.width&&a.x+a.width>r.x&&a.y<r.y+r.height&&a.y+a.height>r.y;let attempts=0;
                while(attempts<6&&placed.some(r=>overlaps({x:boxX,y:boxY,width:boxW,height:boxH},r))){boxY-=boxH+4*zoom;attempts++;}placed.push({x:boxX,y:boxY,width:boxW,height:boxH});
                let border='#fff';if(ent.shirtHue===undefined&&window.pickClothingHue){ent.shirtHue=window.pickClothingHue((ent.name||'x')+'_shirt');ent.clothingSatMult=.85;}if(ent.shirtHue!==undefined)border=`hsl(${ent.shirtHue}, 70%, 65%)`;
                ctx.fillStyle='rgba(20,20,20,0.85)';ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(boxX,boxY,boxW,boxH,6*zoom);else ctx.rect(boxX,boxY,boxW,boxH);ctx.fill();ctx.stroke();
                ctx.beginPath();ctx.moveTo(x-6*zoom,boxY+boxH);ctx.lineTo(x+6*zoom,boxY+boxH);ctx.lineTo(x,boxY+boxH+8*zoom);ctx.closePath();ctx.fill();ctx.stroke();
                ctx.fillStyle='#fff';lines.forEach((line,i)=>ctx.fillText(line,x,boxY+padding+(i+1)*lineHeight-4*zoom));ctx.restore();
            });
        };
    }

    function nearbyParty(pair){return(window.entities||[]).filter(e=>e?.alive&&e.side==='player'&&!e.rider&&e.hex&&pair.some(n=>distance(e.hex,n.hex)<=REACTION_RANGE));}
    function isVisibleHeavyArmour(e){if(e.displayArmour===false||!slotVisible(e,'armor'))return false;const item=window.items?.[e.equipped?.armor];return!!item&&Number(item.reduction||0)>=3;}
    function hasVisibleAxe(e){
        for(const slot of ['weapon','offhand']){if(!slotVisible(e,slot))continue;const id=e.equipped?.[slot],item=id&&window.items?.[id];if(item?.type==='weapon'&&/axe/i.test(`${id} ${item.name||''}`))return true;}return false;
    }
    function partyPresence(pair){
        const party=nearbyParty(pair);let heavyArmourCount=0,axeCount=0,mostlyUndressedCount=0;
        for(const member of party){if(isVisibleHeavyArmour(member))heavyArmourCount++;if(hasVisibleAxe(member))axeCount++;const transparency=getHumanoidPelvisTransparency(member);if(transparency!==null&&transparency>=EXPOSURE_THRESHOLD)mostlyUndressedCount++;}
        return{party,partySize:party.length,heavyArmourCount,axeCount,mostlyUndressedCount};
    }

    const REACTIONS=[
        {id:'mostly-undressed',cooldown:180,chance:.42,volume:'whisper',when:p=>p.mostlyUndressedCount>0,lines:[["Is that… deliberate?","Eyes up. Let them get on with it."],["Did they lose a wager?","Lower your voice."],["Bit underdressed, aren't they?","Pretend you didn't notice."]]},
        {id:'armoured-axe-party',cooldown:150,chance:.78,volume:'quiet',when:p=>p.partySize>=4&&p.heavyArmourCount>=3&&p.axeCount>=2,lines:[["That's a lot of steel for one table.","And a lot of axes. Don't stare."],["Four armed travellers walk in and everyone remembers their manners.","Including you, apparently."],["Think they're expecting trouble?","With that much plate, I think trouble's expecting them."]]},
        {id:'armoured-party',cooldown:150,chance:.58,volume:'quiet',when:p=>p.partySize>=3&&p.heavyArmourCount>=2,lines:[["That's serious armour for a quiet drink.","Then let's hope the drink stays quiet."],["Lot of plate coming through the door.","Best give them room."]]},
        {id:'axe-party',cooldown:150,chance:.48,volume:'quiet',when:p=>p.axeCount>=2,lines:[["That's a lot of axes.","Maybe they're very serious about firewood."],["You notice the axes?","I was trying very hard not to."]]},
    ];
    function eligiblePairs(){
        const npcs=(window.entities||[]).filter(e=>e?.alive&&e.isNPC&&e.side==='neutral'&&!e.rider&&e.hex),pairs=[];
        for(let i=0;i<npcs.length;i++)for(let j=i+1;j<npcs.length;j++)if(distance(npcs[i].hex,npcs[j].hex)<=2&&nearbyParty([npcs[i],npcs[j]]).length)pairs.push([npcs[i],npcs[j]]);
        return pairs;
    }
    function playReaction(pair,reaction){
        const lines=reaction.lines[Math.floor(Math.random()*reaction.lines.length)];
        lines.forEach((text,i)=>setTimeout(()=>{const speaker=pair[i%pair.length];if(speaker?.alive)window.spawnSpeechBubble?.(speaker.name,text,{volume:reaction.volume,durationMs:3600});},i*2400));
        reactionCooldowns.set(reaction.id,Number(window.worldSeconds||0));
    }
    function tryReactiveChatter(){
        if(window.isInCombat)return false;const pairs=eligiblePairs();if(!pairs.length)return false;
        pairs.sort((a,b)=>Math.min(...nearbyParty(a).flatMap(p=>a.map(n=>distance(p.hex,n.hex))))-Math.min(...nearbyParty(b).flatMap(p=>b.map(n=>distance(p.hex,n.hex)))));
        const pair=pairs[0],presence=partyPresence(pair),now=Number(window.worldSeconds||0);
        for(const reaction of REACTIONS){if(!reaction.when(presence))continue;const last=reactionCooldowns.get(reaction.id);if(last!==undefined&&now-last<reaction.cooldown)continue;if(Math.random()>reaction.chance)continue;playReaction(pair,reaction);return true;}return false;
    }
    function installReactiveChatter(){
        const base=window.checkAmbientNpcChatter;if(typeof base!=='function'||base.__reactiveAppearanceAware)return;
        const wrapped=function(delta){reactionAccum+=Number(delta||0);if(reactionAccum>=REACTION_CHECK_SECONDS){reactionAccum=0;if(tryReactiveChatter())return;}return base.apply(this,arguments);};
        wrapped.__reactiveAppearanceAware=true;wrapped.__baseAmbientChatter=base;window.checkAmbientNpcChatter=wrapped;
    }

    function install(){
        installElfHearingSkill();window.getHumanoidPelvisTransparency=getHumanoidPelvisTransparency;installSpeechSystem();installReactiveChatter();
        window.dialogueHearingSystem={build:BUILD,volumes:VOLUMES,exposureThreshold:EXPOSURE_THRESHOLD,bestHearing,maskText,partyPresence,getHumanoidPelvisTransparency,tryReactiveChatter};
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();