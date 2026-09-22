const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('generated civilian visual diversity', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() => !!window.GeneratedCivilianPopulation && !!window.CivilianVisualDiversity);
  });

  test('styles only materialised civilians and keeps the 1,000-record off-screen population free of visual scans', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const visuals = window.CivilianVisualDiversity;
      window.entities.filter(e => e.side === 'player').forEach(p => {
        p.hex = { q: 5000, r: 5000 };
        p.visualQ = 5000;
        p.visualR = 5000;
      });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(1000);
      const materialisePulse = pop.pulseMaterialisation();
      const visualPulse = visuals.styleMaterialised();
      return {
        population: pop.stats.population,
        materialised: pop.stats.materialised,
        materialiseScanned: materialisePulse.scanned,
        visualScanned: visualPulse.scanned,
      };
    });

    expect(result.population).toBe(1000);
    expect(result.materialised).toBe(0);
    expect(result.materialiseScanned).toBe(0);
    expect(result.visualScanned).toBe(0);
  });

  test('nearby civilians receive stable renderer-facing hair, body, skin and clothing fields with visible variety', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const visuals = window.CivilianVisualDiversity;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(220);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q: c.q, r: c.r };
      player.visualQ = c.q;
      player.visualR = c.r;
      pop.pulseMaterialisation();
      const styled = visuals.styleMaterialised();
      const civilians = [...pop.materialised.values()];
      return {
        count: civilians.length,
        styled,
        uniqueKeys: new Set(civilians.map(e => e.civilianAppearanceKey)).size,
        sample: civilians.slice(0, 12).map(e => ({
          race: e.race,
          gender: e.gender,
          shirtHue: e.shirtHue,
          pantsHue: e.pantsHue,
          skinHue: e.skinHue,
          skinSaturation: e.skinSaturation,
          skinLightness: e.skinLightness,
          hairStyle: e.hairStyle,
          hairHue: e.hairHue,
          bodyType: e.bodyType,
          occupation: e.occupation,
          prop: e.ambientProp,
          clothes: e.equipped?.clothes || null,
          key: e.civilianAppearanceKey,
        })),
      };
    });

    expect(result.count).toBeGreaterThan(5);
    expect(result.count).toBeLessThanOrEqual(40);
    expect(result.styled.scanned).toBe(result.count);
    expect(result.uniqueKeys).toBeGreaterThan(5);
    for (const e of result.sample) {
      expect(Number.isFinite(e.shirtHue)).toBe(true);
      expect(Number.isFinite(e.pantsHue)).toBe(true);
      expect(Number.isFinite(e.skinHue)).toBe(true);
      expect(Number.isFinite(e.skinSaturation)).toBe(true);
      expect(Number.isFinite(e.skinLightness)).toBe(true);
      expect(['brown_1', 'braid', 'curly']).toContain(e.hairStyle);
      expect(Number.isFinite(e.hairHue)).toBe(true);
      expect(['average', 'broad']).toContain(e.bodyType);
      expect(e.key).toBeTruthy();
    }
  });

  test('race palettes give generated orcs and goblins greenskin tones while humans stay on the natural human ramp', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const visuals = window.CivilianVisualDiversity;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q: 5000, r: 5000 }; });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(500);
      const records = [...pop.records.values()];
      const chosen = ['human', 'orc', 'goblin'].map(race => records.find(r => r.race === race));
      return chosen.map(record => {
        const fake = {
          isGeneratedCivilian: true,
          race: record.race,
          gender: record.gender,
          occupation: record.occupation,
          ambientProp: record.prop,
          equipped: {},
        };
        visuals.styleEntity(fake, record);
        return { race: record.race, hue: fake.skinHue, sat: fake.skinSaturation, light: fake.skinLightness };
      });
    });

    const human = result.find(x => x.race === 'human');
    const orc = result.find(x => x.race === 'orc');
    const goblin = result.find(x => x.race === 'goblin');
    expect(human.hue).toBeLessThan(40);
    expect(orc.hue).toBeGreaterThanOrEqual(100);
    expect(goblin.hue).toBeGreaterThanOrEqual(90);
    expect(orc.sat).toBeGreaterThanOrEqual(0.08);
    expect(goblin.sat).toBeGreaterThanOrEqual(0.2);
  });

  test('occupation props draw as cosmetics without occupying weapon or offhand slots', async ({ page }) => {
    const result = await page.evaluate(() => {
      const visuals = window.CivilianVisualDiversity;
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const props = ['basket', 'sack', 'pouch', 'hammer', 'net', 'bundle', 'scroll', 'jug', 'tool'];
      const drawn = props.map((prop, i) => visuals.drawPropShape(ctx, prop, 8 + (i % 5) * 12, 12 + Math.floor(i / 5) * 30, 9));
      const alphaPixels = [...ctx.getImageData(0, 0, 64, 64).data].filter((_, i) => i % 4 === 3 && ctx.getImageData(0, 0, 64, 64).data[i] > 0).length;

      const pop = window.GeneratedCivilianPopulation;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q: 5000, r: 5000 }; });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(300);
      const record = [...pop.records.values()].find(r => r.prop);
      const fake = {
        isGeneratedCivilian: true,
        race: record.race,
        gender: record.gender,
        occupation: record.occupation,
        equipped: { weapon: null, offhand: null, armor: null, helmet: null },
      };
      visuals.styleEntity(fake, record);
      return {
        everyShapeDrawn: drawn.every(Boolean),
        alphaPixels,
        ambientProp: fake.ambientProp,
        weapon: fake.equipped.weapon,
        offhand: fake.equipped.offhand,
      };
    });

    expect(result.everyShapeDrawn).toBe(true);
    expect(result.alphaPixels).toBeGreaterThan(20);
    expect(result.ambientProp).toBeTruthy();
    expect(result.weapon).toBeNull();
    expect(result.offhand).toBeNull();
  });
});
