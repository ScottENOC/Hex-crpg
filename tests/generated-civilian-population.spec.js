const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('generated civilian population', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() => !!window.GeneratedCivilianPopulation && !!window.NPCRoutineScheduler);
  });

  test('civilian identities and appearance are deterministic persistent records', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q: 5000, r: 5000 }; });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(200);
      const firstA = structuredClone([...pop.records.values()][0]);
      pop.ensurePopulation(200);
      const firstB = structuredClone([...pop.records.values()][0]);
      return { firstA, firstB, stats: pop.stats };
    });

    expect(result.stats.population).toBe(200);
    expect(result.firstA).toEqual(result.firstB);
    expect(result.firstA.name).toBeTruthy();
    expect(result.firstA.occupation).toBeTruthy();
    expect(result.firstA.appearance.hair).toBeTruthy();
    expect(result.firstA.appearance.build).toBeTruthy();
    expect(result.firstA.nodes.home.hex).toBeTruthy();
    expect(result.firstA.nodes.work.hex).toBeTruthy();
  });

  test('1,000 persistent civilians cost no record scan or live entities while Hollowmere is off-screen', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      window.entities.filter(e => e.side === 'player').forEach(p => {
        p.hex = { q: 5000, r: 5000 };
        p.visualQ = 5000;
        p.visualR = 5000;
      });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(1000);
      const pulse = pop.pulseMaterialisation();
      return {
        pulse,
        stats: pop.stats,
        liveGeneratedEntities: window.entities.filter(e => e.isGeneratedCivilian).length,
      };
    });

    expect(result.stats.population).toBe(1000);
    expect(result.pulse.active).toBe(false);
    expect(result.pulse.scanned).toBe(0);
    expect(result.stats.materialised).toBe(0);
    expect(result.liveGeneratedEntities).toBe(0);
  });

  test('nearby civilians materialise as normal neutral entities but stay under the hard cap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(200);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q: c.q, r: c.r };
      player.visualQ = c.q;
      player.visualR = c.r;
      const pulse = pop.pulseMaterialisation();
      const civilians = window.entities.filter(e => e.isGeneratedCivilian);
      return {
        pulse,
        stats: pop.stats,
        count: civilians.length,
        sample: civilians[0] ? {
          neutral: civilians[0].side === 'neutral',
          isNPC: civilians[0].isNPC,
          occupation: civilians[0].occupation,
          race: civilians[0].race,
          gender: civilians[0].gender,
          seeded: !!civilians[0].generatedCivilianSeed,
        } : null,
      };
    });

    expect(result.pulse.active).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(result.count).toBeLessThanOrEqual(40);
    expect(result.stats.materialised).toBe(result.count);
    expect(result.sample).toMatchObject({ neutral: true, isNPC: true, seeded: true });
    expect(result.sample.occupation).toBeTruthy();
    expect(result.sample.race).toBeTruthy();
    expect(result.sample.gender).toBeTruthy();
  });

  test('daily transition is a sparse event that starts abstract travel without materialising the civilian', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q: 5000, r: 5000 }; });
      pop.clearGeneratedPopulation();
      window.worldSeconds = 0;
      pop.ensurePopulation(1);
      const record = [...pop.records.values()][0];
      const beforeState = window.NPCRoutineScheduler.getState(record.id);
      const before = { level: beforeState.simulationLevel, travel: !!beforeState.travel };
      const processed = window.NPCRoutineScheduler.processDueEvents(10 * 3600, { maxEvents: 1 });
      const after = window.NPCRoutineScheduler.getState(record.id);
      return {
        before,
        processed: processed.processed,
        after: { level: after.simulationLevel, travel: !!after.travel, activity: after.activity },
        liveEntity: window.entities.some(e => e.isGeneratedCivilian),
      };
    });

    expect(result.before.level).toBe('dormant');
    expect(result.before.travel).toBe(false);
    expect(result.processed).toBe(1);
    expect(result.after.level).toBe('abstract');
    expect(result.after.travel).toBe(true);
    expect(result.after.activity).toBe('travelling');
    expect(result.liveEntity).toBe(false);
  });

  test('death of a materialised civilian persists when the entity is dematerialised', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(80);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q: c.q, r: c.r };
      pop.pulseMaterialisation();
      const victim = window.entities.find(e => e.isGeneratedCivilian);
      if (!victim) return { missing: true };
      victim.alive = false;
      const id = victim.id;
      window.isInCombat = false;
      pop.dematerialise(id, { force: true });
      return {
        missing: false,
        aliveInRecord: pop.records.get(id)?.alive,
        stillAnEntity: window.entities.some(e => e.id === id),
        schedulerState: window.NPCRoutineScheduler.getState(id),
      };
    });

    expect(result.missing).toBe(false);
    expect(result.aliveInRecord).toBe(false);
    expect(result.stillAnEntity).toBe(false);
    expect(result.schedulerState).toBeNull();
  });
});
