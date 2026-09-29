const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function waitForDirectRenderer(page, key = 'human_female') {
  await page.waitForFunction((characterKey) => {
    const assets = window.DIRECTIONAL_CHARACTER_ASSETS?.[characterKey];
    return window.__humanoidRendererReady === true
      && assets?.body?.average?.front?.complete
      && assets.body.average.front.naturalWidth > 0;
  }, key);
}

async function waitForRearEquipmentAssets(page) {
  await page.waitForFunction(() => {
    const rear = window.REAR_HUMAN_EQUIPMENT_ASSETS;
    return rear?.shield?.naturalWidth > 0
      && rear?.helmet?.naturalWidth > 0
      && rear?.armour?.light?.naturalWidth > 0
      && rear?.armour?.medium?.naturalWidth > 0
      && rear?.armour?.heavy?.naturalWidth > 0;
  });
}

async function waitForDirectMatrixAssets(page) {
  await page.waitForFunction(() => {
    const visuals = window.gameVisuals || {};
    const equipment = ['humanLight','humanMedium','humanHeavy','swordIcon','shield','nasal_helm','axe','club','spear','bow'];
    if (!equipment.every(key => visuals[key]?.naturalWidth > 0)) return false;

    const sets = window.DIRECTIONAL_CHARACTER_ASSETS || {};
    const required = [
      sets.human_female?.body?.average,
      sets.human_female?.body?.broad,
      sets.human_male?.body?.average,
      sets.human_male?.body?.broad,
      sets.elf_female?.body?.average,
    ];
    return required.every(views => views && ['front','side','back'].every(view => views[view]?.naturalWidth > 0));
  });
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
    const rendered = window.drawDirectionalHumanoidInBounds(
      ctx,
      entity,
      { left:(canvas.width-width)/2, top:20, width, height },
      facing,
    );

    return {
      rendered,
      count:window.__humanoidRendererDrawCount || 0,
      layerOrder:[...(window.__humanoidRendererLastLayerOrder || [])],
      draw:window.__humanoidRendererLastDraw && {
        key:window.__humanoidRendererLastDraw.key,
        view:window.__humanoidRendererLastDraw.view,
        facing:window.__humanoidRendererLastDraw.facing,
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

function expectForegroundShieldOrder(order, headLayer) {
  const body = order.indexOf('body');
  const armour = order.indexOf('armour');
  const head = order.indexOf(headLayer);
  const shield = order.indexOf('shield');
  const weapons = order.indexOf('weapons');

  expect(body).toBe(0);
  expect(armour).toBeGreaterThan(body);
  expect(head).toBeGreaterThan(armour);
  expect(shield).toBeGreaterThan(head);
  expect(weapons).toBeGreaterThan(shield);

  for (const clothing of ['underwear','bra','pants','shirt']) {
    const index = order.indexOf(clothing);
    if (index >= 0) {
      expect(index).toBeGreaterThan(body);
      expect(index).toBeLessThan(armour);
    }
  }
}

function expectRightSideOrder(order, headLayer) {
  const shield = order.indexOf('shield');
  const body = order.indexOf('body');
  const armour = order.indexOf('armour');
  const head = order.indexOf(headLayer);
  const weapons = order.indexOf('weapons');

  expect(shield).toBeGreaterThanOrEqual(0);
  expect(body).toBeGreaterThan(shield);
  expect(armour).toBeGreaterThan(body);
  expect(head).toBeGreaterThan(armour);
  expect(weapons).toBeGreaterThan(head);

  for (const clothing of ['underwear','bra','pants','shirt']) {
    const index = order.indexOf(clothing);
    if (index >= 0) {
      expect(index).toBeGreaterThan(body);
      expect(index).toBeLessThan(armour);
    }
  }
}

function expectBackOrder(order, headLayer) {
  const shield = order.indexOf('shield');
  const weapons = order.indexOf('weapons');
  const body = order.indexOf('body');
  const armour = order.indexOf('armour');
  const head = order.indexOf(headLayer);

  expect(shield).toBeGreaterThanOrEqual(0);
  expect(weapons).toBeGreaterThan(shield);
  expect(body).toBeGreaterThan(weapons);
  expect(armour).toBeGreaterThan(body);
  expect(head).toBeGreaterThan(armour);
}

test.describe('direct humanoid compositor', () => {
  test('maps facings to authored views and preloads current directional assets', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectMatrixAssets(page);

    const result = await page.evaluate(() => ({
      views:{
        down:window.facingToSpriteView('down'),
        up:window.facingToSpriteView('up'),
        left:window.facingToSpriteView('left'),
        right:window.facingToSpriteView('right'),
      },
      femaleHair:Object.values(window.DIRECTIONAL_CHARACTER_ASSETS.human_female.hair.brown_1)
        .map(img => [img.naturalWidth,img.naturalHeight]),
    }));

    expect(result.views).toEqual({down:'front',up:'back',left:'side',right:'side'});
    expect(result.femaleHair).toHaveLength(3);
    for (const [width,height] of result.femaleHair) {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  test('human female uses facing-aware shield painter order', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectRenderer(page, 'human_female');
    await waitForRearEquipmentAssets(page);

    const down = await renderEquippedHuman(page, 'female', 'down');
    expect(down.rendered).toBe(true);
    expect(down.count).toBeGreaterThan(0);
    expectForegroundShieldOrder(down.layerOrder, 'helmet');
    expect(down.draw).toEqual({key:'human_female',view:'front',facing:'down'});
    expect(down.armour).toMatchObject({
      view:'front',
      compositionSource:'direct-horizontal-strip-width-profile',
      rotation:0,
      shear:false,
    });
    expect(down.armour.width).toBeGreaterThan(0);
    expect(down.armour.height).toBeGreaterThan(0);

    const right = await renderEquippedHuman(page, 'female', 'right');
    expectRightSideOrder(right.layerOrder, 'helmet');
    expect(right.draw).toEqual({key:'human_female',view:'side',facing:'right'});
    expect(right.armour).toMatchObject({
      view:'side',
      compositionSource:'direct-axis-aligned-scale-translate',
      rotation:0,
      shear:false,
    });

    const left = await renderEquippedHuman(page, 'female', 'left');
    expectForegroundShieldOrder(left.layerOrder, 'helmet');
    expect(left.draw).toEqual({key:'human_female',view:'side',facing:'left'});

    const up = await renderEquippedHuman(page, 'female', 'up');
    expectBackOrder(up.layerOrder, 'helmet');
    expect(up.draw).toEqual({key:'human_female',view:'back',facing:'up'});
    expect(up.armour).toMatchObject({
      view:'back',
      compositionSource:'direct-horizontal-strip-width-profile',
      rotation:0,
      shear:false,
    });

    const hair = await renderEquippedHuman(page, 'female', 'down', { helmet:false });
    expectForegroundShieldOrder(hair.layerOrder, 'hair');
  });

  test('human male follows the same current direct-compositor order', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'male' });
    await waitForDirectRenderer(page, 'human_male');

    const result = await renderEquippedHuman(page, 'male', 'down');
    expect(result.rendered).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expectForegroundShieldOrder(result.layerOrder, 'helmet');
    expect(result.draw).toEqual({key:'human_male',view:'front',facing:'down'});
    expect(result.armour).toMatchObject({
      view:'front',
      compositionSource:'direct-horizontal-strip-width-profile',
      rotation:0,
      shear:false,
    });
  });

  test('held weapons scale with compositor bounds instead of world camera size', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectRenderer(page, 'human_female');

    const sizes = await page.evaluate(() => {
      const entity = (window.entities || []).find(e => e.alive && e.race === 'human' && e.gender === 'female' && e.side === 'player');
      entity.equipped = { ...(entity.equipped || {}), weapon:'sword', offhand:null, armor:null, helmet:null };
      entity.displayClothes = false;

      const marker = document.createElement('canvas');
      marker.width = 16;
      marker.height = 16;
      const appearance = window.equipmentAppearanceSystem;
      const originalResolve = appearance?.resolveWeaponImage;
      if (appearance) appearance.resolveWeaponImage = () => marker;

      function captureWeaponSize(height) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        const width = height * (window.HUMAN_FEMALE_RENDER_ASPECT || 0.48);
        const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
        let weaponSize = null;
        CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
          if (this === ctx && image === marker && args.length === 4) weaponSize = Math.abs(args[2]);
          return originalDraw.call(this, image, ...args);
        };
        try {
          window.drawDirectionalHumanoidInBounds(ctx, entity, {left:(320-width)/2,top:10,width,height}, 'down');
        } finally {
          CanvasRenderingContext2D.prototype.drawImage = originalDraw;
        }
        return weaponSize;
      }

      try {
        return {world:captureWeaponSize(240), portrait:captureWeaponSize(92)};
      } finally {
        if (appearance) appearance.resolveWeaponImage = originalResolve;
      }
    });

    expect(sizes.world).toBeGreaterThan(0);
    expect(sizes.portrait).toBeGreaterThan(0);
    expect(sizes.portrait / sizes.world).toBeCloseTo(92 / 240, 5);
  });

  test('representative direct-renderer equipment matrix draws without exceptions', async ({ page }) => {
    test.setTimeout(90000);
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectMatrixAssets(page);
    await waitForRearEquipmentAssets(page);

    const result = await page.evaluate(() => {
      const profiles = [
        {race:'human',gender:'female',bodies:['average','broad']},
        {race:'human',gender:'male',bodies:['average','broad']},
        {race:'elf',gender:'female',bodies:['average']},
      ];
      const facings = ['down','right','left','up'];
      const armours = [null,'light_armor','medium_armor','heavy_armor'];
      const helmets = [null,'nasal_helm'];
      const equipmentCases = [
        {weapon:null,offhand:null},
        {weapon:'dagger',offhand:null},
        {weapon:'sword',offhand:null},
        {weapon:'axe',offhand:null},
        {weapon:'club',offhand:null},
        {weapon:'spear',offhand:null},
        {weapon:'bow',offhand:null},
        {weapon:'sword',offhand:'wooden_shield'},
        {weapon:'sword',offhand:'dagger'},
      ];
      const canvas = document.createElement('canvas');
      canvas.width = 260;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      const failures = [];
      let count = 0;

      for (const profile of profiles) for (const bodyType of profile.bodies) {
        for (const facing of facings) for (const armor of armours) for (const helmet of helmets) for (const equipment of equipmentCases) {
          const entity = window.createCharacterData(profile.race, 'fighter', `Renderer matrix ${count}`, profile.gender);
          Object.assign(entity, {
            bodyType,
            facing,
            alive:true,
            displayClothes:false,
            hairHue:25,
            skinHue:20,
            skinSaturation:40,
            skinLightness:55,
          });
          entity.equipped = { ...(entity.equipped || {}), armor, helmet, ...equipment };
          ctx.clearRect(0,0,canvas.width,canvas.height);
          try {
            const rendered = window.drawDirectionalHumanoidInBounds(
              ctx,
              entity,
              {left:72,top:20,width:116,height:240},
              facing,
            );
            if (!rendered) failures.push({profile,bodyType,facing,armor,helmet,equipment,error:'renderer returned false'});
          } catch (error) {
            failures.push({profile,bodyType,facing,armor,helmet,equipment,error:String(error?.stack || error)});
          }
          count += 1;
        }
      }
      return {count,failures};
    });

    expect(result.count).toBe(1440);
    expect(result.failures).toEqual([]);
  });
});
