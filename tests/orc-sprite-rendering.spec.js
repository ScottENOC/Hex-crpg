// Orcs use the current direct humanoid/creature rendering paths. Legacy
// initiative-tracker portrait-layer DOM assertions were removed with the old
// portrait compositor; current portrait/equipment layering is covered by the
// direct-render regression suite.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('orc sprite rendering', () => {
    test('orc players have dedicated base art rather than a generic fallback', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        const result = await page.evaluate(() => ({
            hasOrcBase: !!window.gameVisuals?.orcBase,
            race: window.party?.[0]?.race,
        }));
        expect(result.race).toBe('orc');
        expect(result.hasOrcBase).toBe(true);
    });
});
