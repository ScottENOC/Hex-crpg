const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('NPC routine scheduler ID reuse', () => {
  test('unregistering and recreating an NPC cannot revive stale heap events', async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    const result = await page.evaluate(() => {
      const s = window.NPCRoutineScheduler;
      const id = 'scheduler-id-reuse-regression';
      s.registerNpc(id, { currentHex: { q: 0, r: 0 } });
      const first = s.scheduleEvent(id, 1000, 'test:old');
      const firstGeneration = first.generation;
      s.unregisterNpc(id);
      const recreated = s.registerNpc(id, { currentHex: { q: 1, r: 1 } });
      const second = s.scheduleEvent(id, 1000, 'test:new');
      const live = s.exportState().events.filter(e =>
        e.npcId === id && e.generation === s.getState(id)?.eventGeneration
      );
      return {
        firstGeneration,
        recreatedGeneration: recreated.eventGeneration,
        secondGeneration: second.generation,
        liveTypes: live.map(e => e.type),
      };
    });

    expect(result.recreatedGeneration).toBeGreaterThan(result.firstGeneration);
    expect(result.secondGeneration).toBe(result.recreatedGeneration);
    expect(result.liveTypes).toEqual(['test:new']);
  });
});
