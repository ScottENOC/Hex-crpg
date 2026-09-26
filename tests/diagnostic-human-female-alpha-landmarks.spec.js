import { test } from '@playwright/test';

test('dump human female front silhouette spans at landmark rows', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const img = new Image();
    img.src = 'images/characters/human_female/body_front.png';
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently:true }); ctx.drawImage(img,0,0);
    const data = ctx.getImageData(0,0,c.width,c.height).data;
    const crop = { x:0.350, y:0.088, w:0.297, h:0.823 };
    const samples = [0.20,0.225,0.25,0.30,0.405,0.45,0.53,0.545,0.60,0.90,0.94,0.965,0.995];
    function runsForDestY(destY) {
      const sy = Math.max(0, Math.min(c.height-1, Math.round((crop.y + destY*crop.h)*c.height)));
      const x0 = Math.round(crop.x*c.width), x1 = Math.round((crop.x+crop.w)*c.width)-1;
      const runs=[]; let start=null;
      for(let x=x0;x<=x1;x++){
        const a=data[(sy*c.width+x)*4+3]; const on=a>=24;
        if(on && start===null) start=x;
        if((!on || x===x1) && start!==null){ const end=(on&&x===x1)?x:x-1; if(end-start+1>=3) runs.push([start,end]); start=null; }
      }
      return { sy, runs:runs.map(([a,b])=>({source:[a,b], dest:[(a/c.width-crop.x)/crop.w,(b/c.width-crop.x)/crop.w], centre:(((a+b)/2/c.width)-crop.x)/crop.w, width:(b-a+1)/c.width/crop.w})) };
    }
    return Object.fromEntries(samples.map(y=>[String(y),runsForDestY(y)]));
  });
  console.log('FEMALE_FRONT_ALPHA_LANDMARKS '+JSON.stringify(result));
});
