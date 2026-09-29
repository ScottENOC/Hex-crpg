const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('prepared traps and hybrid tamper wards', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() => !!window.PreparedTrapSystem && !!window.skills?.trap_setting && !!window.skills?.arcana);
  });

  test('legacy combat trap skill becomes three-rank Rogue trapcraft and Arcana exists in Wizard', async ({ page }) => {
    const meta = await page.evaluate(() => ({
      traps: {
        name: window.skills.trap_setting.name,
        tree: window.skills.trap_setting.tree,
        maxRanks: window.skills.trap_setting.maxRanks,
        active: window.skills.trap_setting.active,
      },
      arcana: {
        name: window.skills.arcana.name,
        tree: window.skills.arcana.tree,
        maxRanks: window.skills.arcana.maxRanks,
      },
    }));
    expect(meta.traps).toEqual({ name: 'Traps', tree: 'rogue', maxRanks: 3, active: false });
    expect(meta.arcana).toEqual({ name: 'Arcana', tree: 'wizard', maxRanks: 3 });
  });

  test('trap preparation consumes harvested materials and advances world time, but is blocked in combat', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sys = window.PreparedTrapSystem;
      const actor = window.player;
      actor.skills.trap_setting = 1;
      actor.inventory.push('wood', 'wood', 'wood', 'wood');
      const beforeWood = actor.inventory.filter(x => x === 'wood').length;
      const beforeTime = window.worldSeconds;
      const hex = window.getNeighbors(actor.hex.q, actor.hex.r).find(h => !window.tileObjects[`${h.q},${h.r}`] && !(window.entities || []).some(e => e.alive && e.hex?.q === h.q && e.hex?.r === h.r));
      const built = sys.buildTrap(actor, hex, 'snare', false);
      const afterWood = actor.inventory.filter(x => x === 'wood').length;
      const trap = window.tileObjects[`${hex.q},${hex.r}`];
      const timeDelta = window.worldSeconds - beforeTime;
      delete window.tileObjects[`${hex.q},${hex.r}`];

      window.isInCombat = true;
      const combatHex = window.getNeighbors(actor.hex.q, actor.hex.r).find(h => !window.tileObjects[`${h.q},${h.r}`] && !(window.entities || []).some(e => e.alive && e.hex?.q === h.q && e.hex?.r === h.r));
      const beforeCombatWood = actor.inventory.filter(x => x === 'wood').length;
      const blocked = sys.buildTrap(actor, combatHex, 'snare', false);
      const afterCombatWood = actor.inventory.filter(x => x === 'wood').length;
      window.isInCombat = false;
      return { built, beforeWood, afterWood, timeDelta, trap, blocked, beforeCombatWood, afterCombatWood };
    });
    expect(result.built.ok).toBe(true);
    expect(result.beforeWood - result.afterWood).toBe(2);
    expect(result.timeDelta).toBe(5 * 60);
    expect(result.trap.type).toBe('prepared_trap');
    expect(result.trap.armed).toBe(true);
    expect(result.blocked.ok).toBe(false);
    expect(result.blocked.reason).toContain('during combat');
    expect(result.beforeCombatWood).toBe(result.afterCombatWood);
  });

  test('a Rogue/Wizard can build a material-and-mana hybrid trap with a separate tamper ward', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sys = window.PreparedTrapSystem;
      const actor = window.player;
      actor.skills.trap_setting = 3;
      actor.skills.arcana = 3;
      actor.currentMana = 30;
      actor.inventory.push('wood', 'ore_iron', 'ore_iron', 'stone');
      const before = {
        wood: actor.inventory.filter(x => x === 'wood').length,
        iron: actor.inventory.filter(x => x === 'ore_iron').length,
        stone: actor.inventory.filter(x => x === 'stone').length,
        mana: actor.currentMana,
        time: window.worldSeconds,
      };
      const hex = window.getNeighbors(actor.hex.q, actor.hex.r).find(h => !window.tileObjects[`${h.q},${h.r}`] && !(window.entities || []).some(e => e.alive && e.hex?.q === h.q && e.hex?.r === h.r));
      const built = sys.buildTrap(actor, hex, 'pressure_spikes', true);
      const trap = window.tileObjects[`${hex.q},${hex.r}`];
      const after = {
        wood: actor.inventory.filter(x => x === 'wood').length,
        iron: actor.inventory.filter(x => x === 'ore_iron').length,
        stone: actor.inventory.filter(x => x === 'stone').length,
        mana: actor.currentMana,
        time: window.worldSeconds,
      };
      delete window.tileObjects[`${hex.q},${hex.r}`];
      return { built, trap, before, after };
    });
    expect(result.built.ok).toBe(true);
    expect(result.trap.recipeId).toBe('pressure_spikes');
    expect(result.trap.ward.type).toBe('tamper_rune');
    expect(result.trap.ward.armed).toBe(true);
    expect(result.before.wood - result.after.wood).toBe(1);
    expect(result.before.iron - result.after.iron).toBe(2);
    expect(result.before.stone - result.after.stone).toBe(1);
    expect(result.before.mana - result.after.mana).toBe(8);
    expect(result.after.time - result.before.time).toBe(20 * 60);
  });

  test('a mundane Rogue touching a hybrid disarm mechanism triggers the hidden rune before the physical trap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sys = window.PreparedTrapSystem;
      const actor = window.player;
      actor.skills.trap_setting = 3;
      actor.skills.arcana = 0;
      actor.hp = Math.max(actor.hp, 30);
      const hex = window.getNeighbors(actor.hex.q, actor.hex.r)[0];
      window.tileObjects[`${hex.q},${hex.r}`] = {
        type: 'prepared_trap', recipeId: 'pressure_spikes', name: 'Pressure-Plate Spikes',
        armed: true, spent: false, ownerSide: 'enemy', discoveredByPlayer: true,
        concealment: 65, disarmDifficulty: 70, detectionAttempts: {},
        ward: { type: 'tamper_rune', armed: true, discoveredByPlayer: false, difficulty: 55, damage: 7 }
      };
      const hpBefore = actor.hp;
      const disarm = sys.disarmTrap(actor, hex.q, hex.r);
      const trapAfter = window.tileObjects[`${hex.q},${hex.r}`];
      const hpAfter = actor.hp;
      delete window.tileObjects[`${hex.q},${hex.r}`];
      return { disarm, hpBefore, hpAfter, trapAfter };
    });
    expect(result.disarm.ok).toBe(false);
    expect(result.disarm.wardTriggered).toBe(true);
    expect(result.hpBefore - result.hpAfter).toBe(7);
    expect(result.trapAfter.ward.armed).toBe(false);
    expect(result.trapAfter.armed).toBe(true);
    expect(result.trapAfter.spent).toBe(false);
  });

  test('Arcana can suppress a known ward and Traps can then dismantle the underlying mechanism', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sys = window.PreparedTrapSystem;
      const actor = window.player;
      actor.skills.trap_setting = 3;
      actor.skills.arcana = 3;
      const hex = window.getNeighbors(actor.hex.q, actor.hex.r)[0];
      window.tileObjects[`${hex.q},${hex.r}`] = {
        type: 'prepared_trap', recipeId: 'pressure_spikes', name: 'Pressure-Plate Spikes',
        armed: true, spent: false, ownerSide: 'enemy', discoveredByPlayer: true,
        concealment: 65, disarmDifficulty: 70, detectionAttempts: {},
        ward: { type: 'tamper_rune', armed: true, discoveredByPlayer: true, difficulty: 70, damage: 11 }
      };
      const suppressed = sys.suppressWard(actor, hex.q, hex.r);
      const afterSuppress = JSON.parse(JSON.stringify(window.tileObjects[`${hex.q},${hex.r}`]));
      const disarmed = sys.disarmTrap(actor, hex.q, hex.r);
      const afterDisarm = JSON.parse(JSON.stringify(window.tileObjects[`${hex.q},${hex.r}`]));
      delete window.tileObjects[`${hex.q},${hex.r}`];
      return { suppressed, afterSuppress, disarmed, afterDisarm };
    });
    expect(result.suppressed.ok).toBe(true);
    expect(result.afterSuppress.ward.suppressed).toBe(true);
    expect(result.afterSuppress.armed).toBe(true);
    expect(result.disarmed.ok).toBe(true);
    expect(result.afterDisarm.disarmed).toBe(true);
    expect(result.afterDisarm.armed).toBe(false);
    expect(result.afterDisarm.spent).toBe(true);
  });

  test('Keen Perception contributes to trap finding and prepared traps trigger when a non-owner steps on them', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sys = window.PreparedTrapSystem;
      const actor = window.player;
      actor.skills.keen_perception = 0;
      const basePerception = sys.perceptionScore(actor);
      actor.skills.keen_perception = 3;
      const keenPerception = sys.perceptionScore(actor);
      const hex = window.getNeighbors(actor.hex.q, actor.hex.r)[0];
      window.tileObjects[`${hex.q},${hex.r}`] = {
        type: 'prepared_trap', recipeId: 'deadfall', name: 'Deadfall',
        armed: true, spent: false, ownerSide: 'enemy', discoveredByPlayer: false,
        concealment: 1, disarmDifficulty: 58, detectionAttempts: {}, ward: null
      };
      const found = sys.attemptDetectTrap(actor, hex.q, hex.r);
      const discovered = window.tileObjects[`${hex.q},${hex.r}`].discoveredByPlayer;

      const target = new window.Entity('Trap Target', 'red', { q: hex.q, r: hex.r }, 10);
      target.side = 'enemy';
      target.alive = true;
      target.hp = 20;
      target.maxHp = 20;
      target.timePoints = 10;
      window.tileObjects[`${hex.q},${hex.r}`] = {
        type: 'prepared_trap', recipeId: 'pressure_spikes', name: 'Pressure-Plate Spikes',
        armed: true, spent: false, ownerSide: 'player', discoveredByPlayer: true,
        concealment: 65, disarmDifficulty: 70, detectionAttempts: {}, ward: null
      };
      const triggered = sys.triggerTrap(hex.q, hex.r, target, 'step');
      const spent = window.tileObjects[`${hex.q},${hex.r}`].spent;
      const hp = target.hp;
      const tp = target.timePoints;
      delete window.tileObjects[`${hex.q},${hex.r}`];
      return { basePerception, keenPerception, found, discovered, triggered, spent, hp, tp };
    });
    expect(result.keenPerception - result.basePerception).toBe(30);
    expect(result.found).toBe(true);
    expect(result.discovered).toBe(true);
    expect(result.triggered).toBe(true);
    expect(result.spent).toBe(true);
    expect(result.hp).toBe(12);
    expect(result.tp).toBe(7);
  });

  test('Prepare Trap is exploration UI, not an in-combat action', async ({ page }) => {
    const result = await page.evaluate(() => {
      window.player.skills.trap_setting = 1;
      window.isInCombat = false;
      window.PreparedTrapSystem.refreshTrapButtons();
      const outside = !!document.getElementById('prepare-trap-btn');
      window.isInCombat = true;
      window.PreparedTrapSystem.refreshTrapButtons();
      const inside = !!document.getElementById('prepare-trap-btn');
      window.isInCombat = false;
      return { outside, inside };
    });
    expect(result.outside).toBe(true);
    expect(result.inside).toBe(false);
  });
});
