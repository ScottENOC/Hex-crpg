// armourRenderProbe.js
// Observe the actual 9-argument strip draws emitted by characterRig for human-female armour.
// Loaded before characterRig so characterRig's native drawImage binding passes through here.
(() => {
  'use strict';

  const EXPECTED_SLICES = 12;
  let current = null;

  function imageSize(img){
    return {w:Number(img?.naturalWidth||img?.width||0),h:Number(img?.naturalHeight||img?.height||0)};
  }
  function freshHumanFemaleBody(){
    const body=window.__humanFemaleLastBodyDraw;
    if(!body)return null;
    const age=performance.now()-Number(body.timestamp||0);
    return age>=0&&age<150?body:null;
  }
  function isFullWidthSlice(img,args){
    if(args.length!==8)return false;
    const {w,h}=imageSize(img); if(!(w>0&&h>0))return false;
    const [sx,sy,sw,sh,dx,dy,dw,dh]=args.map(Number);
    if(![sx,sy,sw,sh,dx,dy,dw,dh].every(Number.isFinite))return false;
    if(Math.abs(sx)>0.5||Math.abs(sw-w)>1.5||!(sh>0&&dw>0&&dh>0))return false;
    if(sy<-0.5||sy+sh>h+1.5)return false;
    return true;
  }
  function sameImage(a,b){return a===b;}
  function begin(img,body,args){
    current={img,body:{...body},view:body.view,strips:[],started:performance.now()};
    add(args);
  }
  function add(args){
    const [sx,sy,sw,sh,dx,dy,dw,dh]=args.map(Number);
    current.strips.push({sx,sy,sw,sh,dx,dy,dw,dh});
  }
  function completeIfReady(img){
    if(!current)return;
    const {h}=imageSize(img);
    const strips=current.strips;
    const last=strips[strips.length-1];
    const complete=strips.length>=EXPECTED_SLICES || (last&&last.sy+last.sh>=h-1);
    if(!complete)return;
    if(strips.length>=EXPECTED_SLICES-1){
      window.__lastHumanFemaleArmourStripProbe={
        image:current.img,
        body:current.body,
        view:current.view,
        strips:strips.slice(),
        sourceWidth:imageSize(current.img).w,
        sourceHeight:imageSize(current.img).h,
        timestamp:performance.now(),
        source:'actual-characterRig-strip-draws'
      };
    }
    current=null;
  }

  function install(){
    const ctx=window.mapCtx;
    if(!ctx||typeof ctx.drawImage!=='function')return false;
    if(ctx.drawImage.__armourStripProbe)return true;
    const previous=ctx.drawImage.bind(ctx);
    const wrapped=function(img,...args){
      const body=freshHumanFemaleBody();
      if(body&&isFullWidthSlice(img,args)){
        const sy=Number(args[1]);
        if(!current||!sameImage(current.img,img)||sy<=0.5||current.view!==body.view){
          begin(img,body,args);
        }else{
          add(args);
        }
        completeIfReady(img);
      }
      return previous(img,...args);
    };
    wrapped.__armourStripProbe=true;
    wrapped.__armourStripProbePrevious=previous;
    ctx.drawImage=wrapped;
    window.__armourStripProbeInstalled=true;
    return true;
  }

  if(!install()){
    let attempts=0;
    const timer=setInterval(()=>{if(install()||++attempts>200)clearInterval(timer);},25);
  }
})();
