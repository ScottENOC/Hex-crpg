// preciseAppearanceColor.js
// Replaces one-dimensional hue-only appearance controls with a compact HSV picker:
// horizontal hue + 2D saturation/value plane + exact H/S/V numeric inputs.
(() => {
  'use strict';

  const BUILD = '20260928-precise-colour-v1';
  const bodyCache = new Map();
  const hairCache = new Map();
  const sourceIds = new WeakMap();
  let nextSourceId = 1;

  const DEFAULTS = {
    shirt:{saturation:72,value:72},
    pants:{saturation:62,value:55},
    hair:{saturation:58,value:42},
    clothingPrimary:{saturation:76,value:70},
    clothingSecondary:{saturation:68,value:64},
  };

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function normHue(v){ v=Number(v)||0; return ((v%360)+360)%360; }

  function hsvToRgb(h,s,v){
    h=normHue(h); s=clamp(Number(s)||0,0,100)/100; v=clamp(Number(v)||0,0,100)/100;
    const c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c;
    let r=0,g=0,b=0;
    if(h<60){r=c;g=x;} else if(h<120){r=x;g=c;} else if(h<180){g=c;b=x;}
    else if(h<240){g=x;b=c;} else if(h<300){r=x;b=c;} else {r=c;b=x;}
    return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
  }

  function hsvToHsl(spec){
    const h=normHue(spec?.hue); const s=clamp(Number(spec?.saturation)||0,0,100)/100; const v=clamp(Number(spec?.value)||0,0,100)/100;
    const l=v*(1-s/2);
    const hslS=(l<=0 || l>=1) ? 0 : (v-l)/Math.min(l,1-l);
    return {hue:h,saturation:clamp(hslS,0,1),lightness:clamp(l,0,1)};
  }

  function rgbToHsl(r,g,b){
    r/=255;g/=255;b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
    if(max===min) return [0,0,l];
    const d=max-min, s=l>.5?d/(2-max-min):d/(max+min); let h;
    if(max===r) h=(g-b)/d+(g<b?6:0); else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4;
    return [h*60,s,l];
  }

  function hslToRgb(h,s,l){
    h=normHue(h)/360;
    if(!s){ const n=Math.round(l*255); return [n,n,n]; }
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
    const f=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)];
  }

  function sourceId(source){
    if(source?.src) return source.src;
    if(source && !sourceIds.has(source)) sourceIds.set(source,nextSourceId++);
    return source ? `canvas-${sourceIds.get(source)}` : 'none';
  }
  function sourceReady(source){ return !!source && ((source.complete&&source.naturalWidth&&source.naturalHeight)||(source.width&&source.height)); }
  function size(source){ return {w:source?.naturalWidth||source?.width||0,h:source?.naturalHeight||source?.height||0}; }

  function injectStyles(){
    if(document.getElementById('precise-colour-picker-style')) return;
    const style=document.createElement('style'); style.id='precise-colour-picker-style';
    style.textContent=`
      .precise-colour-picker{display:grid;gap:5px;margin:2px 0 8px;min-width:0}
      .precise-colour-picker>label{font-weight:normal!important;font-size:.85em!important;margin:0}
      .precise-hue{width:100%;height:18px;accent-color:transparent;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);border-radius:9px}
      .precise-sv{position:relative;width:100%;height:72px;border:1px solid #666;border-radius:4px;touch-action:none;cursor:crosshair;box-sizing:border-box;overflow:hidden}
      .precise-sv-dot{position:absolute;width:12px;height:12px;border:2px solid #fff;border-radius:50%;box-sizing:border-box;box-shadow:0 0 0 1px #000,0 1px 3px #000;transform:translate(-50%,-50%);pointer-events:none}
      .precise-colour-meta{display:grid;grid-template-columns:30px 1fr 30px 1fr 30px 1fr 24px;gap:3px;align-items:center;font-size:.72em;color:#bbb}
      .precise-colour-meta input{min-width:0;width:100%;box-sizing:border-box;padding:2px 3px;background:#222;color:#eee;border:1px solid #555;border-radius:3px}
      .precise-colour-swatch{width:22px;height:22px;border-radius:3px;border:1px solid #777;box-sizing:border-box}
      .precise-inventory-picker{margin:6px 0 10px}
    `;
    document.head.appendChild(style);
  }

  function initialSpec(key,hue,saturation,value){
    const d=DEFAULTS[key]||{saturation:70,value:65};
    return {hue:normHue(hue),saturation:clamp(Number.isFinite(Number(saturation))?Number(saturation):d.saturation,0,100),value:clamp(Number.isFinite(Number(value))?Number(value):d.value,0,100)};
  }

  function buildPicker({key,label,hue=0,saturation,value,onChange,existingHueInput=null,compact=false}={}){
    injectStyles();
    const state=initialSpec(key,hue,saturation,value);
    const root=document.createElement('div'); root.className=`precise-colour-picker${compact?' precise-inventory-picker':''}`; root.dataset.precisePickerKey=key||'';
    let labelEl;
    if(existingHueInput){
      labelEl=document.querySelector(`label[for="${existingHueInput.id}"]`);
      if(labelEl) root.appendChild(labelEl);
    }
    if(!labelEl){ labelEl=document.createElement('label'); labelEl.textContent=label||'Colour'; root.appendChild(labelEl); }

    const hueInput=existingHueInput||document.createElement('input');
    hueInput.type='range'; hueInput.min='0'; hueInput.max='359'; hueInput.step='1'; hueInput.value=String(Math.round(state.hue)); hueInput.classList.add('precise-hue');
    root.appendChild(hueInput);

    const plane=document.createElement('div'); plane.className='precise-sv';
    const dot=document.createElement('div'); dot.className='precise-sv-dot'; plane.appendChild(dot); root.appendChild(plane);

    const meta=document.createElement('div'); meta.className='precise-colour-meta';
    const hNum=document.createElement('input'), sNum=document.createElement('input'), vNum=document.createElement('input');
    for(const n of [hNum,sNum,vNum]){n.type='number';n.step='1';}
    hNum.min='0';hNum.max='359';sNum.min='0';sNum.max='100';vNum.min='0';vNum.max='100';
    const swatch=document.createElement('span'); swatch.className='precise-colour-swatch';
    meta.append('H',hNum,'S',sNum,'V',vNum,swatch); root.appendChild(meta);

    function snapshot(){ return {hue:Math.round(state.hue),saturation:Math.round(state.saturation),value:Math.round(state.value)}; }
    function refreshVisuals(){
      state.hue=normHue(state.hue); state.saturation=clamp(state.saturation,0,100); state.value=clamp(state.value,0,100);
      hueInput.value=String(Math.round(state.hue)); hNum.value=String(Math.round(state.hue)); sNum.value=String(Math.round(state.saturation)); vNum.value=String(Math.round(state.value));
      plane.style.background=`linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,rgba(255,255,255,0)),hsl(${state.hue} 100% 50%)`;
      dot.style.left=`${state.saturation}%`; dot.style.top=`${100-state.value}%`;
      const [r,g,b]=hsvToRgb(state.hue,state.saturation,state.value); swatch.style.backgroundColor=`rgb(${r},${g},${b})`;
      root.__preciseSpec=snapshot();
    }
    function notify({dispatchHue=true}={}){
      refreshVisuals();
      if(typeof onChange==='function') onChange(snapshot());
      if(existingHueInput && dispatchHue){
        existingHueInput.dispatchEvent(new Event('input',{bubbles:true}));
        existingHueInput.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    function setFromPlane(ev){
      const rect=plane.getBoundingClientRect(); if(!rect.width||!rect.height) return;
      state.saturation=clamp((ev.clientX-rect.left)/rect.width*100,0,100);
      state.value=clamp(100-(ev.clientY-rect.top)/rect.height*100,0,100); notify();
    }
    plane.addEventListener('pointerdown',ev=>{plane.setPointerCapture?.(ev.pointerId);setFromPlane(ev);});
    plane.addEventListener('pointermove',ev=>{if(ev.buttons||ev.pressure>0)setFromPlane(ev);});
    hueInput.addEventListener('input',()=>{state.hue=Number(hueInput.value);notify({dispatchHue:false});});
    hNum.addEventListener('input',()=>{state.hue=Number(hNum.value);notify();});
    sNum.addEventListener('input',()=>{state.saturation=Number(sNum.value);notify();});
    vNum.addEventListener('input',()=>{state.value=Number(vNum.value);notify();});
    root.__setPreciseSpec=spec=>{state.hue=spec.hue;state.saturation=spec.saturation;state.value=spec.value;notify();};
    refreshVisuals();
    return root;
  }

  function enhanceCreatorPicker(id,key){
    const hue=document.getElementById(id); if(!hue||hue.dataset.preciseColour==='true') return false;
    const label=document.querySelector(`label[for="${id}"]`); const parent=hue.parentNode; if(!parent) return false;
    const marker=document.createComment(`precise-${key}-picker`);
    parent.insertBefore(marker,label||hue);
    const spec=initialSpec(key,Number(hue.value));
    const root=buildPicker({key,label:label?.textContent||key,hue:spec.hue,saturation:spec.saturation,value:spec.value,existingHueInput:hue,onChange:()=>syncCreatorAppearanceToPlayer()});
    hue.dataset.preciseColour='true';
    marker.replaceWith(root);
    return true;
  }

  function pickerRoot(key){ return document.querySelector(`[data-precise-picker-key="${key}"]`); }
  function getAppearanceColorSpec(key){
    const root=pickerRoot(key); if(root?.__preciseSpec) return {...root.__preciseSpec};
    const id={shirt:'shirt-hue-slider',pants:'pants-hue-slider',hair:'hair-hue-slider'}[key];
    const hue=id?document.getElementById(id):null; return initialSpec(key,Number(hue?.value||0));
  }
  function setAppearanceColorSpec(key,spec){ pickerRoot(key)?.__setPreciseSpec?.(initialSpec(key,spec?.hue,spec?.saturation,spec?.value)); }
  function copyAppearanceColorSpec(from,to){ setAppearanceColorSpec(to,getAppearanceColorSpec(from)); }

  function applyCreatorAppearanceToEntity(entity){
    if(!entity) return;
    const shirt=getAppearanceColorSpec('shirt'), pants=getAppearanceColorSpec('pants'), hair=getAppearanceColorSpec('hair');
    entity.shirtHue=shirt.hue; entity.shirtSaturation=shirt.saturation; entity.shirtValue=shirt.value;
    entity.pantsHue=pants.hue; entity.pantsSaturation=pants.saturation; entity.pantsValue=pants.value;
    entity.hairHue=hair.hue; entity.hairSaturation=hair.saturation; entity.hairValue=hair.value;
  }
  function syncCreatorAppearanceToPlayer(){
    const creator=document.getElementById('characterCreator');
    if(window.player && (!creator || creator.style.display==='none')) applyCreatorAppearanceToEntity(window.player);
  }

  function updateGenderMode(){
    const male=document.getElementById('gender-select')?.value==='male';
    const pants=pickerRoot('pants'); if(pants) pants.hidden=male;
    if(male) copyAppearanceColorSpec('shirt','pants');
  }
  function installCreator(){
    const ok1=enhanceCreatorPicker('shirt-hue-slider','shirt');
    const ok2=enhanceCreatorPicker('pants-hue-slider','pants');
    const ok3=enhanceCreatorPicker('hair-hue-slider','hair');
    const gender=document.getElementById('gender-select');
    if(gender&&!gender.dataset.preciseColourGender){gender.dataset.preciseColourGender='true';gender.addEventListener('change',updateGenderMode);}
    updateGenderMode(); return ok1||ok2||ok3;
  }

  function appearanceFromContext(kind,hues){
    const active=window.__preciseAppearanceContext;
    if(active) return active;
    const creator=document.getElementById('characterCreator');
    if(creator && creator.style.display!=='none'){
      const shirt=getAppearanceColorSpec('shirt'),pants=getAppearanceColorSpec('pants'),hair=getAppearanceColorSpec('hair');
      return {shirtHue:shirt.hue,shirtSaturation:shirt.saturation,shirtValue:shirt.value,pantsHue:pants.hue,pantsSaturation:pants.saturation,pantsValue:pants.value,hairHue:hair.hue,hairSaturation:hair.saturation,hairValue:hair.value};
    }
    const p=window.player;
    if(!p) return null;
    if(kind==='hair' && hues?.hairHue!==undefined && p.hairHue!==hues.hairHue) return null;
    return p;
  }

  function preciseSpec(entity,prefix,fallbackHue){
    if(!entity) return null;
    const sat=entity[`${prefix}Saturation`], val=entity[`${prefix}Value`];
    if(!Number.isFinite(Number(sat))||!Number.isFinite(Number(val))) return null;
    return {hue:Number(entity[`${prefix}Hue`]??fallbackHue??0),saturation:Number(sat),value:Number(val)};
  }

  function enhanceBodyOutput(base,hues){
    if(!sourceReady(base)) return base;
    const entity=appearanceFromContext('body',hues);
    const shirt=preciseSpec(entity,'shirt',hues?.shirtHue), pants=preciseSpec(entity,'pants',hues?.pantsHue);
    if(!shirt&&!pants) return base;
    const {w,h}=size(base); const key=`${sourceId(base)}|shirt:${shirt?`${shirt.hue},${shirt.saturation},${shirt.value}`:'x'}|pants:${pants?`${pants.hue},${pants.saturation},${pants.value}`:'x'}`;
    if(bodyCache.has(key)) return bodyCache.get(key);
    const c=document.createElement('canvas'); c.width=w;c.height=h; const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(base,0,0);
    const data=ctx.getImageData(0,0,w,h), p=data.data, shirtH=shirt&&hsvToHsl(shirt), pantsH=pants&&hsvToHsl(pants), head=Math.floor(h*.32);
    for(let i=0;i<p.length;i+=4){ if(p[i+3]<50)continue; const y=Math.floor((i/4)/w); if(y<head)continue; const [,,l]=rgbToHsl(p[i],p[i+1],p[i+2]); let target=null,center=0;
      if(shirtH&&l>=.36&&l<=.50){target=shirtH;center=.43;} else if(pantsH&&l>=.12&&l<.36){target=pantsH;center=.24;} else continue;
      const l2=clamp(target.lightness+(l-center)*.82,.015,.985), [r,g,b]=hslToRgb(target.hue,target.saturation,l2); p[i]=r;p[i+1]=g;p[i+2]=b;
    }
    ctx.putImageData(data,0,0); bodyCache.set(key,c); return c;
  }

  function enhanceHairOutput(base,targetHue){
    if(!sourceReady(base)) return base;
    const entity=appearanceFromContext('hair',{hairHue:targetHue}); const spec=preciseSpec(entity,'hair',targetHue); if(!spec)return base;
    const {w,h}=size(base); const key=`${sourceId(base)}|hair:${spec.hue},${spec.saturation},${spec.value}`; if(hairCache.has(key))return hairCache.get(key);
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(base,0,0);
    const data=ctx.getImageData(0,0,w,h),p=data.data;let total=0,count=0;
    for(let i=0;i<p.length;i+=4){if(p[i+3]<50)continue;total+=rgbToHsl(p[i],p[i+1],p[i+2])[2];count++;}
    const avg=count?total/count:.35,target=hsvToHsl(spec);
    for(let i=0;i<p.length;i+=4){if(p[i+3]<50)continue;const [,,l]=rgbToHsl(p[i],p[i+1],p[i+2]);const l2=clamp(target.lightness+(l-avg)*.82,.01,.99),[r,g,b]=hslToRgb(target.hue,target.saturation,l2);p[i]=r;p[i+1]=g;p[i+2]=b;}
    ctx.putImageData(data,0,0);hairCache.set(key,c);return c;
  }

  function installRecolorWrappers(){
    const body=window.getRecoloredSprite;
    if(typeof body==='function'&&!body.__preciseColourWrapper){
      const base=body; const wrapped=function(img,hues){return enhanceBodyOutput(base.apply(this,arguments),hues||{});}; wrapped.__preciseColourWrapper=true; wrapped.__preciseBase=base; window.getRecoloredSprite=wrapped;
    }
    const hair=window.getRecoloredCharacterHairSprite;
    if(typeof hair==='function'&&!hair.__preciseColourWrapper){
      const base=hair; const wrapped=function(img,targetHue){return enhanceHairOutput(base.apply(this,arguments),targetHue);}; wrapped.__preciseColourWrapper=true; wrapped.__preciseBase=base; window.getRecoloredCharacterHairSprite=wrapped;
    }
  }

  function installDrawContext(){
    const current=window.drawPlayerCharacter;
    if(typeof current!=='function'||current.__preciseColourContext) return;
    const base=current;
    const wrapped=function(ctx,entity){const prev=window.__preciseAppearanceContext;window.__preciseAppearanceContext=entity;try{return base.apply(this,arguments);}finally{window.__preciseAppearanceContext=prev;}};
    wrapped.__preciseColourContext=true; wrapped.__preciseBase=base;
    if(base.__directHumanoidCompositor) wrapped.__directHumanoidCompositor=true;
    window.drawPlayerCharacter=wrapped;
  }

  function installStartSync(){
    const btn=document.getElementById('createCharacterButton'); if(!btn||btn.dataset.preciseColourSync)return;
    btn.dataset.preciseColourSync='true';
    const sync=()=>{for(const delay of [0,25,100,300])setTimeout(()=>{if(window.party?.[0])applyCreatorAppearanceToEntity(window.party[0]);if(window.player)applyCreatorAppearanceToEntity(window.player);},delay);};
    btn.addEventListener('click',sync); btn.addEventListener('touchend',sync,{passive:true});
  }

  function install(){injectStyles();installCreator();installRecolorWrappers();installDrawContext();installStartSync();}

  window.getAppearanceColorSpec=getAppearanceColorSpec;
  window.setAppearanceColorSpec=setAppearanceColorSpec;
  window.copyAppearanceColorSpec=copyAppearanceColorSpec;
  window.applyPreciseAppearanceToEntity=applyCreatorAppearanceToEntity;
  window.buildPreciseColorPicker=buildPicker;
  window.preciseHSVToHSL=hsvToHsl;
  window.preciseHSVToRGB=hsvToRgb;
  window.__preciseAppearanceColourBuild=BUILD;

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  const timer=setInterval(install,100); setTimeout(()=>clearInterval(timer),15000);
})();
