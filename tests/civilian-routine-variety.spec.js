const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

function isLiveEvent(sched, e) {
  return e.generation === sched.getState(e.npcId)?.eventGeneration;
}

test.describe('sparse generated civilian routine variety', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() =>
      !!window.GeneratedCivilianPopulation &&
      !!window.CivilianRoutineVariety?.stats?.installed &&
      !!window.NPCRoutineScheduler
    );
  });

  test('1,000 civilians have one live daily planner each, spread over roughly two hours', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex={q:5000,r:5000}; });
      pop.ensurePopulation(1000);
      routines.ensurePlanners();
      const events = sched.exportState().events.filter(e =>
        e.type === routines.EVENT_TYPES.PLAN_EVENT &&
        String(e.npcId).startsWith('generated-civilian:') &&
        e.generation === sched.getState(e.npcId)?.eventGeneration
      );
      const uniqueIds = new Set(events.map(e => String(e.npcId)));
      const tod = events.map(e => ((e.at % 86400) + 86400) % 86400).sort((a,b)=>a-b);
      return { count:events.length, unique:uniqueIds.size, min:tod[0], max:tod[tod.length-1], population:pop.records.size };
    });
    expect(result.population).toBe(1000);
    expect(result.unique).toBe(1000);
    expect(result.count).toBe(1000);
    expect(result.min).toBeGreaterThanOrEqual(4*3600);
    expect(result.max).toBeLessThanOrEqual(6*3600);
    expect(result.max-result.min).toBeGreaterThan(3600);
  });

  test('a matching market-day planner schedules a later visit without materialising the civilian', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      window.entities.filter(e => e.side === 'player').forEach(p => { p.hex={q:5000,r:5000}; p.visualQ=5000; p.visualR=5000; });
      const record = [...pop.records.values()].find(r => routines.routineTraits(r).marketRegular);
      // The page may have already materialised this civilian during bootstrap
      // before the player is moved off-screen. This test is specifically about
      // the abstract/off-screen path, so make that precondition explicit.
      pop.dematerialise(record.id, { force:true });
      const traits = routines.routineTraits(record);
      const day = traits.marketDay;
      window.worldSeconds = day*86400 + 3*3600;
      const state = sched.getState(record.id);
      sched.clearNpcEvents(record.id);
      state.metadata.routineVarietyPlannerAt = null;
      routines.ensurePlanners(window.worldSeconds);
      const planner = sched.exportState().events.find(e =>
        e.npcId === record.id && e.type === routines.EVENT_TYPES.PLAN_EVENT && e.generation === sched.getState(record.id).eventGeneration
      );
      // The normal scheduler budget is intentionally small, but this synthetic
      // test can have ~180 same-morning planners already queued before the
      // selected person's event. Drain all due fixture work so the assertion is
      // about planner behaviour rather than heap ordering under the live budget.
      sched.processDueEvents(planner.at, { maxEvents: 2048 });
      const marketVisit = sched.exportState().events.find(e =>
        e.npcId === record.id && e.type === routines.EVENT_TYPES.VISIT_EVENT &&
        e.payload?.kind === 'market' && e.generation === sched.getState(record.id).eventGeneration
      );
      return { plannerAt:planner.at, visitAt:marketVisit?.at, materialised:pop.materialised.has(record.id) };
    });
    expect(result.visitAt).toBeGreaterThan(result.plannerAt);
    expect(result.materialised).toBe(false);
  });

  test('a special visit gives a visible civilian a road destination, then stays abstract once off-screen', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const routines = window.CivilianRoutineVariety;
      const sched = window.NPCRoutineScheduler;
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex={q:c.q,r:c.r}; player.visualQ=c.q; player.visualR=c.r;
      pop.pulseMaterialisation();
      const entity = [...pop.materialised.values()][0];
      const record = pop.records.get(entity.id);
      window.worldSeconds = 1000;
      routines.scheduleVisit(record,'market',1600,3000,'work','visible-test');
      const visit = sched.exportState().events.find(e => e.npcId===record.id && e.type===routines.EVENT_TYPES.VISIT_EVENT && e.payload?.kind==='market' && e.generation===sched.getState(record.id).eventGeneration);
      window.worldSeconds=visit.at;
      sched.processDueEvents(visit.at,{maxEvents:256});
      const visible={ destination:entity.destination, roads:entity.prefersRoads, level:sched.getState(record.id).simulationLevel };

      pop.dematerialise(record.id,{force:true});
      const later=visit.at+4000;
      window.worldSeconds=later;
      routines.scheduleVisit(record,'tavern',later+600,later+2400,'home','abstract-test');
      const next = sched.exportState().events.find(e => e.npcId===record.id && e.type===routines.EVENT_TYPES.VISIT_EVENT && e.payload?.kind==='tavern' && e.generation===sched.getState(record.id).eventGeneration);
      window.worldSeconds=next.at;
      sched.processDueEvents(next.at,{maxEvents:256});
      const state=sched.getState(record.id);
      return { visible, stillMaterialised:pop.materialised.has(record.id), abstractTravel:!!state.travel, abstractLevel:state.simulationLevel };
    });
    expect(result.visible.destination).toBeTruthy();
    expect(result.visible.roads).toBe(true);
    expect(result.visible.level).toBe('active');
    expect(result.stillMaterialised).toBe(false);
    expect(result.abstractTravel).toBe(true);
    expect(result.abstractLevel).toBe('abstract');
  });

  test('festival cohort events perform one bounded scan and schedule through the heap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop=window.GeneratedCivilianPopulation;
      const routines=window.CivilianRoutineVariety;
      window.entities.filter(e=>e.side==='player').forEach(p=>{p.hex={q:5000,r:5000};});
      pop.ensurePopulation(1000);
      const before=routines.stats;
      const event=routines.triggerSettlementEvent('festival',{id:'harvest-test',startAt:Number(window.worldSeconds||0)+3600,durationHours:3,participation:1});
      const after=routines.stats;
      return {before,event,after,materialised:pop.materialised.size};
    });
    expect(result.event.scanned).toBe(1000);
    expect(result.event.participants).toBe(1000);
    expect(result.after.settlementEventsTriggered-result.before.settlementEventsTriggered).toBe(1);
    expect(result.after.settlementRecordsScanned-result.before.settlementRecordsScanned).toBe(1000);
    expect(result.materialised).toBeLessThanOrEqual(40);
  });

  test('routine-variety planner events survive civilian save/load', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop=window.GeneratedCivilianPopulation;
      const routines=window.CivilianRoutineVariety;
      const sched=window.NPCRoutineScheduler;
      window.entities.filter(e=>e.side==='player').forEach(p=>{p.hex={q:5000,r:5000};});
      routines.ensurePlanners();
      const liveCount=()=>sched.exportState().events.filter(e=>
        e.type===routines.EVENT_TYPES.PLAN_EVENT && String(e.npcId).startsWith('generated-civilian:') && e.generation===sched.getState(e.npcId)?.eventGeneration
      ).length;
      const before=liveCount();
      const recordsBefore=pop.records.size;
      window.saveGame('routine_variety_save_test');
      window.loadGame('routine_variety_save_test');
      localStorage.removeItem('rpg_save_routine_variety_save_test');
      return {before,after:liveCount(),recordsBefore,recordsAfter:pop.records.size};
    });
    expect(result.recordsAfter).toBe(result.recordsBefore);
    expect(result.before).toBeGreaterThan(0);
    expect(result.after).toBe(result.before);
  });
});
