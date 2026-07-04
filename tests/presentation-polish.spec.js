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
        // border forts), so it's correct for it to appear here — dwarves and
        // elves still aren't represented anywhere in this part of the world.
        expect(legendHtml).toContain('Orc Tribes');
        expect(legendHtml).not.toContain('Dwarven Kingdom');
        expect(legendHtml).not.toContain('Elven Realm');
        expect(legendHtml).not.toContain('Goblin Hordes');
    });
});
