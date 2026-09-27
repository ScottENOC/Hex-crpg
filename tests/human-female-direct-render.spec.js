const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

const ROOT = 'http://127.0.0.1:3000';

async function waitForDirectRenderer(page, key = 'human_female') {
  await page.waitForFunction((characterKey) => {
    const assets = window.DIRECTIONAL_CHARACTER_ASSETS?.[characterKey];
    return window.__humanoidRendererReady === true
      && assets?.body?.average?.front?.complete
      && assets.body.average.front.naturalWidth > 0;
  }, key);
}

async function renderEquippedHuman(page, gender, facing, { helmet = true } = {}) {
  return page.evaluate(({ gender, facing, helmet }) => {
    const entity = (window.entities || []).find(e => e.alive && e.race === 'human' && e.gender === gender && e.side === 'player');
    if (!entity) throw new Error(`No player-side human ${gender} entity found`);
    entity.equipped = {
      ...(entity.equipped || {}),
      armor:'heavy_armor',
      helmet:helmet ? 'nasal_helm' : null,
      weapon:'sword',
      offhand:'wooden_shield',
    };
    entity.facing = facing;

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const height = 240;
    const width = height * (window.HUMAN_FEMALE_RENDER_ASPECT || 0.48);

    window.__humanoidRendererDrawCount = 0;
    window.__humanoidRendererLastArmour = null;
    window.__humanoidRendererLastLayerOrder = null;
    window.drawDirectionalHumanoidInBounds(
      ctx,
      entity,
      { left:(canvas.width-width)/2, top:20, width, height },
      facing,
    );

    return {
      count:window.__humanoidRendererDrawCount || 0,
      layerOrder:[...(window.__humanoidRendererLastLayerOrder || [])],
      draw:window.__humanoidRendererLastDraw && {
        key:window.__humanoidRendererLastDraw.key,
        view:window.__humanoidRendererLastDraw.view,
        facing:window.__humanoidRendererLastDraw.facing,
        bounds:{...window.__humanoidRendererLastDraw.bounds},
      },
      armour:window.__humanoidRendererLastArmour && {
        view:window.__humanoidRendererLastArmour.view,
        compositionSource:window.__humanoidRendererLastArmour.compositionSource,
        rotation:window.__humanoidRendererLastArmour.rotation,
        shear:window.__humanoidRendererLastArmour.shear,
        width:window.__humanoidRendererLastArmour.width,
        height:window.__humanoidRendererLastArmour.height,
      },
    };
  }, { gender, facing, helmet });
}

test.describe('direct humanoid compositor', () => {
  test('runtime stack no longer loads canvas-interception character patches', async ({ page }) => {
    const nameSource = await (await page.request.get(`${ROOT}/name.js`)).text();
    const rendererSource = await (await page.request.get(`${ROOT}/humanoidRenderer.js`)).text();

    expect(nameSource).toContain("['humanoidRenderer.js','humanoidRenderer']");
    for (const retired of [
      'characterRig.js',
      'facingSystem.js',
      'directionalHairTuning.js',
      'directionalWeaponTuning.js',
      'directionalEquipmentTuning.js',
      'directionalRigHandoff.js',
      'directionalCharacterUI.js',
    ]) {
      expect(nameSource).not.toContain(`['${retired}'`);
    }

    expect(rendererSource).toContain('function drawDirectionalHumanoidInBounds');
    expect(rendererSource).toContain("compositionSource:'direct-axis-aligned-scale-translate'");
    expect(rendererSource).not.toMatch(/ctx\.drawImage\s*=/);
    expect(rendererSource).not.toMatch(/\.rotate\s*\(/);
    expect(rendererSource).not.toContain('drawStripDeformedArmour');
    expect(rendererSource).not.toContain('drawWarpedArmour');
  });

  test('human female paints body, head layer, armour, shield, then weapons in every view', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectRenderer(page, 'human_female');

    const down = await renderEquippedHuman(page, 'female', 'down');
    expect(down.count).toBeGreaterThan(0);
    expect(down.layerOrder).toEqual(['body','helmet','armour','shield','weapons']);
    expect(down.draw).toMatchObject({key:'human_female',view:'front',facing:'down'});
    expect(down.armour).toMatchObject({
      view:'front',
      compositionSource:'direct-axis-aligned-scale-translate',
      rotation:0,
      shear:false,
    });
    expect(down.armour.width).toBeGreaterThan(0);
    expect(down.armour.height).toBeGreaterThan(0);

    const right = await renderEquippedHuman(page, 'female', 'right');
    expect(right.layerOrder).toEqual(['body','helmet','armour','shield','weapons']);
    expect(right.draw).toMatchObject({key:'human_female',view:'side',facing:'right'});
    expect(right.armour).toMatchObject({view:'side',rotation:0,shear:false});

    const up = await renderEquippedHuman(page, 'female', 'up');
    expect(up.layerOrder).toEqual(['body','helmet','armour','shield','weapons']);
    expect(up.draw).toMatchObject({key:'human_female',view:'back',facing:'up'});
    expect(up.armour).toMatchObject({view:'back',rotation:0,shear:false});

    const hair = await renderEquippedHuman(page, 'female', 'down', { helmet:false });
    expect(hair.layerOrder).toEqual(['body','hair','armour','shield','weapons']);
  });

  test('human male uses the same deterministic layer contract', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'male' });
    await waitForDirectRenderer(page, 'human_male');

    const result = await renderEquippedHuman(page, 'male', 'down');
    expect(result.count).toBeGreaterThan(0);
    expect(result.layerOrder).toEqual(['body','helmet','armour','shield','weapons']);
    expect(result.draw).toMatchObject({key:'human_male',view:'front',facing:'down'});
    expect(result.armour).toMatchObject({
      view:'front',
      compositionSource:'direct-axis-aligned-scale-translate',
      rotation:0,
      shear:false,
    });
  });
});
