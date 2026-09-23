const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Silverhart persistent population', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign:'2' });
    await page.waitForFunction(() =>
      !!window.SilverhartPopulation?.stats?.installed &&
      window.SilverhartPopulation.stats.population === 500 &&
      !!window.SettlementScale?.get('silverhart')
    );
  });

  test('capital keeps 500 persistent residents without 500 live entities', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop=window.SilverhartPopulation;
      const stats=pop.stats;
      return {
        population:stats.population,
        indexedChunks:stats.indexedChunks,
        materialised:stats.materialised,
        entityShells:window.entities.filter(e=>e.isSilverhartCivilian).length,
      };
    });
    expect(result.population).toBe(500);
    expect(result.indexedChunks).toBeGreaterThan(5);
    expect(result.materialised).toBeLessThan(500);
    expect(result.entityShells).toBe(result.materialised);
  });

  test('entering Silverhart materialises only residents in hot chunks', async ({ page }) => {
    const result = await page.evaluate(() => {
      const city=window.SettlementScale.get('silverhart');
      const player=window.entities.find(e=>e.alive&&e.side==='player'&&!e.rider);
      player.hex={...city.centre};player.visualQ=city.centre.q;player.visualR=city.centre.r;
      window.WorldChunkStreaming.pulse();
      const pulse=window.SilverhartPopulation.pulse();
      return {
        pulse,
        persistent:window.SilverhartPopulation.records.size,
        live:window.SilverhartPopulation.materialised.size,
        max:window.SilverhartPopulation.HARD_CAP,
      };
    });
    expect(result.persistent).toBe(500);
    expect(result.live).toBeGreaterThan(0);
    expect(result.live).toBeLessThanOrEqual(result.max);
    expect(result.pulse.candidates).toBeLessThan(result.persistent);
  });

  test('split observers increase the available live crowd budget instead of evicting the first area', async ({ page }) => {
    const result = await page.evaluate(() => {
      const city=window.SettlementScale.get('silverhart');
      const players=window.entities.filter(e=>e.alive&&e.side==='player'&&!e.rider);
      const first=players[0];
      let second=players[1];
      if(!second){
        second=new window.Entity('Capital Split Companion','#777',{q:city.centre.q+96,r:city.centre.r},10);
        second.id='capital-split-companion';second.side='player';second.alive=true;window.entities.push(second);
      }
      first.hex={...city.centre};first.visualQ=first.hex.q;first.visualR=first.hex.r;
      second.hex={q:city.centre.q+96,r:city.centre.r};second.visualQ=second.hex.q;second.visualR=second.hex.r;
      window.WorldChunkStreaming.pulse();
      const pulse=window.SilverhartPopulation.pulse();
      return { observers:pulse.observers,budget:pulse.budget,base:window.SilverhartPopulation.PER_OBSERVER_BUDGET,live:pulse.materialised };
    });
    expect(result.observers).toBeGreaterThanOrEqual(2);
    expect(result.budget).toBeGreaterThan(result.base);
    expect(result.live).toBeLessThanOrEqual(result.budget);
  });
});
