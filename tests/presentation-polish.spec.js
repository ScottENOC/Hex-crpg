const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('first-five-minutes presentation polish', () => {
    test('arena lobby has furniture dressing the bare cave floor', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const types = Object.values(window.tileObjects).map(o => o.type);
            return {
                hasTable: types.includes('table'),
                hasBench: types.includes('bench'),
                hasFireplace: types.includes('fireplace'),
            };
        });
        expect(result.hasTable).toBe(true);
        expect(result.hasBench).toBe(true);
        expect(result.hasFireplace).toBe(true);
    });

    test('world map legend only lists factions actually present on the map, not a static full roster', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const legendHtml = await page.evaluate(() => {
            window.renderWorldMap();
            return document.getElementById('world-map-legend').innerHTML;
        });
        expect(legendHtml).toContain('Human Lands');
        // Orc-held territory is now actually painted on the map (east of the
        // border forts), Kragmoor (the Deepholds' one city-and-mine) gets a
        // real marker, and a forested elven realm now spans the southern
        // edge. The Skarn-tooth camp is a scouting party on human land, not
        // its own nation's territory, so no cell is ever colored for the
        // goblin faction — it never appears in the legend.
        expect(legendHtml).toContain('Orc Tribes');
        expect(legendHtml).toContain('Dwarven Kingdom');
        expect(legendHtml).toContain('Elven Realm');
        expect(legendHtml).not.toContain('Goblin Hordes');
    });
});
