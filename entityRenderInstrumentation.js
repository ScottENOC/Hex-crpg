// entityRenderInstrumentation.js
// Live humanoid render instrumentation, directional composite cache, and the
// post-start asset readiness gate. The gate keeps controls covered while the
// newly-instantiated campaign reveals and decodes its real art dependencies.
(() => {
  'use strict';
  if (window.__entityRenderInstrumentationInstalled) return;
  window.__entityRenderInstrumentationInstalled = true;

  const compositeCache = new WeakMap();
  const PAD_HEXES = 4;
  const stats = window.entityRenderInstrumentationStats = {
    installed:false,calls:0,totalMs:0,maxMs:0,
    humanoidCalls:0,humanoidMs:0,humanoidMaxMs:0,customCalls:0,customMs:0,customMaxMs:0,
    creatureCalls:0,creatureMs:0,creatureMaxMs:0,otherCalls:0,otherMs:0,otherMaxMs:0,
    cacheHits:0,cacheMisses:0,cacheBuilds:0,cacheFailed:0,cacheBuildMs:0,cacheMaxBuildMs:0,
    directionHits:0,appearanceInvalidations:0,sideMirrorHits:0,readinessBypasses:0,
    postStartAssets:0,postStartFailures:0,postStartGateMs:0,samples:[],installs:0,
  };

  // Cache is deliberately closed until the post-start gate proves that the
  // campaign's discovered art is decoded. This prevents half-drawn people from
  // becoming persistent cached composites.
  let compositeCacheReady=false;
  let discoveryActive=false;
  let discoveryChangedAt=0;
  const discoveredAssets=new Set();
  const originalImageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');

  function schedulerState(){return window.__assetLoadScheduler;}
  function publishReadiness(ready){
    compositeCacheReady=!!ready;
    const scheduler=schedulerState();
    if(scheduler){
      try{Object.defineProperty(scheduler,'compositeCacheReady',{configurable:true,get:()=>compositeCacheReady});}catch(_){scheduler.compositeCacheReady=compositeCacheReady;}
    }
  }
  publishReadiness(false);

  function localArtPath(value){
    if(!value||/^(?:data:|blob:)/i.test(String(value)))return null;
    try{
      const url=new URL(String(value),document.baseURI),base=new URL('.',document.baseURI);
      if(url.origin!==base.origin)return null;
      const basePath=base.pathname.endsWith('/')?base.pathname:`${base.pathname}/`;
      if(!url.pathname.startsWith(basePath))return null;
      const path=decodeURIComponent(url.pathname.slice(basePath.length)).replace(/^\/+/, '');
      return path.startsWith('images/')?path:null;
    }catch(_){const path=String(value).replace(/^\.\//,'').split('?')[0];return path.startsWith('images/')?path:null;}
  }
  function noteAsset(value){
    if(!discoveryActive)return;
    const path=localArtPath(value);if(!path)return;
    const canonical=window.assetManager?.canonicalPathFor?.(path)||path;
    if(!discoveredAssets.has(canonical)){discoveredAssets.add(canonical);discoveryChangedAt=performance.now();stats.postStartAssets=discoveredAssets.size;}
  }
  // Observe game code assigning Image.src after entities are instantiated. We
  // delegate to the existing AssetManager setter, so this adds no network path.
  if(originalImageSrc?.get&&originalImageSrc?.set&&!originalImageSrc.set.__postStartDiscovery){
    const previousSet=originalImageSrc.set,previousGet=originalImageSrc.get;
    const observingSet=function(value){noteAsset(value);return previousSet.call(this,value);};
    observingSet.__postStartDiscovery=true;
    try{Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,enumerable:originalImageSrc.enumerable,get:previousGet,set:observingSet});}catch(err){console.warn('[asset-gate] could not install image discovery observer',err);}
  }

  function classify(entity){if(!entity)return 'other';if(entity.customImage)return 'custom';if(entity.race&&entity.gender)return 'humanoid';if(entity.image||entity.sprite||entity.race||entity.type)return 'creature';return 'other';}
  function combatActive(){try{return typeof window.isInCombat==='function'?!!window.isInCombat():!!window.isInCombat;}catch(_){return true;}}
  function safeJson(v){try{return JSON.stringify(v)||'';}catch(_){return String(v??'');}}
  function appearanceKey(e,z,flyOff){return [e.race||'',e.gender||'',e.bodyType||'',e.hairStyle||'',e.facialHairStyle||'',e.hairHue??'',e.hairLightMult??'',e.hairSatMult??'',e.skinHue??'',e.skinSaturation??'',e.skinLightness??'',e.displayArmour===false?0:1,e.displayClothes===false?0:1,e.goldGear?1:0,Number(z||1).toFixed(3),Number(flyOff||0).toFixed(3),Number(window.hexSize||30).toFixed(2),safeJson(e.equipped),safeJson(e.clothing),safeJson(e.equippedClothing),safeJson(e.clothingColors),safeJson(e.shieldAppearance),safeJson(e.equipmentAppearance),safeJson(e.facialHair),safeJson(e.tattoos),safeJson(e.scars)].join('|');}
  function facingKey(e){const f=e?.facing;return f==='up'||f==='left'||f==='right'||f==='down'?f:'down';}
  function hasShield(e){const eq=e?.equipped||{};return !!(eq.shield||eq.offHand?.type==='shield'||eq.mainHand?.type==='shield'||eq.offhand?.type==='shield'||eq.mainhand?.type==='shield');}
  function sideMirrorSafe(e){if(hasShield(e)||e?.shieldAppearance||e?.quiver||e?.quiverAppearance)return false;if(Array.isArray(e?.tattoos)&&e.tattoos.length)return false;if(Array.isArray(e?.scars)&&e.scars.length)return false;return !(e?.asymmetricAppearance||e?.asymmetricHair||e?.forceFourFacingSprites);}
  function oppositeSide(f){return f==='left'?'right':f==='right'?'left':null;}
  function syncLegacyCacheStat(name,amount=1){const s=window.humanoidSpriteCacheStats;if(!s)return;if(name==='hits')s.hits=(s.hits||0)+amount;else if(name==='misses')s.misses=(s.misses||0)+amount;else if(name==='builds')s.builds=(s.builds||0)+amount;else if(name==='failedBuilds')s.failedBuilds=(s.failedBuilds||0)+amount;else if(name==='buildMs'){s.buildMs=(s.buildMs||0)+amount;s.maxBuildMs=Math.max(s.maxBuildMs||0,amount);}}
  function record(kind,ms,entity){stats.calls++;stats.totalMs+=ms;stats.maxMs=Math.max(stats.maxMs,ms);stats[`${kind}Calls`]++;stats[`${kind}Ms`]+=ms;stats[`${kind}MaxMs`]=Math.max(stats[`${kind}MaxMs`],ms);if(ms>=1){stats.samples.push({ms,kind,name:entity?.name||entity?.id||entity?.type||entity?.race||'unknown',race:entity?.race||'',gender:entity?.gender||'',side:entity?.side||''});stats.samples.sort((a,b)=>b.ms-a.ms);if(stats.samples.length>30)stats.samples.length=30;}}
  function buildComposite(original,entity,z,flyOff){const hs=Math.max(1,Number(window.hexSize||30)),scale=Math.max(.1,Number(z||1)),size=Math.max(64,Math.ceil(hs*scale*PAD_HEXES*2)),canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const off=canvas.getContext('2d');if(!off)return null;const cx=size/2,cy=size/2,t0=performance.now();original(off,entity,cx,cy,z,flyOff);const ms=performance.now()-t0;stats.cacheBuildMs+=ms;stats.cacheMaxBuildMs=Math.max(stats.cacheMaxBuildMs,ms);syncLegacyCacheStat('buildMs',ms);stats.cacheBuilds++;syncLegacyCacheStat('builds');return {canvas,cx,cy};}
  function chainHas(fn,marker){const seen=new Set();while(typeof fn==='function'&&!seen.has(fn)){seen.add(fn);if(fn[marker])return true;fn=fn.__original;}return false;}
  function drawMirrored(ctx,entry,x,y){ctx.save();try{ctx.translate(x,0);ctx.scale(-1,1);ctx.translate(-x,0);ctx.drawImage(entry.canvas,x-entry.cx,y-entry.cy);}finally{ctx.restore();}}

  function installDrawProbe(){
    const current=window.drawPlayerCharacter;if(typeof current!=='function')return false;if(chainHas(current,'__directionalHumanoidCompositeCache'))return true;
    const wrapped=function(ctx,entity,...rest){const kind=classify(entity),x=rest[0],y=rest[1],z=rest[2]??1,flyOff=rest[3]??0,t0=performance.now();try{
      const humanoid=kind==='humanoid'&&!entity.customImage&&!combatActive()&&ctx;
      if(humanoid&&!compositeCacheReady){stats.readinessBypasses++;compositeCache.delete(entity);return current.call(this,ctx,entity,...rest);}
      if(humanoid){const baseKey=appearanceKey(entity,z,flyOff),facing=facingKey(entity);let bucket=compositeCache.get(entity);if(!bucket||bucket.appearanceKey!==baseKey){if(bucket)stats.appearanceInvalidations++;bucket={appearanceKey:baseKey,views:new Map()};compositeCache.set(entity,bucket);}let entry=bucket.views.get(facing);if(entry){stats.cacheHits++;stats.directionHits++;syncLegacyCacheStat('hits');ctx.drawImage(entry.canvas,x-entry.cx,y-entry.cy);return;}const opposite=oppositeSide(facing);if(opposite&&sideMirrorSafe(entity)){const oppositeEntry=bucket.views.get(opposite);if(oppositeEntry){stats.cacheHits++;stats.directionHits++;stats.sideMirrorHits++;syncLegacyCacheStat('hits');drawMirrored(ctx,oppositeEntry,x,y);return;}}stats.cacheMisses++;syncLegacyCacheStat('misses');try{entry=buildComposite(current,entity,z,flyOff);}catch(err){entry=null;console.warn('[humanoid-cache] directional composite build failed',entity?.name,facing,err);}if(entry){bucket.views.set(facing,entry);ctx.drawImage(entry.canvas,x-entry.cx,y-entry.cy);return;}stats.cacheFailed++;syncLegacyCacheStat('failedBuilds');}
      return current.call(this,ctx,entity,...rest);
    }finally{record(kind,performance.now()-t0,entity);}};
    wrapped.__entityRenderInstrumentation=true;wrapped.__liveHumanoidCompositeCache=true;wrapped.__directionalHumanoidCompositeCache=true;wrapped.__stableNpcCompositeCache=true;wrapped.__original=current;if(chainHas(current,'__directHumanoidCompositor'))wrapped.__directHumanoidCompositor=true;window.drawPlayerCharacter=wrapped;window.__hexInstrumentedDrawPlayerCharacter=wrapped;try{(0,eval)('drawPlayerCharacter = window.__hexInstrumentedDrawPlayerCharacter');}catch(_){}window.clearHumanoidSpriteCache=entity=>{if(entity)compositeCache.delete(entity);};stats.installs++;stats.installed=true;return true;
  }

  function ensurePostStartOverlay(){
    let el=document.getElementById('hex-post-start-asset-gate');if(el)return el;
    el=document.createElement('div');el.id='hex-post-start-asset-gate';el.style.cssText='position:fixed;inset:0;z-index:2147483647;background:linear-gradient(180deg,#151515,#090909);display:none;align-items:center;justify-content:center;color:#f4ead2;font-family:Georgia,serif;padding:24px;box-sizing:border-box';
    el.innerHTML='<div style="width:min(540px,92vw);padding:28px;border:1px solid #8f7445;border-radius:10px;background:#201d19;box-shadow:0 18px 60px #000a;text-align:center"><h2 data-title style="margin:0 0 14px">Preparing campaign…</h2><p data-count style="color:#d7c9a7">Discovering character art…</p><div style="height:12px;border-radius:999px;overflow:hidden;background:#0d0c0a;border:1px solid #5f5037"><div data-bar style="height:100%;width:4%;background:#b89a5c;transition:width .12s linear"></div></div><p data-error style="color:#efb0a8;word-break:break-word" hidden></p><div data-actions style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap"><button data-retry hidden style="margin-top:12px;padding:9px 16px">Retry failed assets</button><button data-danger hidden style="margin-top:12px;padding:9px 16px;background:#7d261f;color:white">⚠ Proceed anyway — danger</button></div></div>';
    document.body.appendChild(el);return el;
  }
  function gateProgress(el,done,total,label='Loading campaign art…'){el.querySelector('[data-title]').textContent=label;el.querySelector('[data-count]').textContent=total?`Loaded ${done} / ${total} discovered art assets`:'Discovering character and equipment art…';el.querySelector('[data-bar]').style.width=`${total?Math.max(4,Math.round(done*100/total)):4}%`;}
  function delay(ms){return new Promise(r=>setTimeout(r,ms));}
  async function waitForDiscoveryQuiet(){let stableSince=performance.now();let lastSize=-1;while(true){const size=discoveredAssets.size;if(size!==lastSize){lastSize=size;stableSince=performance.now();}if(performance.now()-stableSince>=350)return;await delay(50);}}
  async function loadDiscovered(el,paths){
    let done=0;gateProgress(el,0,paths.length);
    const failed=[];
    await Promise.all(paths.map(async path=>{try{await window.assetManager.load(path,{priority:-100,immediate:true});}catch(_){failed.push(path);}finally{done++;gateProgress(el,done,paths.length);}}));
    return failed;
  }
  async function postStartGate(){
    const el=ensurePostStartOverlay();el.style.display='flex';const started=performance.now();publishReadiness(false);
    // Allow synchronous startGame plus a short quiet period to reveal the real
    // entity/body/hair/clothing/equipment requests. No cache builds are retained.
    await waitForDiscoveryQuiet();
    let failed=[];
    while(true){
      const paths=[...discoveredAssets];failed=await loadDiscovered(el,paths);
      await waitForDiscoveryQuiet();
      if(discoveredAssets.size!==paths.length)continue;
      if(!failed.length)break;
      stats.postStartFailures=failed.length;
      const error=el.querySelector('[data-error]'),retry=el.querySelector('[data-retry]'),danger=el.querySelector('[data-danger]');
      const names=failed.slice(0,5).map(p=>p.split('/').pop()).join(', ');
      error.textContent=`${failed.length} required art asset${failed.length===1?'':'s'} could not be loaded${names?`: ${names}`:''}. Retry is safest. Proceeding may show missing characters, clothing or equipment; incomplete composites will NOT be cached.`;error.hidden=false;retry.hidden=false;danger.hidden=false;
      const action=await new Promise(resolve=>{retry.onclick=()=>resolve('retry');danger.onclick=()=>resolve('danger');});retry.onclick=null;danger.onclick=null;retry.hidden=true;danger.hidden=true;error.hidden=true;
      if(action==='danger'){discoveryActive=false;publishReadiness(false);stats.postStartGateMs=performance.now()-started;el.style.display='none';console.warn('[asset-gate] User proceeded with missing art; humanoid composite cache remains disabled for safety.',failed);return;}
      // AssetManager owns retry/backoff; a fresh load after the user explicitly
      // retries will re-enter its normal recovery path.
      await delay(250);
    }
    discoveryActive=false;publishReadiness(true);stats.postStartGateMs=performance.now()-started;el.style.display='none';
    // First gameplay render can now populate only complete directional composites.
    try{window.drawMap?.();}catch(_){}
  }
  function installStartGate(){
    const current=window.startGame;if(typeof current!=='function'||current.__postStartAssetGate)return false;
    const wrapped=function(...args){
      publishReadiness(false);discoveredAssets.clear();discoveryChangedAt=performance.now();discoveryActive=true;
      const result=current.apply(this,args);
      queueMicrotask(()=>postStartGate().catch(err=>{console.error('[asset-gate] post-start readiness gate failed',err);discoveryActive=false;publishReadiness(false);const el=ensurePostStartOverlay();el.style.display='flex';el.querySelector('[data-title]').textContent='Campaign art check failed';el.querySelector('[data-error]').textContent='The asset readiness check itself failed. Reload is safest; composite caching remains disabled so a partial character cannot be cached.';el.querySelector('[data-error]').hidden=false;}));
      return result;
    };
    wrapped.__postStartAssetGate=true;wrapped.__original=current;window.startGame=wrapped;return true;
  }

  function fmt(total,calls){return calls?`${(total/calls).toFixed(2)}ms avg / ${calls}`:'0.00ms avg / 0';}
  function report(){const lookups=stats.cacheHits+stats.cacheMisses,rate=lookups?(100*stats.cacheHits/lookups).toFixed(1):'0.0';const lines=['','ENTITY RENDER INSTRUMENTATION','=============================',`drawPlayerCharacter calls=${stats.calls} total=${stats.totalMs.toFixed(1)}ms avg=${stats.calls?(stats.totalMs/stats.calls).toFixed(2):'0.00'}ms max=${stats.maxMs.toFixed(1)}ms`,`humanoid: ${fmt(stats.humanoidMs,stats.humanoidCalls)} max=${stats.humanoidMaxMs.toFixed(1)}ms`,`live composite cache: hits=${stats.cacheHits} misses=${stats.cacheMisses} hitRate=${rate}% builds=${stats.cacheBuilds} failed=${stats.cacheFailed}`,`directional cache: retainedHits=${stats.directionHits} mirroredSideHits=${stats.sideMirrorHits} appearanceInvalidations=${stats.appearanceInvalidations}`,`asset gate: cacheReady=${compositeCacheReady} discovered=${stats.postStartAssets} failures=${stats.postStartFailures} gateMs=${stats.postStartGateMs.toFixed(0)} readinessBypasses=${stats.readinessBypasses}`,`composite build avg=${stats.cacheBuilds?(stats.cacheBuildMs/stats.cacheBuilds).toFixed(2):'0.00'}ms max=${stats.cacheMaxBuildMs.toFixed(1)}ms`,`probe installs=${stats.installs}`];if(stats.samples.length){lines.push('Slowest character draws:');for(const s of stats.samples.slice(0,15))lines.push(`- ${s.ms.toFixed(1)}ms ${s.kind} ${s.name}${s.race?` [${s.race}/${s.gender||'?'}]`:''}${s.side?` side=${s.side}`:''}`);}return lines.join('\n');}
  function installReport(){const current=window.getPerformanceReport;if(typeof current!=='function')return false;if(chainHas(current,'__entityRenderInstrumentationReport'))return true;const wrapped=function(...args){return `${current.apply(this,args)}\n${report()}`;};wrapped.__entityRenderInstrumentationReport=true;wrapped.__original=current;window.getPerformanceReport=wrapped;return true;}
  function installAll(){installDrawProbe();installReport();installStartGate();publishReadiness(compositeCacheReady);return true;}
  installAll();const timer=setInterval(installAll,250);
  window.EntityRenderInstrumentation={stats,report,install:installAll,clear(entity){if(entity)compositeCache.delete(entity);},get cacheReady(){return compositeCacheReady;},stop(){clearInterval(timer);}};
})();
