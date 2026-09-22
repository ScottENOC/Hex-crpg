const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('sparse generated civilian routine variety', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() =>
      !!window.GeneratedCivilianPopulation &&
      !!window.CivilianRoutineVariety?.stats?.installed &&
      !!window.NPCRoutineScheduler
    );
  });

  test('1,000 civilians get one daily planner each, spread over a two-hour window rather than one spike', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q:5000, r:5000 }; });
      pop.clearGeneratedPopulation();
      window.worldSeconds = 0;
      pop.ensurePopulation(1000);
      const pass = routines.ensurePlanners(0);
      const type = routines.EVENT_TYPES.PLAN_EVENT;
      const events = sched.exportState().events.filter(e => e.type === type && String(e.npcId).startsWith('generated-civilian:'));
      const times = events.map(e => e.at).sort((a,b) => a-b);
      return {
        pass,
        count: events.length,
        minAt: times[0],
        maxAt: times[times.length - 1],
        queueSize: sched.queueSize,
      };
    });

    expect(result.pass.scanned).toBe(1000);
    expect(result.count).toBe(1000);
    expect(result.minAt).toBeGreaterThanOrEqual(4 * 3600);
    expect(result.maxAt).toBeLessThanOrEqual(6 * 3600);
    expect(result.maxAt - result.minAt).toBeGreaterThan(60 * 60);
    expect(result.queueSize).toBeGreaterThanOrEqual(1000);
  });

  test('a matching market-day planner schedules a real later visit without materialising the civilian', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q:5000, r:5000 }; p.visualQ=5000; p.visualR=5000; });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(60);
      const record = [...pop.records.values()].find(r => routines.routineTraits(r).marketRegular);
      const traits = routines.routineTraits(record);
      // Choose the first non-negative day whose weekday is this person's stable market day.
      const day = traits.marketDay;
      window.worldSeconds = day * 86400 + 3 * 3600;
      // Reset this person's planner metadata/events generation, then schedule one
      // planner in the chosen day so the test doesn't depend on page-start time.
      const state = sched.getState(record.id);
      sched.clearNpcEvents(record.id);
      state.metadata.routineVarietyPlannerAt = null;
      routines.ensurePlanners(window.worldSeconds);
      const planner = sched.exportState().events
        .filter(e => e.npcId === record.id && e.type === routines.EVENT_TYPES.PLAN_EVENT && e.generation === sched.getState(record.id).eventGeneration)
        .sort((a,b) => a.at-b.at)[0];
      sched.processDueEvents(planner.at, { maxEvents: 10 });
      const afterEvents = sched.exportState().events.filter(e => e.npcId === record.id && e.generation === sched.getState(record.id).eventGeneration);
      const marketVisit = afterEvents.find(e => e.type === routines.EVENT_TYPES.VISIT_EVENT && e.payload?.kind === 'market');
      return {
        traits,
        plannerAt: planner.at,
        marketVisitAt: marketVisit?.at,
        materialised: pop.materialised.has(record.id),
        stateLevel: sched.getState(record.id)?.simulationLevel,
      };
    });

    expect(result.traits.marketRegular).toBe(true);
    expect(result.marketVisitAt).toBeGreaterThan(result.plannerAt);
    expect(result.materialised).toBe(false);
    expect(['dormant','abstract']).toContain(result.stateLevel);
  });

  test('a special visit gives a visible civilian a real road-following destination but remains abstract off-screen', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(180);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q:c.q, r:c.r }; player.visualQ=c.q; player.visualR=c.r;
      pop.pulseMaterialisation();
      const entity = [...pop.materialised.values()][0];
      const record = pop.records.get(entity.id);
      window.worldSeconds = 1000;
      routines.scheduleVisit(record, 'market', 1600, 3000, 'work', 'visible-test');
      const visit = sched.exportState().events
        .filter(e => e.npcId === record.id && e.type === routines.EVENT_TYPES.VISIT_EVENT && e.payload?.kind === 'market')
        .sort((a,b) => a.at-b.at)[0];
      window.worldSeconds = visit.at;
      sched.processDueEvents(visit.at, { maxEvents: 20 });
      const state = sched.getState(record.id);
      const visible = {
        destination: entity.destination,
        prefersRoads: entity.prefersRoads,
        travelTo: state.travel?.toHex,
        level: state.simulationLevel,
      };

      // Dematerialise the same persistent person and directly schedule another
      // visit. It should create abstract travel without producing a new Entity.
      pop.dematerialise(record.id, { force:true });
      const later = visit.at + 4000;
      window.worldSeconds = later;
      routines.scheduleVisit(record, 'tavern', later + 600, later + 2400, 'home', 'abstract-test');
      const nextVisit = sched.exportState().events
        .filter(e => e.npcId === record.id && e.type === routines.EVENT_TYPES.VISIT_EVENT && e.payload?.kind === 'tavern')
        .sort((a,b) => a.at-b.at)[0];
      window.worldSeconds = nextVisit.at;
      sched.processDueEvents(nextVisit.at, { maxEvents: 20 });
      const abstractState = sched.getState(record.id);
      return {
        visible,
        stillMaterialised: pop.materialised.has(record.id),
        abstractTravel: !!abstractState.travel,
        abstractLevel: abstractState.simulationLevel,
      };
    });

    expect(result.visible.destination).toBeTruthy();
    expect(result.visible.prefersRoads).toBe(true);
    expect(result.visible.travelTo).toBeTruthy();
    expect(result.visible.level).toBe('active');
    expect(result.stillMaterialised).toBe(false);
    expect(result.abstractTravel).toBe(true);
    expect(result.abstractLevel).toBe('abstract');
  });

  test('festival/funeral cohort events scan once when triggered and schedule participants through the heap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex={q:5000,r:5000}; });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(1000);
      const before = routines.stats;
      const event = routines.triggerSettlementEvent('festival', {
        id:'harvest-test', startAt:Number(window.worldSeconds || 0)+3600, durationHours:3, participation:1,
      });
      const after = routines.stats;
      return { before, event, after, materialised:pop.materialised.size };
    });

    expect(result.event.scanned).toBe(1000);
    expect(result.event.participants).toBe(1000);
    expect(result.after.settlementEventsTriggered - result.before.settlementEventsTriggered).toBe(1);
    expect(result.after.settlementRecordsScanned - result.before.settlementRecordsScanned).toBe(1000);
    expect(result.materialised).toBe(0);
  });

  test('routine-variety heap events survive the civilian save/load snapshot', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex={q:5000,r:5000}; });
      pop.clearGeneratedPopulation();
      window.worldSeconds = 0;
      pop.ensurePopulation(80);
      routines.ensurePlanners(0);
      const before = sched.exportState().events.filter(e => e.type === routines.EVENT_TYPES.PLAN_EVENT && String(e.npcId).startsWith('generated-civilian:')).length;
      window.saveGame('routine_variety_save_test');
      pop.clearGeneratedPopulation();
      window.loadGame('routine_variety_save_test');
      localStorage.removeItem('rpg_save_routine_variety_save_test');
      const after = sched.exportState().events.filter(e => e.type === routines.EVENT_TYPES.PLAN_EVENT && String(e.npcId).startsWith('generated-civilian:') && e.generation === sched.getState(e.npcId)?.eventGeneration).length;
      return { before, after, records:pop.records.size };
    });

    expect(result.records).toBe(80);
    expect(result.before).toBeGreaterThan(0);
    expect(result.after).toBe(result.before);
  });
});
