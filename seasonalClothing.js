// seasonalClothing.js
// Adds unisex shorts and lets routine NPCs choose shorts/trousers from the
// live outdoor temperature at their own location, with stable per-person taste.
(() => {
  'use strict';
  const BUILD='20260930-weather-temperature-v4';
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
  function destinationKey(e){const d=e?.destination;return d?`${d.q},${d.r}`:null;}

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

  function fallbackTemperatureC(){
    // Compatibility fallback if this module is ever loaded without
    // weatherSystem.js: preserves the old seasonal/day-night behaviour but
    // expresses it in degrees so the clothing decision uses one scale.
    const doy=((day()%360)+360)%360;
    const seasonal=Math.cos(((doy-165)/360)*Math.PI*2);
    const diurnal=Math.cos(((hour()-14)/24)*Math.PI*2);
    return 14 + seasonal*10 + diurnal*5;
  }

  function outdoorFeelsLikeC(e){
    // Weather is spatial now: lower-r/northern NPCs genuinely experience a
    // colder version of the same weather front, so their clothing choice must
    // use their own hex rather than the player's current local temperature.
    if(typeof window.getFeelsLikeTemperatureC==='function') return window.getFeelsLikeTemperatureC(undefined,e?.hex);
    return fallbackTemperatureC();
  }

  function shortsThresholdC(e){
    // Roughly 13..26 C: some people reach for shorts on the first mild day;
    // others keep trousers on until it is genuinely hot. Stable per person.
    const u=(hash(`${seed(e)}|shorts-tolerance`)%10001)/10000;
    return 13+u*13;
  }

  function choosePants(e){
    const d=day();
    // Small stable day-to-day personal variation prevents identical threshold
    // temperatures from making a character flip at exactly the same degree.
    const personalDaily=(((hash(`${seed(e)}|pants-weather|${d}`)%10001)/10000)-.5)*1.5;
    return outdoorFeelsLikeC(e)+personalDaily>=shortsThresholdC(e)?SHORTS_ID:TROUSERS_ID;
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
    const d=day();
    const seen=new Set();
    const all=[...(window.entities||[])];
    if(window.player&&!all.includes(window.player)) all.push(window.player);
    const partyHexes=(typeof window.collectPartyHexes==='function')?window.collectPartyHexes():null;
    for(const e of all){
      if(!eligible(e)||seen.has(e)) continue;
      seen.add(e);
      let s=state.get(e);
      if(!s){s={initialDone:false,lastDepartureDay:null,lastDestination:null};state.set(e,s);}

      // Start/load: choose an appropriate lower garment once. The player can
      // subsequently override it manually; only routine NPCs are reconsidered.
      if(!s.initialDone){
        reconsider(e,{allowPlayer:true});
        s.initialDone=true;
      }

      // A routine NPC reconsiders clothing when they actually set off from a
      // stationary/home state, rather than everyone changing at one clock-time
      // cutoff. Cap this to once per in-game day, so later errands do not make
      // someone repeatedly change trousers in the street.
      const dest=destinationKey(e);
      const routine=e.isNPC&&e.side==='neutral'&&(e.prefersRoads||dest);
      const justSetOff=routine&&dest&&!s.lastDestination;
      if(justSetOff&&s.lastDepartureDay!==d){
        reconsider(e);
        s.lastDepartureDay=d;
      }

      // Distant routine NPCs are schedule-snapped instead of being given a
      // destination. Give those unobserved characters one daily reconsideration
      // as well; there is no visible mid-walk change because they are dormant.
      const dormant=routine&&partyHexes&&typeof window.isDormantAmbientNpc==='function'
        ? window.isDormantAmbientNpc(e,partyHexes)
        : false;
      if(dormant&&s.lastDepartureDay!==d){
        reconsider(e);
        s.lastDepartureDay=d;
      }
      s.lastDestination=dest;
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

  window.seasonalClothing={build:BUILD,choosePants,reconsider,update,outdoorFeelsLikeC};
})();
