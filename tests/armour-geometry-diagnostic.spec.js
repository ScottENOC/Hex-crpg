const { test } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('report human female body and armour geometry', async ({ page }) => {
  await createCharacter(page, { race:'human', gender:'female' });
  await page.waitForFunction(() =>
    window.__directionalEquipmentFitTuningApplied === true &&
    !!window.gameVisuals?.humanLight?.complete &&
    !!window.HUMAN_FEMALE_DIRECTIONAL_ASSETS?.body?.front?.complete
  );

  const result = await page.evaluate(() => {
    function alphaBounds(img, crop = null) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const sx = crop ? Math.round(crop.x * iw) : 0;
      const sy = crop ? Math.round(crop.y * ih) : 0;
      const sw = crop ? Math.round(crop.w * iw) : iw;
      const sh = crop ? Math.round(crop.h * ih) : ih;
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      const ctx = c.getContext('2d', { willReadFrequently:true });
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const data = ctx.getImageData(0,0,sw,sh).data;
      let left=sw, top=sh, right=-1, bottom=-1;
      for (let y=0;y<sh;y++) for (let x=0;x<sw;x++) {
        if (data[(y*sw+x)*4+3] > 8) {
          if (x<left) left=x; if (x>right) right=x;
          if (y<top) top=y; if (y>bottom) bottom=y;
        }
      }
      return right < left ? null : { left, top, right, bottom, width:right-left+1, height:bottom-top+1, sourceWidth:sw, sourceHeight:sh };
    }

    const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT.front;
    const body = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS.body.front;
    const armour = {};
    for (const [key,img] of Object.entries({light:window.gameVisuals.humanLight, medium:window.gameVisuals.humanMedium, heavy:window.gameVisuals.humanHeavy})) {
      armour[key] = {
        raw:alphaBounds(img),
        robust:window.measureHumanFemaleArmourAlphaBounds(img),
        fit:window.computeHumanFemaleRigidArmourPlacement(img, 'front', {left:0,top:0,width:480,height:1000}),
      };
    }
    return {
      bodyRaw:alphaBounds(body),
      bodyCropped:alphaBounds(body, layout.bodyCrop),
      bodyCrop:layout.bodyCrop,
      bodyDest:layout.bodyDest,
      armour,
      rig:window.deriveHumanFemaleArmourRig('front'),
      vertical:window.HUMAN_FEMALE_EQUIPMENT_FIT.targetVerticalByView.front,
    };
  });
  console.log('ARMOUR_GEOMETRY ' + JSON.stringify(result));
});
