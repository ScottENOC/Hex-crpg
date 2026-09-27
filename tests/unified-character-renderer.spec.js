const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const retired = [
  'characterRig.js','facingSystem.js','directionalHairTuning.js','directionalWeaponTuning.js',
  'directionalEquipmentTuning.js','directionalRigHandoff.js','directionalCharacterUI.js',
  'armourAnchorDebug.js','armourAnchorOverlay.js','armourFreezeDiagnostic.js','armourRenderProbe.js',
  'rigCalibration.js','rigDebug.js','spriteRigging.js','scenario5ArmourLab.js','spriteRigPreview.js','spriteRigPreview.html'
];

test('legacy renderer stack is physically absent', async () => {
  for (const file of retired) expect(fs.existsSync(path.join(ROOT, file)), file).toBeFalsy();
});

test('name loader only loads the unified character renderer for character presentation', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'name.js'), 'utf8');
  expect(source).toContain("['characterRenderer.js','characterRenderer']");
  for (const file of retired.filter(f => f.endsWith('.js'))) expect(source).not.toContain(file);
});

test('renderer has one owner and no drawImage interception or geometric warping', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'characterRenderer.js'), 'utf8');
  expect(source).not.toContain('CanvasRenderingContext2D.prototype.drawImage');
  expect(source).not.toContain('drawStripDeformedArmour');
  expect(source).not.toContain('affineFromTriangles');
  expect(source).not.toContain('legacyDraw');
  expect(source).toContain("transform: 'translate+uniform-scale'");
  expect(source).toContain('legacyFallback:false');
});

test('front side and back are independent reference rigs', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'characterRenderer.js'), 'utf8');
  expect(source).toContain('const HUMAN_FEMALE_RIGS');
  expect(source).toContain('front: {');
  expect(source).toContain('side: {');
  expect(source).toContain('back: {');
  expect(source).toContain("front: 'images/characters/human_female/body_front.png'");
  expect(source).toContain("side: 'images/characters/human_female/body_side.png'");
  expect(source).toContain("back: 'images/characters/human_female/body_back.png'");
});

test('rigid placement uses one uniform scale and exact vertical alpha anchors', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.CharacterRenderer);
  const result = await page.evaluate(() => {
    const fake = { width:1000, height:1000 };
    return window.CharacterRenderer.computeRigidPlacement(fake, 100, 700, 400, 1, {x:100,y:200,width:500,height:600});
  });
  expect(result.scale).toBe(1);
  expect(result.visible.top).toBe(100);
  expect(result.visible.height).toBe(600);
  expect(result.visible.left).toBe(150);
  expect(result.transform).toBe('translate+uniform-scale');
});

test('only human female is migrated and unmigrated characters deliberately render blank', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.CharacterRenderer);
  const result = await page.evaluate(() => {
    const canvas=document.createElement('canvas'); canvas.width=64; canvas.height=64;
    const ctx=canvas.getContext('2d');
    const male={race:'human',gender:'male',equipped:{}};
    const drawn=window.CharacterRenderer.draw(ctx,male,32,32,1,0);
    const data=ctx.getImageData(0,0,64,64).data;
    let alpha=0; for(let i=3;i<data.length;i+=4) alpha+=data[i];
    return {drawn,alpha,meta:male.__characterRender};
  });
  expect(result.drawn).toBe(false);
  expect(result.alpha).toBe(0);
  expect(result.meta.legacyFallback).toBe(false);
});

test('facing resolver matches flat-top axial movement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.CharacterRenderer);
  const facings=await page.evaluate(() => ({
    right:window.CharacterRenderer.facingFromHexDelta(1,0),
    left:window.CharacterRenderer.facingFromHexDelta(-1,0),
    down:window.CharacterRenderer.facingFromHexDelta(0,1),
    up:window.CharacterRenderer.facingFromHexDelta(0,-1),
  }));
  expect(facings).toEqual({right:'right',left:'left',down:'down',up:'up'});
});
