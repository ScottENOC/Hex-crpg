// seasonalClothing.js
// Adds unisex shorts and lets routine NPCs choose shorts/trousers from the
// in-game calendar and time of day, with stable per-person temperature taste.
(() => {
  'use strict';
  const BUILD='20260929-seasonal-clothing-v1';
  const SHORTS_ID='pants_shorts';
  const TROUSERS_ID='pants_trousers';
  const AUTO_PANTS=new Set([SHORTS_ID,TROUSERS_ID]);
  const SHORTS_HEIGHT_MULT=.48;
  const state=new WeakMap();
  let installed=false;

  function hash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function seed(e){return e?.name||`${e?.race||'unknown'}_${e?.gender||'unknown'}`;}
  function day(){return Math.floor(Math.max(0,Number(window.worldSeconds)||0)/86400);}
  function hour(){return typeof window.getCurrentHour==='function'?window.getCurrentHour():((Math.max(0,Number(window.worldSeconds)||0)%86400)/3600);}
  function eligible(e){return !!e?.equipped&&['human','elf','dwarf','goblin','orc'].includes(e.race)&&!!e.gender;}

  function registerShorts(){
    const cs=window.clothingSystem;
    if(!window.items||!cs) return false;
    if(!window.items[SHORTS_ID]){
      window.items[SHORTS_ID]={
        name:'Unisex Shorts',type:'clothes',clothingSlot:'pants',
        clothingLayers:[{id:'base',label:'Shorts',defaultColor:{hue:110,saturation:55,value:62,opacity:1},views:{
          front:'images/equipment/clothing/pants_shorts_front.png',
          back:'images/equipment/clothing/pants_shorts_back.png',
        }}],
      };
    }
    return true;
  }

  function patchShortsFit(){
    const cs=window.clothingSystem;
    if(!cs||cs.__seasonalShortsFitPatched||typeof cs.drawSlot!=='function') return false;
    const baseDraw=cs.drawSlot;
    cs.drawSlot=function(ctx,e,slot,v,bounds){
      if(slot!=='pants'||e?.equipped?.pants!==SHORTS_ID) return baseDraw(ctx,e,slot,v,bounds);
      const resolved=(v==='up'||v==='back')?'back':(v==='left'||v==='right'||v==='side')?'side':'front';
      const target=cs.clothingTargets?.[resolved]?.pants||cs.clothingTargets?.front?.pants;
      if(!target) return baseDraw(ctx,e,slot,v,bounds);
      const oldH=target.h;
      target.h=oldH*SHORTS_HEIGHT_MULT;
      try{return baseDraw(ctx,e,slot,v,bounds);}finally{target.h=oldH;}
    };
    cs.__seasonalShortsFitPatched=true;
    return true;
  }

  function seasonalWarmth(){
    // worldTime.js uses a 360-day year; its summer daylight peak is month 5
    // (day ~165) and winter trough month 11. A smooth curve avoids one hard
    // calendar day where the whole town changes clothes at once.
    const doy=((day()%360)+360)%360;
    const seasonal=Math.cos(((doy-165)/360)*Math.PI*2);
    // The same date feels cooler in the morning/evening than mid-afternoon.
    const diurnal=Math.cos(((hour()-14)/24)*Math.PI*2)*.12;
    return seasonal+diurnal;
  }

  function shortsThreshold(e){
    // Range -0.25..1.05: some people keep shorts well into shoulder seasons,
    // while others prefer trousers almost all year. Stable for each character.
    const u=(hash(`${seed(e)}|shorts-tolerance`)%10001)/10000;
    return -.25+u*1.30;
  }

  function choosePants(e){
    const d=day();
    // Tiny stable day-to-day variation stops two otherwise identical dates
    // around a person's cutoff from always resolving the same way.
    const daily=(((hash(`${seed(e)}|pants-weather|${d}`)%10001)/10000)-.5)*.16;
    return seasonalWarmth()+daily>=shortsThreshold(e)?SHORTS_ID:TROUSERS_ID;
  }

  function copyColour(e,oldId,newId){
    const old=e?.clothingColors?.[oldId]?.base;
    if(!old) return;
    e.clothingColors=e.clothingColors||{};
    const next=e.clothingColors[newId]||(e.clothingColors[newId]={});
    if(!next.base) next.base={...old};
  }

  function reconsider(e,{allowPlayer=false}={}){
    if(!eligible(e)||(!allowPlayer&&e.side==='player')) return false;
    const current=e.equipped.pants;
    // Never replace a deliberately authored special outfit such as hose,
    // breeches or wraps. Seasonal automation only owns trousers vs shorts.
    if(current&&!AUTO_PANTS.has(current)) return false;
    const next=choosePants(e);
    if(current===next) return false;
    if(current) copyColour(e,current,next);
    e.equipped.pants=next;
    if(Array.isArray(e.inventory)&&!e.inventory.includes(next)) e.inventory.push(next);
    return true;
  }

  function update(){
    if(!registerShorts()) return;
    patchShortsFit();
    const d=day(),h=hour();
    const seen=new Set();
    const all=[...(window.entities||[])];
    if(window.player&&!all.includes(window.player)) all.push(window.player);
    for(const e of all){
      if(!eligible(e)||seen.has(e)) continue;
      seen.add(e);
      let s=state.get(e);
      if(!s){s={initialDone:false,lastRoutineDay:null};state.set(e,s);}

      // Start/load: choose an appropriate lower garment once. The player can
      // subsequently override it manually; only routine NPCs are reconsidered.
      if(!s.initialDone){
        reconsider(e,{allowPlayer:true});
        s.initialDone=true;
      }

      // Routine NPCs dress for the day once each morning. This deliberately
      // happens before/around their scheduled departure rather than every tick,
      // so clothing doesn't flicker as the seasonal score changes through a day.
      if(e.isNPC&&e.side==='neutral'&&(e.prefersRoads||e.destination)&&h>=5&&h<14&&s.lastRoutineDay!==d){
        reconsider(e);
        s.lastRoutineDay=d;
      }
    }
  }

  function install(){
    if(installed) return;
    if(!registerShorts()) return;
    patchShortsFit();
    installed=true;
    update();
    setInterval(update,1000);
  }

  const timer=setInterval(()=>{install();if(installed)clearInterval(timer);},50);
  if(document.readyState==='complete') install(); else window.addEventListener('load',install,{once:true});

  window.seasonalClothing={build:BUILD,choosePants,reconsider,update};
})();
