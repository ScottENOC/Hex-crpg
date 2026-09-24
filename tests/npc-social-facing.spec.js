const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('NPC social facing', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() => !!window.NPCSocialFacing && !!window.GeneratedCivilianPopulation);
  });

  test('stationary generated civilians do not all keep the default facing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(24);
      const records = [...pop.records.values()].slice(0, 12);
      const created = records.map(record => pop.materialise(record)).filter(Boolean);
      created.forEach(entity => { entity.destination = null; entity.__socialInitialFacingApplied = false; });
      window.NPCSocialFacing.pulse();
      return created.map(entity => entity.facing);
    });

    expect(result.length).toBeGreaterThan(3);
    expect(new Set(result).size).toBeGreaterThan(1);
  });

  test('an ambient-chat pair turns toward one another', async ({ page }) => {
    const result = await page.evaluate(() => {
      const a = new window.Entity('Facing A', '#888', { q: 0, r: 0 }, 10);
      const b = new window.Entity('Facing B', '#888', { q: 2, r: 0 }, 10);
      for (const e of [a,b]) {
        e.alive = true;
        e.side = 'neutral';
        e.isNPC = true;
        e.facing = 'down';
        window.entities.push(e);
      }
      window.lastAmbientChatter = { exchangeId:'facing-test', pair:[a.name,b.name] };
      window.NPCSocialFacing.pulse();
      return { a:a.facing, b:b.facing };
    });

    expect(result).toEqual({ a:'right', b:'left' });
  });
});
