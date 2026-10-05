// performanceDiagnostics.js
// Extra live diagnostics kept separate from the core renderer/profiler so we
// can measure expensive-frame causes without rewriting large gameplay files.
(() => {
    'use strict';

    const SAMPLE_CAP = 1200;
    const NEIGHBORS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    const now = () => performance.now();
    const hexDistance = (a,b) => (Math.abs(a.q-b.q)+Math.abs(a.q+a.r-b.q-b.r)+Math.abs(a.r-b.r))/2;
    const pushCapped=(arr,value)=>{arr.push(value);if(arr.length>SAMPLE_CAP)arr.splice(0,arr.length-SAMPLE_CAP);};
    const percentile=(values,p)=>{if(!values?.length)return 0;const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1))];};
    const fmt=ms=>Number(ms||0).toFixed(ms>=10?1:2);

    function installAdjacentVisibilityRule(){
        if(!window.__renderVisibilityFastPathInstalled)return false;
        const current=window.isVisibleToPlayer;if(typeof current!=='function')return false;if(current.__adjacentAutoVisible)return true;
        const wrapped=function(targetHex,friendliesOverride){if(targetHex){const friendlies=friendliesOverride||(window.entities||[]).filter(e=>e?.alive&&e.side==='player');for(const friendly of friendlies){if(!friendly?.alive)continue;const occupied=friendly.getAllHexes?friendly.getAllHexes():[friendly.hex];for(const origin of occupied){if(origin&&hexDistance(origin,targetHex)<=1){const s=window.performanceVisibilityExperimentStats;if(s)s.adjacentShortcuts++;return true;}}}}return current.apply(this,arguments);};
        wrapped.__adjacentAutoVisible=true;wrapped.__original=current;window.isVisibleToPlayer=wrapped;window.__adjacentVisibilityRuleInstalled=true;return true;
    }

    const ASSET_TRACE_CAP = 300;
    const assetTrace = window.performanceAssetTrace = window.performanceAssetTrace || {enabled:false,requests:[],composites:[],serial:0};
    function assetTraceSummary(){
        const byPath=new Map();
        for(const event of assetTrace.requests){
            const path=String(event.path); let row=byPath.get(path);
            if(!row){row={path,requests:0,seen:new Set(),lastRequest:0};byPath.set(path,row);}
            row.requests++; row.seen.add(String(event.status||'unknown')); row.lastRequest=Math.max(row.lastRequest,event.n||0);
        }
        for(const row of byPath.values()) row.current=String(window.assetManager?.status?.(row.path)||'unrequested');
        return [...byPath.values()].sort((a,b)=>b.requests-a.requests||a.path.localeCompare(b.path)).map(row=>({...row,seen:[...row.seen]}));
    }
    function traceAssetRequest(path,status){ if(!assetTrace.enabled)return; assetTrace.requests.push({n:++assetTrace.serial,path:String(path),status:String(status||'unknown'),t:now()}); if(assetTrace.requests.length>ASSET_TRACE_CAP)assetTrace.requests.splice(0,assetTrace.requests.length-ASSET_TRACE_CAP); }
    function traceCompositeStart(key,entity,facing,sources){ if(!assetTrace.enabled)return; assetTrace.composites.push({key:String(key),entityId:entity?.id||entity?.name||'unknown',facing,requestedSources:[...sources],started:now(),success:null,reason:'building'}); if(assetTrace.composites.length>100)assetTrace.composites.shift(); }
    function traceCompositeEnd(key,success,reason,extra={}){ if(!assetTrace.enabled)return; const item=[...assetTrace.composites].reverse().find(x=>x.key===String(key)&&x.success===null); if(item){item.success=!!success;item.reason=String(reason||(success?'painted':'unknown'));item.finished=now();Object.assign(item,extra);} }
    window.performanceAssetTraceApi={enable(){assetTrace.enabled=true;assetTrace.requests.length=0;assetTrace.composites.length=0;assetTrace.serial=0;},disable(){assetTrace.enabled=false;},request:path=>traceAssetRequest(path,window.assetManager?.status?.(path)||'unrequested'),compositeStart:traceCompositeStart,compositeEnd:traceCompositeEnd,report(){const pending=assetTrace.composites.filter(x=>x.success===null).length;const failed=assetTrace.composites.filter(x=>x.success===false).length;const painted=assetTrace.composites.filter(x=>x.success===true).length;return {enabled:assetTrace.enabled,requests:assetTrace.requests.slice(),composites:assetTrace.composites.slice(),summary:{requests:assetTrace.requests.length,composites:assetTrace.composites.length,painted,failed,pending,assets:assetTraceSummary()}};}};
    function buildAssetTraceText(){const r=window.performanceAssetTraceApi?.report?.();if(!r)return 'ASSET / COMPOSITE TRACE\n========================\nUnavailable.';const lines=['ASSET / COMPOSITE TRACE','========================','Requests captured: '+r.summary.requests,'Unique assets: '+r.summary.assets.length,'Composites: '+r.summary.composites+' | painted='+r.summary.painted+' | failed='+r.summary.failed+' | pending='+r.summary.pending];if(r.summary.assets.length){lines.push('','ASSET SUMMARY (captured requests)');for(const x of r.summary.assets){lines.push(x.path+' | requests='+x.requests+' | current='+x.current+' | seen='+x.seen.join('/'));}}
        if(r.requests.length){lines.push('','ASSET REQUESTS');for(const x of r.requests.slice(-80))lines.push('#'+x.n+' '+x.status+' '+x.path);}if(r.composites.length){lines.push('','COMPOSITE BUILDS');for(const x of r.composites.slice(-20)){lines.push((x.success===true?'PAINTED':x.success===false?'FAILED':'PENDING')+' '+x.entityId+' '+x.facing+' ('+x.reason+')');lines.push('  key='+x.key);lines.push('  sources='+((x.requestedSources||[]).join(', ')||'(none)'));if(x.failureSource)lines.push('  failureSource='+x.failureSource);}}return lines.join('\n');}
    window.getAssetCompositeDiagnostics=buildAssetTraceText;
    let assetRequestWrapped = false;
    function installAssetRequestTrace(){const manager=window.assetManager;if(!manager||typeof manager.request!=='function'||manager.request.__performanceAssetTrace)return !!assetRequestWrapped;const original=manager.request;const wrapped=function(path){const result=original.apply(this,arguments);traceAssetRequest(manager.canonicalPathFor?.(path)||path,manager.status?.(path)||'unrequested');return result;};wrapped.__performanceAssetTrace=true;wrapped.__original=original;manager.request=wrapped;assetRequestWrapped=true;return true;}
    const renderStats=window.performanceExtendedRenderStats={frameSamples:[],mapSamples:[],mapOtherSamples:[],entitySamples:[],sampledFrames:0};
    const terrainStats=window.performanceTerrainRebuildStats={rebuilds:0,callsObserved:0,totalMs:0,lastMs:0,maxMs:0,totalHexes:0,lastHexes:0,samples:[]};
    const visibilityExperimentStats=window.performanceVisibilityExperimentStats={adjacentShortcuts:0,runs:0,candidates:0,actualVisible:0,propagationChecks:0,propagationRejects:0,propagationFalseRejects:0};
    function clearSessionDiagnostics(){renderStats.frameSamples.length=renderStats.mapSamples.length=renderStats.mapOtherSamples.length=renderStats.entitySamples.length=0;renderStats.sampledFrames=0;terrainStats.rebuilds=terrainStats.callsObserved=0;terrainStats.totalMs=terrainStats.lastMs=terrainStats.maxMs=0;terrainStats.totalHexes=terrainStats.lastHexes=0;terrainStats.samples.length=0;visibilityExperimentStats.adjacentShortcuts=0;visibilityExperimentStats.runs=visibilityExperimentStats.candidates=visibilityExperimentStats.actualVisible=0;visibilityExperimentStats.propagationChecks=visibilityExperimentStats.propagationRejects=visibilityExperimentStats.propagationFalseRejects=0;}

    function installTerrainProbe(){const current=window.renderTerrainPass;if(typeof current!=='function')return false;if(current.__terrainPerfProbe)return true;const wrapped=function(visibleAndExplored,...rest){const t0=now();terrainStats.callsObserved++;try{return current.call(this,visibleAndExplored,...rest);}finally{const ms=now()-t0;const hexes=Array.isArray(visibleAndExplored)?visibleAndExplored.length:0;terrainStats.rebuilds++;terrainStats.totalMs+=ms;terrainStats.lastMs=ms;terrainStats.maxMs=Math.max(terrainStats.maxMs,ms);terrainStats.totalHexes+=hexes;terrainStats.lastHexes=hexes;pushCapped(terrainStats.samples,ms);}};wrapped.__terrainPerfProbe=true;wrapped.__original=current;window.renderTerrainPass=wrapped;return true;}
    let lastFrameSerial=-1,wasProfiling=false;
    function sampleRenderFrames(){const enabled=!!window.performanceMonitor?.enabled;installAssetRequestTrace();if(enabled&&!assetTrace.enabled)window.performanceAssetTraceApi.enable();if(enabled&&!wasProfiling){clearSessionDiagnostics();lastFrameSerial=window.performanceRenderStats?.frames||0;}wasProfiling=enabled;if(enabled){const r=window.performanceRenderStats;if(r&&r.frames!==lastFrameSerial){lastFrameSerial=r.frames;pushCapped(renderStats.frameSamples,r.lastFrameMs||0);pushCapped(renderStats.mapSamples,r.lastMapMs||0);pushCapped(renderStats.mapOtherSamples,r.lastMapOtherMs||0);pushCapped(renderStats.entitySamples,r.lastEntitiesMs||0);renderStats.sampledFrames++;}}requestAnimationFrame(sampleRenderFrames);}
    function inBounds(bounds,q,r){return !bounds||(q>=bounds.minQ&&q<=bounds.maxQ&&r>=bounds.minR&&r<=bounds.maxR);}
    function getRenderCensus(){const bounds=typeof window.getVisibleHexes==='function'?window.getVisibleHexes():null;const floor=window._viewerFloor||0;const friendlies=(window.entities||[]).filter(e=>e?.alive&&e.side==='player');let entityAliveFloor=0,entityInBounds=0,entityVisible=0,entityPixelOnscreen=0;for(const e of(window.entities||[])){if(!e?.alive||(e.floor||0)!==floor||!e.hex)continue;entityAliveFloor++;if(!inBounds(bounds,e.hex.q,e.hex.r))continue;entityInBounds++;if(!window.isVisibleToPlayer(e.hex,friendlies))continue;entityVisible++;const vQ=e.visualQ!==undefined?e.visualQ:e.hex.q,vR=e.visualR!==undefined?e.visualR:e.hex.r,p=window.hexToPixel?window.hexToPixel(vQ,vR):null;if(!p||!window.mapCanvas||!(p.x< -100||p.y< -100||p.x>window.mapCanvas.width+100||p.y>window.mapCanvas.height+100))entityPixelOnscreen++;}let tileObjectsTotal=0,tileObjectsInBounds=0;for(const key in(window.tileObjects||{})){tileObjectsTotal++;const split=key.split(','),q=Number(split[0]),r=Number(split[1]);if(inBounds(bounds,q,r))tileObjectsInBounds++;}let mapItemHexesTotal=0,mapItemHexesInBounds=0;for(const key in(window.mapItems||{})){const items=window.mapItems[key];if(!items?.length)continue;mapItemHexesTotal++;const split=key.split(','),q=Number(split[0]),r=Number(split[1]);if(inBounds(bounds,q,r))mapItemHexesInBounds++;}return{floor,entityAliveFloor,entityInBounds,entityVisible,entityPixelOnscreen,tileObjectsTotal,tileObjectsInBounds,mapItemHexesTotal,mapItemHexesInBounds};}
    window.getRenderPerformanceCensus=getRenderCensus;

    function runPropagationExperiment(){const friendlies=(window.entities||[]).filter(e=>e?.alive&&e.side==='player');if(!friendlies.length||typeof window.isVisibleToPlayer!=='function')return null;const liveBase=window.LIVE_VISION_RANGE||25,candidates=new Map();let maxRing=0;for(const friendly of friendlies){const origins=friendly.getAllHexes?friendly.getAllHexes():[friendly.hex],range=Math.max(0,liveBase+(friendly.visionBonus||0)),radius=Math.ceil(range);for(const origin of origins){if(!origin)continue;for(let dq=-radius;dq<=radius;dq++){const minDr=Math.max(-radius,-dq-radius),maxDr=Math.min(radius,-dq+radius);for(let dr=minDr;dr<=maxDr;dr++){const ring=(Math.abs(dq)+Math.abs(dq+dr)+Math.abs(dr))/2;if(ring>range)continue;const q=origin.q+dq,r=origin.r+dr;if(window.isHexInBounds&&!window.isHexInBounds({q,r}))continue;const key=`${q},${r}`,existing=candidates.get(key);if(!existing||ring<existing.ring)candidates.set(key,{q,r,ring});if(ring>maxRing)maxRing=ring;}}}}const actualVisible=new Set();for(const[key,c]of candidates)if(c.ring<=1||window.isVisibleToPlayer(c,friendlies))actualVisible.add(key);const propagated=new Set();for(const[key,c]of candidates)if(c.ring<=1)propagated.add(key);let checks=0,rejects=0,falseRejects=0;for(let ring=2;ring<=maxRing;ring++){for(const[key,c]of candidates){if(c.ring!==ring)continue;let hasVisibleParent=false;for(const[dq,dr]of NEIGHBORS){const parentKey=`${c.q+dq},${c.r+dr}`,parent=candidates.get(parentKey);if(parent?.ring===ring-1&&propagated.has(parentKey)){hasVisibleParent=true;break;}}if(!hasVisibleParent){rejects++;if(actualVisible.has(key))falseRejects++;continue;}checks++;if(actualVisible.has(key))propagated.add(key);}}const result={candidates:candidates.size,actualVisible:actualVisible.size,propagationChecks:checks,propagationRejects:rejects,propagationFalseRejects:falseRejects};visibilityExperimentStats.runs++;Object.assign(visibilityExperimentStats,result);return result;}
    window.runVisibilityPropagationExperiment=runPropagationExperiment;
    function maxOf(values){return values?.length?Math.max(...values):0;}
    function buildDiagnosticsText(runExperiment=true){const census=getRenderCensus(),exp=runExperiment?runPropagationExperiment():visibilityExperimentStats,terrainAvg=terrainStats.rebuilds?terrainStats.totalMs/terrainStats.rebuilds:0;return['EXTENDED RENDER DIAGNOSTICS','===========================',`Render samples: ${renderStats.sampledFrames} | frame p95=${fmt(percentile(renderStats.frameSamples,.95))} ms max=${fmt(maxOf(renderStats.frameSamples))} ms`,`Map distribution: p95=${fmt(percentile(renderStats.mapSamples,.95))} ms max=${fmt(maxOf(renderStats.mapSamples))} ms | map-other p95=${fmt(percentile(renderStats.mapOtherSamples,.95))} ms max=${fmt(maxOf(renderStats.mapOtherSamples))} ms`,`Entity-pass distribution: p95=${fmt(percentile(renderStats.entitySamples,.95))} ms max=${fmt(maxOf(renderStats.entitySamples))} ms`,`Terrain-buffer rebuilds: ${terrainStats.rebuilds} | avg=${fmt(terrainAvg)} ms p95=${fmt(percentile(terrainStats.samples,.95))} ms max=${fmt(terrainStats.maxMs)} ms | last=${fmt(terrainStats.lastMs)} ms/${terrainStats.lastHexes} hexes`,`Render census: entities floor=${census.entityAliveFloor}, inBounds=${census.entityInBounds}, visible=${census.entityVisible}, pixelOnscreen=${census.entityPixelOnscreen}`,`Static-object census: tileObjects total=${census.tileObjectsTotal}, inBounds=${census.tileObjectsInBounds} | mapItemHexes total=${census.mapItemHexesTotal}, inBounds=${census.mapItemHexesInBounds}`,`Adjacent visibility shortcuts: ${visibilityExperimentStats.adjacentShortcuts}`,exp?`Ring propagation experiment: candidates=${exp.candidates}, actualVisible=${exp.actualVisible}, wouldLOSCheck=${exp.propagationChecks}, wouldSkip=${exp.propagationRejects}, falseRejects=${exp.propagationFalseRejects}`:'Ring propagation experiment: unavailable','NOTE: ring propagation is diagnostic only; distance 0/1 auto-visibility is live.'].join('\n');}
    window.getExtendedPerformanceDiagnostics=buildDiagnosticsText;

    // This is the path already proven to appear in the iOS Copy Report output.
    // Append entity instrumentation here, rather than relying on getPerformanceReport wrapping.
    function buildEntityDiagnosticsText(){
        try {
            if(typeof window.EntityRenderInstrumentation?.report==='function') return window.EntityRenderInstrumentation.report();
            const s=window.entityRenderInstrumentationStats;
            if(!s)return 'ENTITY RENDER INSTRUMENTATION\n=============================\nProbe unavailable (script not loaded yet).';
            const avg=(total,calls)=>calls?`${(total/calls).toFixed(2)}ms avg / ${calls}`:'0.00ms avg / 0';
            return ['ENTITY RENDER INSTRUMENTATION','=============================',`drawPlayerCharacter calls=${s.calls||0} total=${Number(s.totalMs||0).toFixed(1)}ms max=${Number(s.maxMs||0).toFixed(1)}ms`,`humanoid: ${avg(s.humanoidMs,s.humanoidCalls)} max=${Number(s.humanoidMaxMs||0).toFixed(1)}ms`,`custom-image: ${avg(s.customMs,s.customCalls)} max=${Number(s.customMaxMs||0).toFixed(1)}ms`,`creature: ${avg(s.creatureMs,s.creatureCalls)} max=${Number(s.creatureMaxMs||0).toFixed(1)}ms`,`other: ${avg(s.otherMs,s.otherCalls)} max=${Number(s.otherMaxMs||0).toFixed(1)}ms`,`probe installs=${s.installs||0}`].join('\n');
        }catch(err){return `ENTITY RENDER INSTRUMENTATION\n=============================\nProbe report error: ${err?.message||err}`;}
    }
    window.getEntityRenderDiagnostics=buildEntityDiagnosticsText;

    function installClipboardAppender(){
        const clipboard=navigator.clipboard;
        if(!clipboard||typeof clipboard.writeText!=='function'||clipboard.writeText.__perfDiagnosticsAppender)return;
        const original=clipboard.writeText.bind(clipboard);
        const wrapped=function(text){
            if(typeof text==='string'&&text.startsWith('HEX-CRPG PERFORMANCE REPORT')){
                if(!text.includes('EXTENDED RENDER DIAGNOSTICS'))text+=`\n\n${buildDiagnosticsText(true)}`;
                if(!text.includes('ENTITY RENDER INSTRUMENTATION'))text+=`\n\n${buildEntityDiagnosticsText()}`;
                if(!text.includes('ASSET / COMPOSITE TRACE'))text+=`\n\n${buildAssetTraceText()}`;
            }
            return original(text);
        };
        wrapped.__perfDiagnosticsAppender=true;
        try{clipboard.writeText=wrapped;}catch(_){}
    }
    function init(){const installAll=()=>{installAdjacentVisibilityRule();installTerrainProbe();installClipboardAppender();};installAll();const retry=setInterval(installAll,250);setTimeout(()=>clearInterval(retry),10000);requestAnimationFrame(sampleRenderFrames);}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
