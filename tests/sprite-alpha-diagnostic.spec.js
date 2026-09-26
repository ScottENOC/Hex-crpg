const { test } = require('@playwright/test');

test('measure armour and average human female alpha bounds', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const assets = {
      light:'images/humanlightarmour.png',
      medium:'images/humanmediumarmour.png',
      heavy:'images/humanheavyarmour.png',
      bodyFront:'images/characters/human_female/body_front.png',
      bodySide:'images/characters/human_female/body_side.png',
      bodyBack:'images/characters/human_female/body_back.png',
    };

    function load(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src + '?diag=' + Date.now();
      });
    }

    function bounds(img, alphaThreshold, robust) {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently:true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const rows = new Uint32Array(h), cols = new Uint32Array(w);
      for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
        if (data[(y*w+x)*4+3] >= alphaThreshold) { rows[y]++; cols[x]++; }
      }
      const minRowPixels = robust ? Math.max(3, Math.ceil(w * 0.005)) : 1;
      const minColPixels = robust ? Math.max(3, Math.ceil(h * 0.005)) : 1;
      let minY=0,maxY=h-1,minX=0,maxX=w-1;
      while (minY<h && rows[minY]<minRowPixels) minY++;
      while (maxY>=minY && rows[maxY]<minRowPixels) maxY--;
      while (minX<w && cols[minX]<minColPixels) minX++;
      while (maxX>=minX && cols[maxX]<minColPixels) maxX--;
      return {
        canvas:[w,h],
        left:minX, right:maxX, top:minY, bottom:maxY,
        width:maxX-minX+1, height:maxY-minY+1,
        threshold:alphaThreshold,
        minRowPixels,minColPixels,
      };
    }

    const out = {};
    for (const [name, src] of Object.entries(assets)) {
      const img = await load(src);
      out[name] = {
        anyAlpha: bounds(img, 1, false),
        alpha24: bounds(img, 24, false),
        robust24: bounds(img, 24, true),
      };
    }
    return out;
  });
  console.log('SPRITE_ALPHA_MEASURE=' + JSON.stringify(result));
});
