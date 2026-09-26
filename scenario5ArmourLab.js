// scenario5ArmourLab.js
// Campaign 5: isolated armour-anchor laboratory.
// Deliberately does not start the normal game or wrap the live map renderer.
(() => {
  'use strict';

  const ARMOURS = {
    light:  { label:'Light armour',  src:'images/humanlightarmour.png' },
    medium: { label:'Medium armour', src:'images/humanmediumarmour.png' },
    heavy:  { label:'Heavy armour',  src:'images/humanheavyarmour.png' },
  };
  const FACINGS = {
    front:{label:'Front',src:'images/characters/human_female/body_front.png'},
    side:{label:'Side',src:'images/characters/human_female/body_side.png'},
    back:{label:'Back',src:'images/characters/human_female/body_back.png'},
  };
  const ALPHA_THRESHOLD=24, OCCUPANCY_FRAC=0.005;
  const imageCache=new Map();
  let renderGeneration=0;

  function loadImage(src){
    if(imageCache.has(src))return imageCache.get(src);
    const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Failed to load ${src}`));img.src=src;});
    imageCache.set(src,promise);return promise;
  }

  function robustBounds(img){
    const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,w,h).data,row=new Uint32Array(h),col=new Uint32Array(w);
    for(let y=0;y<h;y++){const off=y*w*4;for(let x=0;x<w;x++){if(data[off+x*4+3]>=ALPHA_THRESHOLD){row[y]++;col[x]++;}}}
    const minRow=Math.max(3,Math.ceil(w*OCCUPANCY_FRAC)),minCol=Math.max(3,Math.ceil(h*OCCUPANCY_FRAC));
    let top=0,bottom=h-1,left=0,right=w-1;
    while(top<h&&row[top]<minRow)top++;while(bottom>=top&&row[bottom]<minRow)bottom--;
    while(left<w&&col[left]<minCol)left++;while(right>=left&&col[right]<minCol)right--;
    if(right<left||bottom<top)throw new Error('No robust opaque bounds found');
    return {left,top,right,bottom,width:right-left+1,height:bottom-top+1,sourceWidth:w,sourceHeight:h};
  }

  function sourceAnchors(bounds){
    const cx=(bounds.left+bounds.right)/2,cy=(bounds.top+bounds.bottom)/2,w=bounds.sourceWidth,h=bounds.sourceHeight;
    return {
      topExtent:{x:cx/w,y:bounds.top/h},
      bottomExtent:{x:cx/w,y:bounds.bottom/h},
      leftExtent:{x:bounds.left/w,y:cy/h},
      rightExtent:{x:bounds.right/w,y:cy/h},
    };
  }

  function fitRect(img,canvas,pad=34){
    const maxW=canvas.width-pad*2,maxH=canvas.height-pad*2,scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight);
    const width=img.naturalWidth*scale,height=img.naturalHeight*scale;
    return {x:(canvas.width-width)/2,y:(canvas.height-height)/2,width,height};
  }
  function pointInRect(p,r){return{x:r.x+p.x*r.width,y:r.y+p.y*r.height};}
  function dot(ctx,p,colour,label,side=1){
    ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle=colour;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#050505';ctx.stroke();
    ctx.font='bold 13px monospace';ctx.textBaseline='middle';ctx.textAlign=side<0?'right':'left';
    const x=p.x+side*11,y=p.y-10;ctx.lineWidth=4;ctx.strokeStyle='#000';ctx.strokeText(label,x,y);ctx.fillStyle='#fff';ctx.fillText(label,x,y);
  }
  function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}

  function drawArmour(canvas,img,anchors,bounds){
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#181818';ctx.fillRect(0,0,canvas.width,canvas.height);
    const r=fitRect(img,canvas);ctx.drawImage(img,r.x,r.y,r.width,r.height);
    ctx.strokeStyle='rgba(255,255,255,.25)';ctx.setLineDash([5,4]);ctx.strokeRect(r.x+bounds.left/img.naturalWidth*r.width,r.y+bounds.top/img.naturalHeight*r.height,bounds.width/img.naturalWidth*r.width,bounds.height/img.naturalHeight*r.height);ctx.setLineDash([]);
    for(const [name,a] of Object.entries(anchors))dot(ctx,pointInRect(a,r),'#ff4fa3',name,name.includes('right')?-1:1);
    return r;
  }

  function drawBody(canvas,img,view){
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#181818';ctx.fillRect(0,0,canvas.width,canvas.height);
    const r=fitRect(img,canvas);ctx.drawImage(img,r.x,r.y,r.width,r.height);
    const a=window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors||{};
    const points={};
    for(const name of ['armourShoulderTopLeft','armourShoulderTopRight','leftFootSole','rightFootSole']){
      if(a[name]){points[name]=pointInRect(a[name],r);dot(ctx,points[name],'#40c4ff',name,name.includes('Right')?-1:1);}
    }
    if(points.armourShoulderTopLeft&&points.armourShoulderTopRight){points.armourTopTarget=midpoint(points.armourShoulderTopLeft,points.armourShoulderTopRight);dot(ctx,points.armourTopTarget,'#00e5ff','top target',1);}
    if(points.leftFootSole&&points.rightFootSole){points.armourBottomTarget=midpoint(points.leftFootSole,points.rightFootSole);dot(ctx,points.armourBottomTarget,'#00e5ff','bottom target',1);}
    return {rect:r,points,anchors:a};
  }

  function setStatus(text,isError=false){const el=document.getElementById('scenario5-status');if(el){el.textContent=text;el.style.color=isError?'#ff8a80':'#b0bec5';}}
  function mappingText(armourKey,view,bounds,source,body){
    const fmt=p=>p?`(${p.x.toFixed(4)}, ${p.y.toFixed(4)})`:'missing';
    return [
      `Armour: ${ARMOURS[armourKey].label}`,
      `Facing reference: ${FACINGS[view].label}`,
      `Robust alpha bounds: x ${bounds.left}-${bounds.right}, y ${bounds.top}-${bounds.bottom}`,
      `Visible size: ${bounds.width} × ${bounds.height}px of ${bounds.sourceWidth} × ${bounds.sourceHeight}px`,
      '',
      'ARMOUR SOURCE ANCHORS (pink)',
      `topExtent     ${fmt(source.topExtent)}`,
      `bottomExtent  ${fmt(source.bottomExtent)}`,
      `leftExtent    ${fmt(source.leftExtent)}`,
      `rightExtent   ${fmt(source.rightExtent)}`,
      '',
      'BODY TARGET ANCHORS (blue)',
      `armourShoulderTopLeft   ${fmt(body.armourShoulderTopLeft)}`,
      `armourShoulderTopRight  ${fmt(body.armourShoulderTopRight)}`,
      `leftFootSole            ${fmt(body.leftFootSole)}`,
      `rightFootSole           ${fmt(body.rightFootSole)}`,
      '',
      'EXPLICIT MAP',
      'armour.topExtent    → midpoint(body.armourShoulderTopLeft, body.armourShoulderTopRight)',
      'armour.bottomExtent → midpoint(body.leftFootSole, body.rightFootSole)',
      'armour.leftExtent   → diagnostic only',
      'armour.rightExtent  → diagnostic only',
      '',
      'This scenario does not use the live equipment renderer.',
    ].join('\n');
  }

  async function renderLab(){
    const generation=++renderGeneration;
    const armourKey=document.getElementById('scenario5-armour-select')?.value||'heavy';
    const view=document.getElementById('scenario5-facing-select')?.value||'front';
    setStatus('Loading raw sprites…');
    try{
      const [armourImg,bodyImg]=await Promise.all([loadImage(ARMOURS[armourKey].src),loadImage(FACINGS[view].src)]);
      if(generation!==renderGeneration)return;
      const bounds=robustBounds(armourImg),source=sourceAnchors(bounds);
      const armourCanvas=document.getElementById('scenario5-armour-canvas'),bodyCanvas=document.getElementById('scenario5-body-canvas');
      drawArmour(armourCanvas,armourImg,source,bounds);
      const bodyDraw=drawBody(bodyCanvas,bodyImg,view);
      const text=mappingText(armourKey,view,bounds,source,bodyDraw.anchors);
      document.getElementById('scenario5-mapping').textContent=text;
      window.SCENARIO5_ARMOUR_DEBUG_STATE={armour:armourKey,view,bounds,sourceAnchors:source,bodyAnchors:bodyDraw.anchors,mapping:{topExtent:['armourShoulderTopLeft','armourShoulderTopRight'],bottomExtent:['leftFootSole','rightFootSole'],leftExtent:[],rightExtent:[]},rendered:true,timestamp:Date.now()};
      setStatus('Standalone raw-sprite render complete. Pink dots are armour anchors; blue dots are body targets.');
    }catch(err){console.error('Scenario 5 armour lab failed',err);setStatus(`Failed: ${err.message}`,true);window.SCENARIO5_ARMOUR_DEBUG_STATE={rendered:false,error:String(err)};}
  }

  function labMarkup(){return `
    <div id="scenario5-armour-lab" style="position:fixed;inset:0;z-index:200000;background:#101216;color:#eee;overflow:auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 12px calc(env(safe-area-inset-bottom,0px) + 20px);box-sizing:border-box;font-family:system-ui,sans-serif;">
      <div style="max-width:1180px;margin:0 auto;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
          <h2 style="margin:0 auto 0 0;">Scenario 5 — Armour Anchor Lab</h2>
          <button id="scenario5-close" type="button">Back to character creator</button>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#20242a;padding:10px;border-radius:8px;margin-bottom:12px;">
          <label>Armour <select id="scenario5-armour-select"><option value="light">Light</option><option value="medium">Medium</option><option value="heavy" selected>Heavy</option></select></label>
          <label>Body reference <select id="scenario5-facing-select"><option value="front" selected>Front</option><option value="side">Side</option><option value="back">Back</option></select></label>
          <span id="scenario5-status" style="font-size:.85em;color:#b0bec5;"></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:12px;align-items:start;">
          <section style="background:#20242a;padding:10px;border-radius:8px;"><h3 style="margin:0 0 8px;">Raw armour + source anchors</h3><canvas id="scenario5-armour-canvas" width="460" height="560" style="width:100%;height:auto;max-height:68vh;background:#181818;border:1px solid #555;"></canvas></section>
          <section style="background:#20242a;padding:10px;border-radius:8px;"><h3 style="margin:0 0 8px;">Human female body targets</h3><canvas id="scenario5-body-canvas" width="460" height="560" style="width:100%;height:auto;max-height:68vh;background:#181818;border:1px solid #555;"></canvas></section>
          <section style="background:#20242a;padding:10px;border-radius:8px;"><h3 style="margin:0 0 8px;">Anchor map</h3><pre id="scenario5-mapping" style="white-space:pre-wrap;word-break:break-word;font:12px/1.45 monospace;margin:0;color:#e0e0e0;"></pre></section>
        </div>
      </div>
    </div>`;}

  function openLab(){
    if(document.getElementById('scenario5-armour-lab'))return;
    window.__scenario5ArmourLabActive=true;
    window.currentCampaign='5';
    const creator=document.getElementById('characterCreator');if(creator)creator.style.display='none';
    const game=document.getElementById('gameContainer');if(game)game.style.display='none';
    document.body.insertAdjacentHTML('beforeend',labMarkup());
    document.getElementById('scenario5-close').addEventListener('click',closeLab);
    document.getElementById('scenario5-armour-select').addEventListener('change',renderLab);
    document.getElementById('scenario5-facing-select').addEventListener('change',renderLab);
    renderLab();
  }
  function closeLab(){
    document.getElementById('scenario5-armour-lab')?.remove();
    window.__scenario5ArmourLabActive=false;
    const creator=document.getElementById('characterCreator');if(creator)creator.style.display='block';
  }

  function installCampaignOption(){
    const select=document.getElementById('campaign-select');if(!select)return false;
    if(!select.querySelector('option[value="5"]')){const option=document.createElement('option');option.value='5';option.textContent='Campaign 5 (Armour Anchor Lab)';select.appendChild(option);}
    return true;
  }
  function interceptScenario5(event){
    const button=event.target?.closest?.('#createCharacterButton');if(!button)return;
    if(document.getElementById('campaign-select')?.value!=='5')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openLab();
  }

  document.addEventListener('click',interceptScenario5,true);
  document.addEventListener('touchend',interceptScenario5,{capture:true,passive:false});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCampaignOption,{once:true});else installCampaignOption();
  let attempts=0;const timer=setInterval(()=>{if(installCampaignOption()||++attempts>80)clearInterval(timer);},50);

  window.openScenario5ArmourLab=openLab;
  window.closeScenario5ArmourLab=closeLab;
  window.renderScenario5ArmourLab=renderLab;
  window.__scenario5ArmourLabLoaded=true;
})();
