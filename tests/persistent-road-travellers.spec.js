const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
  await createCharacter(page, { campaign: '2' });
  await page.waitForFunction(() =>
    window.PersistentRoadTravellers?.stats?.total === 12 &&
    window.RoadTravellerPersistence?.installed === true,
    null, { timeout: 12000 });
}

test.describe('persistent road travellers', () => {
  test.beforeEach(async ({ page }) => ready(page));

  test('seeds twelve named travellers sparsely across three human-kingdom routes', async ({ page }) => {
    const result = await page.evaluate(() => {
      const road = window.PersistentRoadTravellers;
      const rows = [...road.records.values()];
      const byRoute = {};
      rows.forEach(r => byRoute[r.routeId] = (byRoute[r.routeId] || 0) + 1);
      return {
        stats: road.stats,
        byRoute,
        names: rows.map(r => r.name),
        races: rows.map(r => r.race),
        travelling: rows.filter(r => !!window.NPCRoutineScheduler.getState(r.id)?.travel).length,
        liveEntities: window.entities.filter(e => e.isRoadTraveller).length,
      };
    });

    expect(result.stats.total).toBe(12);
    expect(result.byRoute).toEqual({ north: 4, east: 4, ore: 4 });
    expect(new Set(result.names).size).toBe(12);
    expect(result.races).not.toContain('goblin');
    expect(result.races).not.toContain('orc');
    expect(result.travelling).toBe(12);
    expect(result.liveEntities).toBeLessThanOrEqual(6);
  });

  test('off-screen trip progress advances without requiring live NPC entities', async ({ page }) => {
    const result = await page.evaluate(() => {
      const road = window.PersistentRoadTravellers;
      const record = [...road.records.values()][0];
      const state = window.NPCRoutineScheduler.getState(record.id);
      const before = window.NPCRoutineScheduler.getAbstractLocation(record.id, window.worldSeconds);
      const later = window.NPCRoutineScheduler.getAbstractLocation(record.id, window.worldSeconds + 1800);
      return {
        hasTravel: !!state?.travel,
        beforeProgress: before?.progress,
        laterProgress: later?.progress,
        live: road.materialised.has(record.id),
      };
    });

    expect(result.hasTravel).toBe(true);
    expect(result.laterProgress).toBeGreaterThan(result.beforeProgress);
  });

  test('a nearby traveller materialises as a real road-walking NPC and dematerialises off-screen', async ({ page }) => {
    const result = await page.evaluate(() => {
      const road = window.PersistentRoadTravellers;
      const record = [...road.records.values()][0];
      const loc = window.NPCRoutineScheduler.getAbstractLocation(record.id, window.worldSeconds)?.hex;
      const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
      player.hex = { q: Math.round(loc.q), r: Math.round(loc.r) };
      player.visualQ = player.hex.q; player.visualR = player.hex.r;
      road.pulse();
      const entity = road.materialised.get(record.id);
      const nearby = entity ? {
        exists:true,
        isNPC:entity.isNPC,
        neutral:entity.side === 'neutral',
        traveller:entity.isRoadTraveller,
        prefersRoads:entity.prefersRoads,
        hasDestination:!!entity.destination,
        role:entity.occupation,
      } : { exists:false };

      player.hex = { q:5000, r:5000 };
      player.visualQ = 5000; player.visualR = 5000;
      window.isInCombat = false;
      road.pulse();
      return {
        nearby,
        afterFar:road.materialised.has(record.id),
        liveCount:window.entities.filter(e => e.isRoadTraveller).length,
        maxLive:road.stats.maxLive,
      };
    });

    expect(result.nearby).toMatchObject({ exists:true, isNPC:true, neutral:true, traveller:true, prefersRoads:true, hasDestination:true });
    expect(result.nearby.role).toBeTruthy();
    expect(result.afterFar).toBe(false);
    expect(result.liveCount).toBeLessThanOrEqual(result.maxLive);
  });

  test('a traveller death survives traveller-state export and restore', async ({ page }) => {
    const result = await page.evaluate(() => {
      const road = window.PersistentRoadTravellers;
      const persistence = window.RoadTravellerPersistence;
      const record = [...road.records.values()][0];
      const entity = road.materialise(record);
      if (!entity) return { missing:true };
      entity.alive = false;
      road.syncDeaths();
      const snapshot = persistence.exportState();
      const saved = snapshot.records.find(r => r.id === record.id);
      persistence.importState(snapshot);
      const restored = road.records.get(record.id);
      return {
        missing:false,
        savedAlive:saved?.alive,
        restoredAlive:restored?.alive,
        schedulerState:window.NPCRoutineScheduler.getState(record.id),
        liveEntity:window.entities.some(e => e.isRoadTraveller && e.id === record.id),
      };
    });

    expect(result.missing).toBe(false);
    expect(result.savedAlive).toBe(false);
    expect(result.restoredAlive).toBe(false);
    expect(result.schedulerState).toBeNull();
    expect(result.liveEntity).toBe(false);
  });
});
