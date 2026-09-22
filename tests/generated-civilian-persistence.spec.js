const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('generated civilian persistence', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() =>
      !!window.GeneratedCivilianPopulation &&
      !!window.GeneratedCivilianPersistence?.installed &&
      !!window.NPCRoutineScheduler
    );
  });

  test('save stores a versioned civilian snapshot but excludes transient materialised entities', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(220);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q: c.q, r: c.r };
      player.visualQ = c.q;
      player.visualR = c.r;
      pop.pulseMaterialisation();
      const liveBefore = window.entities.filter(e => e.isGeneratedCivilian).length;

      window.saveGame('civilian_snapshot_test');
      const saved = JSON.parse(localStorage.getItem('rpg_save_civilian_snapshot_test'));
      localStorage.removeItem('rpg_save_civilian_snapshot_test');
      return {
        liveBefore,
        snapshotVersion: saved.generatedCivilianState?.version,
        savedRecords: saved.generatedCivilianState?.records?.length,
        savedSchedulerStates: saved.generatedCivilianState?.scheduler?.states?.length,
        transientEntitiesInCoreSave: saved.entities.filter(e => e.isGeneratedCivilian || String(e.id || '').startsWith('generated-civilian:')).length,
      };
    });

    expect(result.liveBefore).toBeGreaterThan(0);
    expect(result.liveBefore).toBeLessThanOrEqual(40);
    expect(result.snapshotVersion).toBe(1);
    expect(result.savedRecords).toBe(220);
    expect(result.savedSchedulerStates).toBeGreaterThan(0);
    expect(result.transientEntitiesInCoreSave).toBe(0);
  });

  test('dead civilians and stable identity/appearance records survive a save-load round trip', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      window.entities.filter(e => e.side === 'player').forEach(p => {
        p.hex = { q: 5000, r: 5000 }; p.visualQ = 5000; p.visualR = 5000;
      });
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(180);
      const records = [...pop.records.values()];
      const victim = records[7];
      const survivor = records[12];
      const expected = {
        victimId: victim.id,
        survivorId: survivor.id,
        survivorName: survivor.name,
        survivorRace: survivor.race,
        survivorGender: survivor.gender,
        survivorOccupation: survivor.occupation,
        survivorAppearance: structuredClone(survivor.appearance),
      };
      victim.alive = false;
      window.NPCRoutineScheduler.unregisterNpc(victim.id);

      window.saveGame('civilian_identity_test');

      // Corrupt runtime state after saving. loadGame must restore the save,
      // not merely leave these post-save mutations in place.
      victim.alive = true;
      survivor.name = 'WRONG NAME';
      survivor.race = 'orc';
      survivor.appearance.hair = 'bald';

      window.loadGame('civilian_identity_test');
      localStorage.removeItem('rpg_save_civilian_identity_test');
      const restoredVictim = pop.records.get(expected.victimId);
      const restoredSurvivor = pop.records.get(expected.survivorId);
      return {
        expected,
        victimAlive: restoredVictim?.alive,
        victimSchedulerState: window.NPCRoutineScheduler.getState(expected.victimId),
        survivor: restoredSurvivor && {
          name: restoredSurvivor.name,
          race: restoredSurvivor.race,
          gender: restoredSurvivor.gender,
          occupation: restoredSurvivor.occupation,
          appearance: restoredSurvivor.appearance,
        },
      };
    });

    expect(result.victimAlive).toBe(false);
    expect(result.victimSchedulerState).toBeNull();
    expect(result.survivor).toEqual({
      name: result.expected.survivorName,
      race: result.expected.survivorRace,
      gender: result.expected.survivorGender,
      occupation: result.expected.survivorOccupation,
      appearance: result.expected.survivorAppearance,
    });
  });

  test('abstract commute state and progress resume at the saved world time', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const sched = window.NPCRoutineScheduler;
      window.entities.filter(e => e.side === 'player').forEach(p => {
        p.hex = { q: 5000, r: 5000 }; p.visualQ = 5000; p.visualR = 5000;
      });
      pop.clearGeneratedPopulation();
      window.worldSeconds = 0;
      pop.ensurePopulation(1);
      const record = [...pop.records.values()][0];
      sched.processDueEvents(10 * 3600, { maxEvents: 1 });
      const travelling = sched.getState(record.id);
      const midpoint = (travelling.travel.departedAt + travelling.travel.arrivesAt) / 2;
      window.worldSeconds = midpoint;
      const before = sched.getAbstractLocation(record.id, midpoint);
      const beforeTravel = structuredClone(travelling.travel);

      window.saveGame('civilian_travel_test');
      pop.clearGeneratedPopulation();
      window.worldSeconds = 999999;
      window.loadGame('civilian_travel_test');
      localStorage.removeItem('rpg_save_civilian_travel_test');

      const afterState = sched.getState(record.id);
      const after = sched.getAbstractLocation(record.id, window.worldSeconds);
      return {
        restoredWorldSeconds: window.worldSeconds,
        midpoint,
        beforeProgress: before.progress,
        afterProgress: after?.progress,
        beforeTravel,
        afterTravel: afterState?.travel,
        level: afterState?.simulationLevel,
      };
    });

    expect(result.restoredWorldSeconds).toBeCloseTo(result.midpoint, 6);
    expect(result.beforeProgress).toBeCloseTo(0.5, 6);
    expect(result.afterProgress).toBeCloseTo(result.beforeProgress, 6);
    expect(result.afterTravel.departedAt).toBe(result.beforeTravel.departedAt);
    expect(result.afterTravel.arrivesAt).toBe(result.beforeTravel.arrivesAt);
    expect(result.afterTravel.toNode).toBe(result.beforeTravel.toNode);
    expect(result.level).toBe('abstract');
  });

  test('old saves with no civilian snapshot load safely and rebuild one clean default population', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(180);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q: c.q, r: c.r };
      player.visualQ = c.q; player.visualR = c.r;
      pop.pulseMaterialisation();

      window.saveGame('civilian_legacy_test');
      const key = 'rpg_save_civilian_legacy_test';
      const old = JSON.parse(localStorage.getItem(key));
      delete old.generatedCivilianState;
      // Simulate the exact pre-adapter save shape: generated LOD entities were
      // ordinary entries in the core entity array.
      for (const e of window.entities.filter(e => e.isGeneratedCivilian).slice(0, 3)) {
        old.entities.push(window.serializeEntity(e));
      }
      localStorage.setItem(key, JSON.stringify(old));

      window.loadGame('civilian_legacy_test');
      localStorage.removeItem(key);
      const generatedEntities = window.entities.filter(e => e.isGeneratedCivilian || String(e.id || '').startsWith('generated-civilian:'));
      const ids = generatedEntities.map(e => String(e.id));
      return {
        records: pop.records.size,
        materialised: pop.materialised.size,
        generatedEntities: generatedEntities.length,
        uniqueGeneratedIds: new Set(ids).size,
      };
    });

    expect(result.records).toBe(180);
    expect(result.materialised).toBeLessThanOrEqual(40);
    expect(result.generatedEntities).toBe(result.materialised);
    expect(result.uniqueGeneratedIds).toBe(result.generatedEntities);
  });

  test('exported save codes carry civilian state and omit transient civilian entities', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      pop.clearGeneratedPopulation();
      pop.ensurePopulation(180);
      const c = window.campaign2Landmarks.crossroads;
      const player = window.entities.find(e => e.side === 'player' && !e.rider);
      player.hex = { q: c.q, r: c.r }; player.visualQ = c.q; player.visualR = c.r;
      pop.pulseMaterialisation();
      const code = window.exportSaveCode();
      const json = decodeURIComponent(escape(atob(code)));
      const saved = JSON.parse(json);
      return {
        version: saved.generatedCivilianState?.version,
        records: saved.generatedCivilianState?.records?.length,
        transient: saved.entities.filter(e => e.isGeneratedCivilian || String(e.id || '').startsWith('generated-civilian:')).length,
      };
    });

    expect(result.version).toBe(1);
    expect(result.records).toBe(180);
    expect(result.transient).toBe(0);
  });
});
