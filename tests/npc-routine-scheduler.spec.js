const { test, expect } = require('@playwright/test');

test.describe('event-driven NPC routine scheduler', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.NPCRoutineScheduler);
    await page.evaluate(() => window.NPCRoutineScheduler.importState({ version: 1, states: [], events: [], sequence: 0 }));
  });

  test('processes only due events rather than polling the registered population', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = window.NPCRoutineScheduler;
      let handled = 0;
      s.registerHandler('test:ping', () => { handled++; });
      for (let i = 0; i < 10000; i++) s.registerNpc(`civilian-${i}`, { currentNode: 'home' });
      s.scheduleEvent('civilian-3', 100, 'test:ping');
      s.scheduleEvent('civilian-7000', 150, 'test:ping');
      s.scheduleEvent('civilian-9999', 300, 'test:ping');
      const first = s.processDueEvents(160);
      return { handled, first, population: s.populationSize, queued: s.queueSize };
    });

    expect(result.population).toBe(10000);
    expect(result.handled).toBe(2);
    expect(result.first.processed).toBe(2);
    expect(result.first.population).toBe(10000);
    expect(result.queued).toBe(1);
  });

  test('abstract travel computes position lazily and resolves on arrival', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = window.NPCRoutineScheduler;
      s.registerNpc('smith', { currentNode: 'home', currentHex: { q: 0, r: 0 } });
      s.beginAbstractTravel('smith', {
        fromNode: 'home', toNode: 'smithy', routeId: 'home-smithy',
        fromHex: { q: 0, r: 0 }, toHex: { q: 10, r: -4 },
        departedAt: 100, arrivesAt: 200, arrivalActivity: 'working'
      });
      const halfway = s.getAbstractLocation('smith', 150);
      const before = s.getState('smith');
      const processed = s.processDueEvents(200);
      const after = s.getState('smith');
      return {
        halfway,
        beforeLevel: before.simulationLevel,
        processed: processed.processed,
        after: { node: after.currentNode, activity: after.activity, travel: after.travel, level: after.simulationLevel }
      };
    });

    expect(result.beforeLevel).toBe('abstract');
    expect(result.halfway.kind).toBe('travel');
    expect(result.halfway.progress).toBeCloseTo(0.5, 5);
    expect(result.halfway.hex.q).toBeCloseTo(5, 5);
    expect(result.halfway.hex.r).toBeCloseTo(-2, 5);
    expect(result.processed).toBe(1);
    expect(result.after).toEqual({ node: 'smithy', activity: 'working', travel: null, level: 'dormant' });
  });

  test('catch-up work is bounded after a large time jump', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = window.NPCRoutineScheduler;
      let handled = 0;
      s.registerHandler('test:backlog', () => { handled++; });
      for (let i = 0; i < 500; i++) {
        const id = `backlog-${i}`;
        s.registerNpc(id);
        s.scheduleEvent(id, i, 'test:backlog');
      }
      const first = s.processDueEvents(10000, { maxEvents: 64 });
      const second = s.processDueEvents(10000, { maxEvents: 64 });
      return { handled, first, second, remaining: s.queueSize };
    });

    expect(result.first.processed).toBe(64);
    expect(result.first.remainingDue).toBe(true);
    expect(result.second.processed).toBe(64);
    expect(result.handled).toBe(128);
    expect(result.remaining).toBe(372);
  });

  test('persistent variation is deterministic and promotion keeps routine state', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = window.NPCRoutineScheduler;
      const a = s.deterministicRange('Gregor', 'wake-offset', -1800, 1800);
      const b = s.deterministicRange('Gregor', 'wake-offset', -1800, 1800);
      const other = s.deterministicRange('Mara', 'wake-offset', -1800, 1800);
      s.registerNpc('Gregor', { currentNode: 'house-12', activity: 'sleeping', metadata: { occupation: 'smith' } });
      s.promoteNpc('Gregor', 'combat');
      const promoted = s.getState('Gregor');
      s.demoteNpc('Gregor', 'abstract');
      const demoted = s.getState('Gregor');
      return {
        a, b, other,
        promoted: { level: promoted.simulationLevel, node: promoted.currentNode, occupation: promoted.metadata.occupation },
        demoted: { level: demoted.simulationLevel, node: demoted.currentNode, occupation: demoted.metadata.occupation }
      };
    });

    expect(result.a).toBe(result.b);
    expect(result.a).not.toBe(result.other);
    expect(result.promoted).toEqual({ level: 'active', node: 'house-12', occupation: 'smith' });
    expect(result.demoted).toEqual({ level: 'abstract', node: 'house-12', occupation: 'smith' });
  });

  test('cancelled events are discarded lazily without scanning the queue', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = window.NPCRoutineScheduler;
      let handled = 0;
      s.registerHandler('test:cancel', () => { handled++; });
      s.registerNpc('civilian');
      s.scheduleEvent('civilian', 10, 'test:cancel');
      s.scheduleEvent('civilian', 20, 'test:cancel');
      s.clearNpcEvents('civilian');
      s.scheduleEvent('civilian', 30, 'test:cancel');
      const processed = s.processDueEvents(40);
      return { handled, processed, remaining: s.queueSize };
    });

    expect(result.handled).toBe(1);
    expect(result.processed.processed).toBe(1);
    expect(result.processed.skipped).toBe(2);
    expect(result.remaining).toBe(0);
  });
});
