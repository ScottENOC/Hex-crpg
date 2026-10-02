// entityRenderInstrumentation.js
// Instrument the proven live humanoid draw path and cache its completed
// out-of-combat composite. This deliberately lives on the same wrapper that
// the iOS profiler proved is actually called by renderEntities, avoiding the
// Safari/global-binding ambiguity that left humanoidSpriteCache at 0 lookups.
(() => {
  'use strict';
  if (window.__entityRenderInstrumentationInstalled) return;
  window.__entityRenderInstrumentationInstalled = true;

  const compositeCache = new WeakMap();
  const PAD_HEXES = 4;
  const stats = window.entityRenderInstrumentationStats = {
    installed:false,calls:0,totalMs:0,maxMs:0,
    humanoidCalls:0,humanoidMs:0,humanoidMaxMs:0,
    customCalls:0,customMs:0,customMaxMs:0,
    creatureCalls:0,creatureMs:0,creatureMaxMs:0,
    otherCalls:0,otherMs:0,otherMaxMs:0,
    cacheHits:0,cacheMisses:0,cacheBuilds:0,cacheFailed:0,cacheBuildMs:0,cacheMaxBuildMs:0,
    samples:[],installs:0,
  };

  function classify(entity){
    if(!entity)return 'other';
    if(entity.customImage)return 'custom';
    if(entity.race&&entity.gender)return 'humanoid';
    if(entity.image||entity.sprite||entity.race||entity.type)return 'creature';
    return 'other';
  }
  function combatActive(){
    try{return typeof window.isInCombat==='function'?!!window.isInCombat():!!window.isInCombat;}
    catch(_){return true;}
  }
  function safeJson(v){try{return JSON.stringify(v)||'';}catch(_){return String(v??'');}}
  function appearanceKey(e,z,flyOff){
    return [e.facing||'down',e.race||'',e.gender||'',e.bodyType||'',e.hairStyle||'',e.facialHairStyle||'',
      e.hairHue??'',e.hairLightMult??'',e.hairSatMult??'',e.skinHue??'',e.skinSaturation??'',e.skinLightness??'',
      e.displayArmour===false?0:1,e.displayClothes===false?0:1,e.goldGear?1:0,
      Number(z||1).toFixed(3),Number(flyOff||0).toFixed(3),Number(window.hexSize||30).toFixed(2),
      safeJson(e.equipped),safeJson(e.clothing),safeJson(e.equippedClothing),safeJson(e.clothingColors),
      safeJson(e.shieldAppearance),safeJson(e.equipmentAppearance),safeJson(e.facialHair),safeJson(e.tattoos),safeJson(e.scars)
    ].join('|');
  }
  function syncLegacyCacheStat(name,amount=1){
    const s=window.humanoidSpriteCacheStats;if(!s)return;
    if(name==='hits'){s.hits=(s.hits||0)+amount;}
    else if(name==='misses'){s.misses=(s.misses||0)+amount;}
    else if(name==='builds'){s.builds=(s.builds||0)+amount;}
    else if(name==='failedBuilds'){s.failedBuilds=(s.failedBuilds||0)+amount;}
    else if(name==='buildMs'){s.buildMs=(s.buildMs||0)+amount;s.maxBuildMs=Math.max(s.maxBuildMs||0,amount);}
  }
  function record(kind,ms,entity){
    stats.calls++;stats.totalMs+=ms;stats.maxMs=Math.max(stats.maxMs,ms);
    stats[`${kind}Calls`]++;stats[`${kind}Ms`]+=ms;stats[`${kind}MaxMs`]=Math.max(stats[`${kind}MaxMs`],ms);
    if(ms>=1){stats.samples.push({ms,kind,name:entity?.name||entity?.id||entity?.type||entity?.race||'unknown',race:entity?.race||'',gender:entity?.gender||'',side:entity?.side||''});stats.samples.sort((a,b)=>b.ms-a.ms);if(stats.samples.length>30)stats.samples.length=30;}
  }
  function buildComposite(original,entity,z,flyOff){
    const hs=Math.max(1,Number(window.hexSize||30)),scale=Math.max(.1,Number(z||1));
    const size=Math.max(64,Math.ceil(hs*scale*PAD_HEXES*2));
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const off=canvas.getContext('2d');if(!off)return null;
    const cx=size/2,cy=size/2,t0=performance.now();
    original(off,entity,cx,cy,z,flyOff);
    const ms=performance.now()-t0;stats.cacheBuildMs+=ms;stats.cacheMaxBuildMs=Math.max(stats.cacheMaxBuildMs,ms);syncLegacyCacheStat('buildMs',ms);
    stats.cacheBuilds++;syncLegacyCacheStat('builds');
    return {canvas,key:appearanceKey(entity,z,flyOff),cx,cy};
  }
  function chainHas(fn,marker){
    const seen=new Set();while(typeof fn==='function'&&!seen.has(fn)){seen.add(fn);if(fn[marker])return true;fn=fn.__original;}return false;
  }

  function installDrawProbe(){
    const current=window.drawPlayerCharacter;
    if(typeof current!=='function')return false;
    // Do not create another wrapper tower. A marker anywhere in the live
    // __original chain means this exact caching/instrumentation path exists.
    if(chainHas(current,'__liveHumanoidCompositeCache'))return true;

    const wrapped=function(ctx,entity,...rest){
      const kind=classify(entity),x=rest[0],y=rest[1],z=rest[2]??1,flyOff=rest[3]??0;
      const t0=performance.now();
      try{
        const cacheable=kind==='humanoid'&&!entity.customImage&&!combatActive()&&ctx;
        if(cacheable){
          const key=appearanceKey(entity,z,flyOff);let entry=compositeCache.get(entity);
          if(entry&&entry.key===key){
            stats.cacheHits++;syncLegacyCacheStat('hits');
            const legacy=window.humanoidSpriteCacheStats;if(legacy){if(entity.side==='player')legacy.playerHits=(legacy.playerHits||0)+1;else legacy.npcHits=(legacy.npcHits||0)+1;}
            ctx.drawImage(entry.canvas,x-entry.cx,y-entry.cy);return;
          }
          stats.cacheMisses++;syncLegacyCacheStat('misses');
          try{entry=buildComposite(current,entity,z,flyOff);}catch(err){entry=null;console.warn('[humanoid-cache] composite build failed',entity?.name,err);}
          if(entry){compositeCache.set(entity,entry);ctx.drawImage(entry.canvas,x-entry.cx,y-entry.cy);return;}
          stats.cacheFailed++;syncLegacyCacheStat('failedBuilds');
        }
        return current.call(this,ctx,entity,...rest);
      }finally{record(kind,performance.now()-t0,entity);}
    };
    wrapped.__entityRenderInstrumentation=true;
    wrapped.__liveHumanoidCompositeCache=true;
    wrapped.__stableNpcCompositeCache=true;
    wrapped.__original=current;
    if(chainHas(current,'__directHumanoidCompositor'))wrapped.__directHumanoidCompositor=true;
    window.drawPlayerCharacter=wrapped;
    window.__hexInstrumentedDrawPlayerCharacter=wrapped;
    try{(0,eval)('drawPlayerCharacter = window.__hexInstrumentedDrawPlayerCharacter');}catch(_){}
    window.clearHumanoidSpriteCache=entity=>{if(entity)compositeCache.delete(entity);};
    stats.installs++;stats.installed=true;return true;
  }

  function fmt(total,calls){return calls?`${(total/calls).toFixed(2)}ms avg / ${calls}`:'0.00ms avg / 0';}
  function report(){
    const lookups=stats.cacheHits+stats.cacheMisses,rate=lookups?(100*stats.cacheHits/lookups).toFixed(1):'0.0';
    const lines=['','ENTITY RENDER INSTRUMENTATION','=============================',
      `drawPlayerCharacter calls=${stats.calls} total=${stats.totalMs.toFixed(1)}ms avg=${stats.calls?(stats.totalMs/stats.calls).toFixed(2):'0.00'}ms max=${stats.maxMs.toFixed(1)}ms`,
      `humanoid: ${fmt(stats.humanoidMs,stats.humanoidCalls)} max=${stats.humanoidMaxMs.toFixed(1)}ms`,
      `custom-image: ${fmt(stats.customMs,stats.customCalls)} max=${stats.customMaxMs.toFixed(1)}ms`,
      `creature: ${fmt(stats.creatureMs,stats.creatureCalls)} max=${stats.creatureMaxMs.toFixed(1)}ms`,
      `other: ${fmt(stats.otherMs,stats.otherCalls)} max=${stats.otherMaxMs.toFixed(1)}ms`,
      `live composite cache: hits=${stats.cacheHits} misses=${stats.cacheMisses} hitRate=${rate}% builds=${stats.cacheBuilds} failed=${stats.cacheFailed}`,
      `composite build avg=${stats.cacheBuilds?(stats.cacheBuildMs/stats.cacheBuilds).toFixed(2):'0.00'}ms max=${stats.cacheMaxBuildMs.toFixed(1)}ms`,
      `probe installs=${stats.installs}`];
    if(stats.samples.length){lines.push('Slowest character draws:');for(const s of stats.samples.slice(0,15))lines.push(`- ${s.ms.toFixed(1)}ms ${s.kind} ${s.name}${s.race?` [${s.race}/${s.gender||'?'}]`:''}${s.side?` side=${s.side}`:''}`);}
    return lines.join('\n');
  }
  function installReport(){const current=window.getPerformanceReport;if(typeof current!=='function')return false;if(chainHas(current,'__entityRenderInstrumentationReport'))return true;const wrapped=function(...args){return `${current.apply(this,args)}\n${report()}`;};wrapped.__entityRenderInstrumentationReport=true;wrapped.__original=current;window.getPerformanceReport=wrapped;return true;}
  function installAll(){return installDrawProbe()&&installReport();}
  installAll();
  const timer=setInterval(()=>{installDrawProbe();installReport();},1000);
  window.EntityRenderInstrumentation={stats,report,install:installAll,clear(entity){if(entity)compositeCache.delete(entity);},stop(){clearInterval(timer);}};
})();
