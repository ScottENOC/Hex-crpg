const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('seamless party-centred world streaming', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() =>
      !!window.WorldChunkStreaming &&
      !!window.SettlementScale &&
      !!window.MultiAnchorCivilianStreaming?.stats?.installed
    );
  });

  test('split party members keep two distant chunk bubbles active at the same time', async ({ page }) => {
    const result = await page.evaluate(() => {
      const stream = window.WorldChunkStreaming;
      const players = window.entities.filter(e => e.alive && e.side === 'player' && !e.rider);
      const first = players[0];
      let second = players[1];
      if (!second) {
        second = new window.Entity('Streaming Test Companion', '#777', { q:first.hex.q+180, r:first.hex.r+90 }, 10);
        second.id = 'streaming-test-companion';
        second.side = 'player';
        second.alive = true;
        second.visualQ = second.hex.q;
        second.visualR = second.hex.r;
        window.entities.push(second);
      }
      first.hex = { q:0, r:0 }; first.visualQ=0; first.visualR=0;
      second.hex = { q:240, r:120 }; second.visualQ=240; second.visualR=120;
      stream.pulse();
      const a = stream.chunkKey(first.hex,0);
      const b = stream.chunkKey(second.hex,0);
      return {
        observers:stream.stats.observerCount,
        chunks:stream.stats.activeChunkCount,
        hasA:stream.activeChunks.has(a),
        hasB:stream.activeChunks.has(b),
        same:a===b,
      };
    });
    expect(result.observers).toBeGreaterThanOrEqual(2);
    expect(result.same).toBe(false);
    expect(result.hasA).toBe(true);
    expect(result.hasB).toBe(true);
    expect(result.chunks).toBeGreaterThanOrEqual(50); // two non-overlapping 5x5 bubbles
  });

  test('nearby stairs preload the connected upper floor without changing maps', async ({ page }) => {
    await page.waitForFunction(() => !!window.campaign2HollowTankardBuilding && !!window.campaign2HollowTankardStairHex);
    const result = await page.evaluate(() => {
      const stream = window.WorldChunkStreaming;
      const building = window.campaign2HollowTankardBuilding;
      const index = window.multiStoryBuildings.indexOf(building);
      const stair = window.campaign2HollowTankardStairHex;
      const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
      player.hex = { ...stair }; player.visualQ=stair.q; player.visualR=stair.r;
      player.currentFloor = 0;
      stream.pulse();
      const id = String(building.id || building.key || building.name || `building-${index}`);
      return {
        ground:stream.activeVerticalLayers.has(`${id}:0`),
        upstairs:stream.activeVerticalLayers.has(`${id}:1`),
        activeChunk:stream.isHexActive(stair,0),
        floorStill:player.currentFloor,
      };
    });
    expect(result.activeChunk).toBe(true);
    expect(result.ground).toBe(true);
    expect(result.upstairs).toBe(true);
    expect(result.floorStill).toBe(0); // preload is not a teleport or loading transition
  });

  test('settlement districts are labels, not loading gates', async ({ page }) => {
    const result = await page.evaluate(() => {
      const silverhart = window.SettlementScale.get('silverhart');
      return {
        tier:silverhart?.tier,
        population:silverhart?.populationTarget,
        districts:silverhart?.districts?.length || 0,
        districtHasLiveBudget:(silverhart?.districts || []).some(d => 'liveBudget' in d),
      };
    });
    expect(result.tier).toBe('capital');
    expect(result.population).toBe(500);
    expect(result.districts).toBeGreaterThan(0);
    expect(result.districtHasLiveBudget).toBe(false);
  });
});
