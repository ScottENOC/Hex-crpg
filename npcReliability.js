// npcReliability.js
// Generated-NPC hardening plus lightweight creator/player presentation guards.
(() => {
  'use strict';
  const DOOR_CLEARANCE_RADIUS=1, MALE_BALD_CHANCE=.06;
  const BLOCKED=new Set(['Wall','Water','Palisade Wall','Keep Wall','Stone Wall']);
  const DOORS=new Set(['door_open','door_closed']);
  const styled=new WeakSet();
  let talkWrapped=false,dialogueWrapped=false,renderWrapped=false,creatorInstalled=false;
  let maintenancePasses=0,doorwayMoves=0,doorCache=[],doorCacheAt=0;

  const CREATOR_DEFAULTS={
    'race-select':'human','gender-select':'female','class-select':'fighter','voice-select':'pc_1',
    'campaign-select':'1','difficulty-select':'normal','hair-style-select':'brown_1','body-type-select':'average'
  };

  const SMALL_TALK={
    generic:["Roads have been busy lately. That's usually good news, until it isn't.","If you're travelling far, fill your water skin before you leave town.","Everyone's heard a different version of what happened on the road. I trust about half of any of them.","Funny thing about a quiet day: you don't notice how valuable it is until you haven't had one in a while.","There's always somebody arriving with news and somebody leaving before they hear it.","Watch your footing outside the paved streets. Rain's made a mess of the edges.","I keep meaning to take a day off. Then the day arrives and there's always something that needs doing.","No grand wisdom from me. Eat when you can, sleep somewhere dry, and don't borrow from people with matching uniforms."],
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

  function unit(s){let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0)/4294967296;}
  function populations(){return[window.GeneratedCivilianPopulation,window.SilverhartPopulation].filter(p=>p?.records);}
  function recordFor(e){return e?.id?(window.GeneratedCivilianPopulation?.records?.get(e.id)||window.SilverhartPopulation?.records?.get(e.id)||null):null;}

  function ensureCreatorDefaults(){
    const creator=document.getElementById('characterCreator');
    if(!creator) return 0;
    let fixed=0,campaignFixed=false;
    for(const[id,fallback]of Object.entries(CREATOR_DEFAULTS)){
      const select=document.getElementById(id);
      if(!select?.options?.length)continue;
      const current=Array.from(select.options).find(o=>!o.disabled&&o.value===select.value);
      if(select.selectedIndex>=0&&current&&select.value!=='')continue;
      const target=Array.from(select.options).find(o=>!o.disabled&&o.defaultSelected)
        ||Array.from(select.options).find(o=>!o.disabled&&o.value===fallback)
        ||Array.from(select.options).find(o=>!o.disabled);
      if(!target)continue;
      select.value=target.value;
      if(select.selectedIndex<0)target.selected=true;
      fixed++;
      if(id==='campaign-select')campaignFixed=true;
    }
    if(campaignFixed)window.toggleArenaOptions?.();
    if(fixed)window.updateSelectionPreview?.();
    return fixed;
  }

  function normaliseHairRecord(r){if(!r?.appearance)return false;const before=r.appearance.hair,child=r.appearance.ageBand==='child';if(r.gender==='male'&&!child){const bald=unit(`${r.seed||r.id}:rare-bald`)<MALE_BALD_CHANCE;r.appearance.hair=bald?'bald':(before==='bald'?'cropped':before);}else if(before==='bald')r.appearance.hair=r.gender==='female'?'tied_back':'cropped';return before!==r.appearance.hair;}
  function normalisePopulationHair(){let n=0;for(const p of populations())for(const r of p.records.values())if(normaliseHairRecord(r))n++;return n;}

  let blankHair=null;
  function blank(){if(blankHair)return blankHair;if(typeof document==='undefined')return null;blankHair=document.createElement('canvas');blankHair.width=blankHair.height=1;return blankHair;}
  function installTransparentBaldHair(){const b=blank(),sets=window.DIRECTIONAL_CHARACTER_ASSETS;if(!b||!sets)return false;for(const set of Object.values(sets))if(set?.hair&&!set.hair.bald)set.hair.bald={front:b,side:b,back:b};return true;}
  function baldHints(e,r=recordFor(e)){if(!e)return false;const isBald=e.hairStyle==='bald'||r?.appearance?.hair==='bald';if(isBald){e.hairStyle='bald';e.hairSizeMult=0;e.__baldHairSizeOwned=true;}else if(e.__baldHairSizeOwned){delete e.hairSizeMult;e.__baldHairSizeOwned=false;}return isBald;}
  function styleEntityNow(e,r=recordFor(e)){if(!e||!r)return false;normaliseHairRecord(r);e.equipped=e.equipped||{weapon:null,offhand:null,armor:null,helmet:null};window.CivilianVisualDiversity?.styleEntity?.(e,r);if(r.appearance?.hair==='bald')e.hairStyle='bald';baldHints(e,r);styled.add(e);return true;}
  function styleGeneratedResidents(){let n=0;for(const p of populations())for(const e of p.materialised?.values?.()||[]){const r=p.records.get(e.id);if(!styled.has(e)||!e.__civilianVisualStyled){if(styleEntityNow(e,r))n++;}else baldHints(e,r);}return n;}

  function legacyHumanFemaleCustomImage(value){
    const src=typeof value==='string'?value:String(value?.currentSrc||value?.src||'');
    return /(?:^|\/)images\/humanfemale\.png(?:[?#]|$)/.test(src)||value===window.gameVisuals?.humanBase;
  }
  function ensureDirectionalPlayerPresentation(){
    const c=window.party?.[0];
    if(!c||c.race!=='human'||c.gender!=='female')return false;
    const e=(window.entities||[]).find(x=>x?.side==='player'&&x.name===c.name);
    if(!e)return false;
    e.race='human';e.gender='female';
    for(const key of ['hairStyle','bodyType','hairHue','shirtHue','pantsHue','skinHue','skinSaturation','skinLightness']){
      if(c[key]!==undefined)e[key]=c[key];
    }
    e.equipped=e.equipped||c.equipped||{weapon:null,offhand:null,armor:null,helmet:null};
    if(!['up','down','left','right'].includes(e.facing))e.facing='down';
    if(legacyHumanFemaleCustomImage(e.customImage))delete e.customImage;
    window.installFacingRenderer?.();
    return true;
  }

  function refreshDoors(force=false){const now=performance.now?.()||Date.now();if(!force&&doorCache.length&&now-doorCacheAt<5000)return doorCache;doorCache=[];for(const[k,o]of Object.entries(window.tileObjects||{})){if(!DOORS.has(o?.type))continue;const[q,r]=k.split(',').map(Number);if(Number.isFinite(q)&&Number.isFinite(r))doorCache.push({q,r});}doorCacheAt=now;return doorCache;}
  function dist(a,b){return window.distance?window.distance(a,b):Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));}
  function inDoorClearance(h,ds=refreshDoors()){return!!h&&ds.some(d=>dist(h,d)<=DOOR_CLEARANCE_RADIUS);}
  function occupied(h,ignore){return(window.entities||[]).some(e=>e!==ignore&&e?.alive&&e.hex?.q===h.q&&e.hex?.r===h.r);}
  function safeCivilianHex(start,e,ds=refreshDoors()){if(!start)return null;const q=[{q:Math.round(start.q),r:Math.round(start.r)}],seen=new Set();while(q.length&&seen.size<100){const h=q.shift(),k=`${h.q},${h.r}`;if(seen.has(k))continue;seen.add(k);const t=window.getTerrainAt?.(h.q,h.r)?.name;if(!BLOCKED.has(t)&&!occupied(h,e)&&!inDoorClearance(h,ds))return h;if(window.getNeighbors)q.push(...window.getNeighbors(h.q,h.r));}return null;}
  function clearGeneratedDoorways(){const ds=refreshDoors();if(!ds.length)return 0;let n=0;for(const e of window.entities||[]){if(!e?.alive||!e.isGeneratedCivilian||!e.hex)continue;if(inDoorClearance(e.hex,ds)){const h=safeCivilianHex(e.hex,e,ds);if(h){e.hex={...h};e.visualQ=e.startQ=h.q;e.visualR=e.startR=h.r;e.destination=null;n++;doorwayMoves++;}}else if(e.destination&&inDoorClearance(e.destination,ds)){const h=safeCivilianHex(e.destination,e,ds);e.destination=h?{...h}:null;}}return n;}

  function smallTalkLine(npc){const pool=SMALL_TALK[npc?.occupation]||SMALL_TALK.generic;npc.__smallTalkCount=(npc.__smallTalkCount||0)+1;const salt=`${npc?.id||npc?.name}|${npc.__smallTalkCount}|${Math.floor((window.worldSeconds||0)/3600)}`;if(pool!==SMALL_TALK.generic&&npc.__smallTalkCount%3===0){const g=SMALL_TALK.generic;return g[Math.floor(unit(`${salt}:general`)*g.length)%g.length];}return pool[Math.floor(unit(salt)*pool.length)%pool.length];}
  function installTalkFallback(){const original=window.talkToNPC;if(typeof original!=='function')return false;if(original.__npcReliabilitySmallTalk){talkWrapped=true;return true;}const wrapped=function(npc,...args){const authored=!!(npc?.dialogueId&&window.npcDialogueTrees?.[npc.dialogueId]);if(authored||npc?.arenaFlavorLine||!npc?.isNPC)return original.call(this,npc,...args);styleEntityNow(npc);window.showDialogue?.(npc,smallTalkLine(npc),[{label:'Take care.',action:()=>{}}]);};wrapped.__npcReliabilitySmallTalk=true;wrapped.__original=original;window.talkToNPC=wrapped;talkWrapped=true;return true;}
  function installDialogueStyling(){const original=window.showDialogue;if(typeof original!=='function')return false;if(original.__npcReliabilityAppearance){dialogueWrapped=true;return true;}const wrapped=function(npc,...args){if(npc?.isGeneratedCivilian)styleEntityNow(npc);else baldHints(npc);return original.call(this,npc,...args);};wrapped.__npcReliabilityAppearance=true;wrapped.__original=original;window.showDialogue=wrapped;dialogueWrapped=true;return true;}
  function installRenderStyling(){const original=window.renderEntities;if(typeof original!=='function')return false;if(original.__npcReliabilityAppearance){renderWrapped=true;return true;}const wrapped=function(...args){ensureDirectionalPlayerPresentation();styleGeneratedResidents();return original.apply(this,args);};wrapped.__npcReliabilityAppearance=true;wrapped.__original=original;window.renderEntities=wrapped;renderWrapped=true;return true;}

  function creatorVisible(){const el=document.getElementById('characterCreator');return!!el&&getComputedStyle(el).display!=='none';}
  function installCreatorBaldOption(){const s=document.getElementById('hair-style-select');if(!s)return false;if(!s.querySelector('option[value="bald"]'))s.appendChild(new Option('Bald','bald'));creatorInstalled=true;return true;}
  function syncCreator(){if(!creatorVisible())return false;ensureCreatorDefaults();const style=document.getElementById('hair-style-select')?.value;if(!style)return false;const c=window.party?.[0];if(c){c.hairStyle=style;baldHints(c,null);}const e=c&&(window.entities||[]).find(x=>x.name===c.name&&x.side==='player');if(e){e.hairStyle=style;baldHints(e,null);}return true;}
  function installCreatorSync(){if(!installCreatorBaldOption())return false;const s=document.getElementById('hair-style-select');if(!s.dataset.npcReliabilityBaldListener){s.dataset.npcReliabilityBaldListener='true';s.addEventListener('change',()=>{syncCreator();window.updateAppearancePreview?.();});}return true;}

  function install(){ensureCreatorDefaults();installTransparentBaldHair();installTalkFallback();installDialogueStyling();installRenderStyling();installCreatorSync();syncCreator();ensureDirectionalPlayerPresentation();}
  function maintenance(){maintenancePasses++;install();normalisePopulationHair();styleGeneratedResidents();ensureDirectionalPlayerPresentation();clearGeneratedDoorways();}

  window.NPCReliability={maintenance,ensureCreatorDefaults,ensureDirectionalPlayerPresentation,normaliseHairRecord,normalisePopulationHair,styleEntityNow,styleGeneratedResidents,inDoorClearance,clearGeneratedDoorways,safeCivilianHex,smallTalkLine,installTransparentBaldHair,refreshDoors,
    get stats(){return{maintenancePasses,doorwayMoves,talkWrapperInstalled:talkWrapped,dialogueWrapperInstalled:dialogueWrapped,renderWrapperInstalled:renderWrapped,creatorInstalled,previewWrapperInstalled:false};},DOOR_CLEARANCE_RADIUS,MALE_BALD_CHANCE,SMALL_TALK};

  const boot=setInterval(install,100);setTimeout(()=>clearInterval(boot),15000);install();
  window.__npcReliabilityMaintenanceTimer=setInterval(maintenance,1200);maintenance();
})();