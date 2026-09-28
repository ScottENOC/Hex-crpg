const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Northwatch siege explicit trigger', () => {
  test('defenders exist but attackers do not until siege activation', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female', cls:'fighter', campaign:'2' });
    await page.waitForFunction(() => !!window.NorthwatchSiegeSpawn && !!window.campaign2NorthwatchCenter);

    const before = await page.evaluate(() => ({
      defenders: window.entities.filter(e => e.alive && e.factionTag === 'northwatch_human').length,
      attackers: window.entities.filter(e => window.NorthwatchSiegeSpawn.isNorthwatchAttacker(e)).length,
      pending: window.NorthwatchSiegeSpawn.pendingCount(),
      siegeActive: !!window.siegeState?.active,
      inCombat: !!window.isInCombat,
    }));

    expect(before.defenders).toBeGreaterThan(0);
    expect(before.attackers).toBe(0);
    expect(before.pending).toBeGreaterThan(0);
    expect(before.siegeActive).toBe(false);
    expect(before.inCombat).toBe(false);

    const after = await page.evaluate(() => {
      window.activateNorthwatchSiege();
      return {
        defenders: window.entities.filter(e => e.alive && e.factionTag === 'northwatch_human').length,
        attackers: window.entities.filter(e => window.NorthwatchSiegeSpawn.isNorthwatchAttacker(e)).length,
        pending: window.NorthwatchSiegeSpawn.pendingCount(),
        siegeActive: !!window.siegeState?.active,
      };
    });

    expect(after.defenders).toBe(before.defenders);
    expect(after.attackers).toBeGreaterThan(0);
    expect(after.pending).toBe(0);
    expect(after.siegeActive).toBe(true);
  });

  test('unrelated combat cannot make a pre-trigger Northwatch catapult act', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female', cls:'fighter', campaign:'2' });
    await page.waitForFunction(() => !!window.NorthwatchSiegeSpawn && !!window.campaign2NorthwatchCatapult);

    const result = await page.evaluate(() => {
      const catapult = window.campaign2NorthwatchCatapult;
      const shotsBefore = catapult.firesRemaining;
      window.isInCombat = true; // simulate an unrelated local scripted fight
      const liveBefore = window.entities.includes(catapult);
      // Even though the global scheduler is now in combat, the catapult is not
      // part of the live world and therefore cannot receive an AI turn.
      return {
        liveBefore,
        shotsBefore,
        shotsAfter: catapult.firesRemaining,
        attackers: window.entities.filter(e => window.NorthwatchSiegeSpawn.isNorthwatchAttacker(e)).length,
        siegeActive: !!window.siegeState?.active,
      };
    });

    expect(result.liveBefore).toBe(false);
    expect(result.shotsAfter).toBe(result.shotsBefore);
    expect(result.attackers).toBe(0);
    expect(result.siegeActive).toBe(false);
  });
});
