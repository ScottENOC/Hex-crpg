const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Hollowmere generated population tuning', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() => !!window.HollowmerePopulationTuning && !!window.GeneratedCivilianPopulation);
  });

  test('generic Hollowmere residents do not randomly become goblins or orcs', async ({ page }) => {
    const races = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(500);
      return [...pop.records.values()].map(r => r.race);
    });

    expect(races.length).toBe(500);
    expect(races.some(r => r === 'goblin' || r === 'orc')).toBe(false);
    expect(new Set(races)).toEqual(new Set(['human', 'dwarf', 'elf']));
  });

  test('social routine nodes are distributed across several village districts', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(180);
      const c = window.campaign2Landmarks.crossroads;
      const nodes = [...pop.records.values()].map(r => r.nodes.social.hex);
      const quadrants = new Set(nodes.map(h => `${h.q >= c.q ? 'E' : 'W'}${h.r >= c.r ? 'S' : 'N'}`));
      const unique = new Set(nodes.map(h => `${h.q},${h.r}`));
      const maxNearCrossroads = nodes.filter(h => {
        const dq = h.q - c.q, dr = h.r - c.r;
        return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= 12;
      }).length;
      return { total:nodes.length, unique:unique.size, quadrants:[...quadrants], maxNearCrossroads };
    });

    expect(result.total).toBe(180);
    expect(result.unique).toBeGreaterThan(150);
    expect(result.quadrants.length).toBe(4);
    expect(result.maxNearCrossroads).toBeLessThan(30);
  });
});
