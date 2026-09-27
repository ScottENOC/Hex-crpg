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

async function waitForRendererMatrixAssets(page) {
  await page.waitForFunction(() => {
    const visuals = window.gameVisuals || {};
    const legacyKeys = [
      'humanBase', 'humanHair', 'humanMaleBase', 'humanMaleHair',
      'elfFemaleBase', 'elfFemaleHair', 'elfMaleBase', 'elfMaleHair',
      'dwarfFemaleBase', 'dwarfFemaleHair', 'dwarfMaleBase', 'dwarfMaleHair',
      'orcBase', 'monsterDefault',
      'humanLight', 'humanMedium', 'humanHeavy',
      'swordIcon', 'shield', 'nasal_helm', 'axe', 'club', 'spear', 'bow',
    ];
    const female = window.DIRECTIONAL_CHARACTER_ASSETS?.human_female;
    const male = window.DIRECTIONAL_CHARACTER_ASSETS?.human_male;
    return window.__humanoidRendererInstalled === true
      && legacyKeys.every(key => visuals[key]?.naturalWidth > 0)
      && female?.body?.average?.front?.naturalWidth > 0
      && female?.body?.broad?.front?.naturalWidth > 0
      && male?.body?.average?.front?.naturalWidth > 0
      && male?.body?.broad?.front?.naturalWidth > 0
      && male?.body?.broad?.side?.naturalWidth > 0
      && male?.body?.broad?.back?.naturalWidth > 0;
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
    const entitiesSource = await (await page.request.get(`${ROOT}/entities.js`)).text();
    const graphicsSource = await (await page.request.get(`${ROOT}/graphicsSettings.js`)).text();

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

    expect(entitiesSource).not.toContain('facingSystem.js?');
    expect(graphicsSource).not.toContain("script.src = 'characterRig.js");
    expect(rendererSource).toContain('function drawDirectionalHumanoidInBounds');
    expect(rendererSource).toContain("compositionSource:'direct-axis-aligned-scale-translate'");
    expect(rendererSource).toContain("human_female:{x:-.1873125,y:-.015,w:.374625,h:.2183}");
    expect(rendererSource).toContain('const SHIELD_OPAQUE_HEIGHT_DROP = .10;');
    expect(rendererSource).toContain("shield:'images/shield_back.svg'");
    expect(rendererSource).toContain("helmet:'images/nasalHelm_back.svg'");
    expect(rendererSource).toContain("heldItems:{sword:{inward:0,y:.171336564429012}}");
    expect(rendererSource).toContain("front:'images/characters/human_male/body_broad_front.png'");
    expect(rendererSource).toContain("side:'images/characters/human_male/body_broad_side.png'");
    expect(rendererSource).toContain("back:'images/characters/human_male/body_broad_back.png'");
    expect(rendererSource).not.toMatch(/ctx\.drawImage\s*=/);
    expect(rendererSource).not.toMatch(/\.rotate\s*\(/);
    expect(rendererSource).not.toContain('drawStripDeformedArmour');
    expect(rendererSource).not.toContain('drawWarpedArmour');
  });

  test('human female keeps front/side items high and paints back-view items lowest', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectRenderer(page, 'human_female');
    await waitForRearEquipmentAssets(page);

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
    expect(up.layerOrder).toEqual(['shield','weapons','body','helmet','armour']);
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

  test('held weapons scale with compositor bounds instead of world camera size', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForDirectRenderer(page, 'human_female');

    const sizes = await page.evaluate(() => {
      const entity = (window.entities || []).find(e => e.alive && e.race === 'human' && e.gender === 'female' && e.side === 'player');
      entity.equipped = { ...(entity.equipped || {}), weapon:'sword', offhand:null, armor:null, helmet:null };

      function captureWeaponSize(height) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');
        const width = height * (window.HUMAN_FEMALE_RENDER_ASPECT || 0.48);
        const original = CanvasRenderingContext2D.prototype.drawImage;
        let weaponSize = null;
        CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
          if (this === ctx && image === window.gameVisuals?.swordIcon && args.length === 4) {
            weaponSize = Math.abs(args[2]);
          }
          return original.call(this, image, ...args);
        };
        try {
          window.drawDirectionalHumanoidInBounds(
            ctx,
            entity,
            {left:(canvas.width-width)/2, top:10, width, height},
            'down',
          );
        } finally {
          CanvasRenderingContext2D.prototype.drawImage = original;
        }
        return weaponSize;
      }

      return {world:captureWeaponSize(240), portrait:captureWeaponSize(92)};
    });

    expect(sizes.world).toBeGreaterThan(0);
    expect(sizes.portrait).toBeGreaterThan(0);
    expect(sizes.portrait / sizes.world).toBeCloseTo(92 / 240, 5);
  });

  test('all selectable race, gender, class, body, armour and renderer-distinct equipment combinations draw without exceptions', async ({ page }) => {
    test.setTimeout(120000);
    await createCharacter(page, { race:'human', gender:'female' });
    await waitForRendererMatrixAssets(page);

    const result = await page.evaluate(() => {
      const races = Array.from(document.querySelectorAll('#race-select option')).map(o => o.value);
      const genders = Array.from(document.querySelectorAll('#gender-select option')).map(o => o.value);
      const classes = Array.from(document.querySelectorAll('#class-select option')).map(o => o.value);
      const bodies = Array.from(document.querySelectorAll('#body-type-select option')).map(o => o.value);
      const armours = [null, 'light_armor', 'medium_armor', 'heavy_armor'];
      const helmets = [null, 'nasal_helm'];
      const equipmentCases = [
        {name:'unarmed', weapon:null, offhand:null},
        {name:'dagger', weapon:'dagger', offhand:null},
        {name:'sword', weapon:'sword', offhand:null},
        {name:'axe', weapon:'axe', offhand:null},
        {name:'club', weapon:'club', offhand:null},
        {name:'spear', weapon:'spear', offhand:null},
        {name:'bow', weapon:'bow', offhand:null},
        {name:'sword+shield', weapon:'sword', offhand:'wooden_shield'},
        {name:'dual-wield', weapon:'sword', offhand:'dagger'},
      ];
      const canvas = document.createElement('canvas');
      canvas.width = 260;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      const failures = [];
      const directLayerFailures = [];
      let count = 0;
      let directCount = 0;

      for (const race of races) for (const gender of genders) for (const cls of classes) for (const bodyType of bodies) {
        for (const armor of armours) for (const helmet of helmets) for (const equipment of equipmentCases) {
          const entity = window.createCharacterData(race, cls, `Renderer matrix ${race} ${gender} ${cls}`, gender);
          Object.assign(entity, {
            bodyType,
            facing:'down',
            alive:true,
            shirtHue:30,
            pantsHue:220,
            hairHue:25,
            skinHue:20,
            skinSaturation:40,
            skinLightness:55,
          });
          entity.equipped = {
            ...(entity.equipped || {}),
            armor,
            helmet,
            weapon:equipment.weapon,
            offhand:equipment.offhand,
          };
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          try {
            ctx.save();
            window.drawPlayerCharacter(ctx, entity, canvas.width / 2, 135, 0.8, 0);
            ctx.restore();
            count++;

            if (race === 'human' && (gender === 'female' || gender === 'male')) {
              directCount++;
              const expected = ['body', helmet ? 'helmet' : 'hair'];
              if (armor) expected.push('armour');
              if (equipment.offhand === 'wooden_shield') expected.push('shield');
              if (equipment.weapon || (equipment.offhand && equipment.offhand !== 'wooden_shield')) expected.push('weapons');
              const actual = [...(window.__humanoidRendererLastLayerOrder || [])];
              if (actual.join('|') !== expected.join('|')) {
                directLayerFailures.push({race,gender,cls,bodyType,armor,helmet,equipment:equipment.name,expected,actual});
              }
            }
          } catch (error) {
            try { ctx.restore(); } catch (_) {}
            failures.push({race,gender,cls,bodyType,armor,helmet,equipment:equipment.name,error:String(error?.stack || error)});
          }
        }
      }

      const expected = races.length * genders.length * classes.length * bodies.length
        * armours.length * helmets.length * equipmentCases.length;
      return {count,directCount,expected,failures,directLayerFailures,races,genders,classes,bodies};
    });

    expect(result.races).toEqual(['human','dwarf','elf','goblin','orc']);
    expect(result.genders).toEqual(['female','male','other']);
    expect(result.classes).toEqual(['fighter','rogue','cleric','wizard','druid','monk']);
    expect(result.bodies).toEqual(['average','broad']);
    expect(result.expected).toBe(12960);
    expect(result.count).toBe(result.expected);
    expect(result.directCount).toBe(1728);
    expect(result.failures).toEqual([]);
    expect(result.directLayerFailures).toEqual([]);
  });
});
