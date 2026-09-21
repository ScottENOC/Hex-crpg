const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('event-driven named NPC schedules', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page);
    await page.waitForFunction(() => window.EventDrivenNamedNpcSchedules?.stats?.installed);
    await page.evaluate(() => window.EventDrivenNamedNpcSchedules.refreshRegistry(true));
  });

  test('repeated game-loop schedule updates do not rebuild the NPC registry', async ({ page }) => {
    const result = await page.evaluate(() => {
      const bridge = window.EventDrivenNamedNpcSchedules;
      const before = bridge.stats;
      for (let i = 0; i < 250; i++) window.updateNpcSchedules();
      const after = bridge.stats;
      return {
        installedFlag: !!window.updateNpcSchedules.__eventDrivenNamedSchedules,
        before,
        after,
        scheduledNames: Object.keys(window.getNpcSchedules()).length,
      };
    });

    expect(result.installedFlag).toBe(true);
    expect(result.scheduledNames).toBeGreaterThan(0);
    expect(result.after.bindings).toBeGreaterThan(0);
    expect(result.after.registryBuilds).toBe(result.before.registryBuilds);
  });

  test("Old Mac collapses directly to the pasture when the transition is unobserved", async ({ page }) => {
    const result = await page.evaluate(() => {
      const mac = window.entities.find(e => e.name === 'Old Mac');
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      const farmHome = window.campaign2FarmHouseCenter;
      const pasture = window.campaign2FarmPastureCenter;
      if (!mac || !player || !farmHome || !pasture) return { missing: true };

      mac.hex = { q: farmHome.q + 1, r: farmHome.r };
      mac.visualQ = mac.hex.q;
      mac.visualR = mac.hex.r;
      mac.destination = null;
      player.hex = { q: 5000, r: 5000 };
      player.visualQ = player.hex.q;
      player.visualR = player.hex.r;

      const changed = window.EventDrivenNamedNpcSchedules.transitionNow('Old Mac', 8 * 3600);
      const state = window.NPCRoutineScheduler.getState(mac.id);
      return {
        missing: false,
        changed,
        hex: mac.hex,
        destination: mac.destination,
        pasture,
        level: state?.simulationLevel,
      };
    });

    expect(result.missing).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.hex).toEqual(result.pasture);
    expect(result.destination).toBeNull();
    expect(result.level).toBe('dormant');
  });

  test("Old Mac visibly walks toward the pasture when the party is nearby", async ({ page }) => {
    const result = await page.evaluate(() => {
      const mac = window.entities.find(e => e.name === 'Old Mac');
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      const farmHome = window.campaign2FarmHouseCenter;
      const pasture = window.campaign2FarmPastureCenter;
      if (!mac || !player || !farmHome || !pasture) return { missing: true };

      mac.hex = { q: farmHome.q + 1, r: farmHome.r };
      mac.visualQ = mac.hex.q;
      mac.visualR = mac.hex.r;
      mac.destination = null;
      player.hex = { q: mac.hex.q + 1, r: mac.hex.r };
      player.visualQ = player.hex.q;
      player.visualR = player.hex.r;

      const changed = window.EventDrivenNamedNpcSchedules.transitionNow('Old Mac', 8 * 3600);
      const state = window.NPCRoutineScheduler.getState(mac.id);
      return {
        missing: false,
        changed,
        hex: mac.hex,
        destination: mac.destination,
        pasture,
        prefersRoads: mac.prefersRoads,
        level: state?.simulationLevel,
        reason: state?.activeReason,
      };
    });

    expect(result.missing).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.hex).not.toEqual(result.pasture);
    expect(result.destination).toEqual(result.pasture);
    expect(result.prefersRoads).toBe(true);
    expect(result.level).toBe('active');
    expect(result.reason).toBe('scheduled-visible-travel');
  });

  test('shop hours remain timetable-driven rather than position-driven', async ({ page }) => {
    const result = await page.evaluate(() => {
      const original = window.worldSeconds;
      // Match the established shop-hours regression: Wick is closed at 03:00
      // and open at 14:00. This test is about preserving those timetable
      // semantics after schedule movement becomes event-driven, not inventing
      // a new closing hour.
      window.worldSeconds = 14 * 3600;
      const open = window.isShopOpen('Wick Hallow');
      window.worldSeconds = 3 * 3600;
      const closed = window.isShopOpen('Wick Hallow');
      window.worldSeconds = original;
      return { open, closed };
    });

    expect(result.open).toBe(true);
    expect(result.closed).toBe(false);
  });
});
