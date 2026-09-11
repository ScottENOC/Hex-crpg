const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('shared hair appearance model', () => {
  test('character creator exposes continuous hue, saturation and brightness controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#hair-saturation-slider');
    await expect(page.locator('#hair-hue-slider')).toHaveAttribute('min', '0');
    await expect(page.locator('#hair-hue-slider')).toHaveAttribute('max', '359');
    await expect(page.locator('#hair-saturation-slider')).toHaveAttribute('min', '0');
    await expect(page.locator('#hair-saturation-slider')).toHaveAttribute('max', '100');
    await expect(page.locator('#hair-lightness-slider')).toHaveAttribute('min', '0');
    await expect(page.locator('#hair-lightness-slider')).toHaveAttribute('max', '100');
    await expect(page.locator('#hair-color-swatch')).toBeVisible();
  });

  test('player hair colour is stored as race/gender-independent HSL appearance data', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#hair-saturation-slider');
    await page.selectOption('#race-select', 'human');
    await page.selectOption('#gender-select', 'female');
    await page.$eval('#hair-hue-slider', (el) => { el.value = '287'; el.dispatchEvent(new Event('input', { bubbles:true })); });
    await page.$eval('#hair-saturation-slider', (el) => { el.value = '83'; el.dispatchEvent(new Event('input', { bubbles:true })); });
    await page.$eval('#hair-lightness-slider', (el) => { el.value = '41'; el.dispatchEvent(new Event('input', { bubbles:true })); });
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state:'visible' });

    const result = await page.evaluate(() => ({
      appearance: window.party[0].appearance,
      legacy: {
        hue: window.party[0].hairHue,
        light: window.party[0].hairLightMult,
        sat: window.party[0].hairSatMult,
      }
    }));
    expect(result.appearance.hairStyle).toBe('classic_1');
    expect(result.appearance.hairColor.hue).toBeCloseTo(287, 4);
    expect(result.appearance.hairColor.saturation).toBeCloseTo(0.83, 4);
    expect(result.appearance.hairColor.lightness).toBeCloseTo(0.41, 4);
    expect(result.legacy.hue).toBeCloseTo(287, 4);
    expect(result.legacy.light).toBeGreaterThan(0);
    expect(result.legacy.sat).toBeGreaterThan(0);
  });

  test('NPC natural colours are deterministic, continuous, and stay inside natural family ranges', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.generateNaturalHairColor === 'function');
    const result = await page.evaluate(() => {
      const names = Array.from({ length:120 }, (_, i) => `Natural Hair ${i}`);
      const colours = names.map(n => window.generateNaturalHairColor(n));
      const again = names.map(n => window.generateNaturalHairColor(n));
      const unique = new Set(colours.map(c => `${c.hue.toFixed(5)}:${c.saturation.toFixed(5)}:${c.lightness.toFixed(5)}`));
      const families = new Set(colours.map(c => c.family));
      const definitions = Object.fromEntries(window.NATURAL_HAIR_FAMILIES.map(f => [f.id, f]));
      const invalid = colours.filter(c => {
        const f = definitions[c.family];
        return !f || c.hue < f.hue[0] || c.hue > f.hue[1]
          || c.saturation < f.saturation[0] || c.saturation > f.saturation[1]
          || c.lightness < f.lightness[0] || c.lightness > f.lightness[1];
      });
      return { colours, again, uniqueCount:unique.size, families:[...families], invalid };
    });

    expect(result.again).toEqual(result.colours);
    expect(result.uniqueCount).toBeGreaterThan(100);
    expect(result.invalid).toEqual([]);
    expect(result.families).toEqual(expect.arrayContaining(['brown', 'blond', 'red', 'grey']));
  });

  test('legacy hair preset API now returns continuously varied natural colours', async ({ page }) => {
    await createCharacter(page);
    const result = await page.evaluate(() => {
      const presets = Array.from({ length:40 }, (_, i) => window.pickHairPreset(`NPC ${i}`));
      return {
        unique: new Set(presets.map(p => `${p.hue.toFixed(4)}:${p.lightMult.toFixed(4)}:${p.satMult.toFixed(4)}`)).size,
        families: [...new Set(presets.map(p => p.family))],
      };
    });
    expect(result.unique).toBeGreaterThan(30);
    expect(result.families.length).toBeGreaterThanOrEqual(3);
  });
});
