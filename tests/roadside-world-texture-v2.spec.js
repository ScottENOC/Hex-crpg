const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
  await createCharacter(page, { campaign: '2' });
  await page.waitForFunction(() => window.RoadsideWorldTextureV2?.stats?.built === true, null, { timeout: 10000 });
}

test.describe('roadside world texture v2', () => {
  test.beforeEach(async ({ page }) => ready(page));

  test('places five deterministic micro-locations with physical dressing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const api = window.RoadsideWorldTextureV2;
      const data = Object.fromEntries(api.allPlaced.map(site => {
        const k = `${site.hex.q},${site.hex.r}`;
        return [site.id, {
          hex: site.hex,
          type: window.tileObjects[k]?.type,
          terrain: window.getTerrainAt(site.hex.q, site.hex.r)?.name,
        }];
      }));
      const cave = api.getPlaced('minor-cave-shelter');
      return {
        stats: api.stats,
        ids: api.allPlaced.map(x => x.id).sort(),
        data,
        caveTerrain: cave ? window.getTerrainAt(cave.hex.q, cave.hex.r)?.name : null,
        decorativeTollPieces: Object.values(window.tileObjects).filter(x => x?.roadsideSite === 'ruined-toll-post').length,
        decorativeCharcoalPieces: Object.values(window.tileObjects).filter(x => x?.roadsideSite === 'charcoal-burner-clearing').length,
      };
    });

    expect(result.stats.placed).toBe(5);
    expect(result.ids).toEqual([
      'abandoned-fishing-spot',
      'charcoal-burner-clearing',
      'minor-cave-shelter',
      'old-road-cairn',
      'ruined-toll-post',
    ]);
    expect(result.data['ruined-toll-post'].type).toBe('signpost');
    expect(result.data['charcoal-burner-clearing'].type).toBe('fireplace');
    expect(result.caveTerrain).toBe('Cave Floor');
    expect(result.decorativeTollPieces).toBeGreaterThanOrEqual(2);
    expect(result.decorativeCharcoalPieces).toBeGreaterThanOrEqual(2);
  });

  test('searchable sites only grant their modest loot once', async ({ page }) => {
    const result = await page.evaluate(() => {
      const api = window.RoadsideWorldTextureV2;
      const site = api.getPlaced('ruined-toll-post');
      const k = `${site.hex.q},${site.hex.r}`;
      const actor = window.player;
      actor.inventory = actor.inventory || [];
      const start = actor.inventory.length;
      let choices = null;
      const old = window.showDialogue;
      window.showDialogue = (_speaker, _text, c) => { if (!choices && c?.length) choices = c; };
      api.interact('ruined-toll-post', window.tileObjects[k], site.hex, actor);
      choices?.[0]?.action?.();
      const once = actor.inventory.length;
      choices = null;
      api.interact('ruined-toll-post', window.tileObjects[k], site.hex, actor);
      choices?.[0]?.action?.();
      const twice = actor.inventory.length;
      window.showDialogue = old;
      return { start, once, twice, searched: window.tileObjects[k]?.searched };
    });

    expect(result.once).toBe(result.start + 1);
    expect(result.twice).toBe(result.once);
    expect(result.searched).toBe(true);
  });

  test('the old road cairn is intentionally flavour-only', async ({ page }) => {
    const result = await page.evaluate(() => {
      const api = window.RoadsideWorldTextureV2;
      const site = api.getPlaced('old-road-cairn');
      const k = `${site.hex.q},${site.hex.r}`;
      const actor = window.player;
      actor.inventory = actor.inventory || [];
      const before = actor.inventory.length;
      let choices = null;
      const old = window.showDialogue;
      window.showDialogue = (_speaker, _text, c) => { if (!choices && c?.length) choices = c; };
      api.interact('old-road-cairn', window.tileObjects[k], site.hex, actor);
      const label = choices?.[0]?.label;
      choices?.[0]?.action?.();
      window.showDialogue = old;
      return { before, after: actor.inventory.length, label, searched: window.tileObjects[k]?.searched, flavourOnly: window.tileObjects[k]?.flavourOnly };
    });

    expect(result.label).toBe('Set the stone back carefully.');
    expect(result.after).toBe(result.before);
    expect(result.searched).toBe(true);
    expect(result.flavourOnly).toBe(true);
  });
});
