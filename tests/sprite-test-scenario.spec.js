// tests/sprite-test-scenario.spec.js
// Campaign 4: a static grassland populated with every race/gender combo
// that has a real layered CHAR_CONFIG rig, in a few fixed equipment
// loadouts, purely for eyeballing/tuning weapon-armor-helmet overlay
// anchors (drawPlayerCharacter, gameEngine.js) side by side. Not a real
// fight — just confirms the scaffold builds without a manual browser check.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('campaign 4 sprite test scenario builds a full grid on visible grassland', async ({ page }) => {
    await createCharacter(page, { campaign: '4' });
    await page.waitForFunction(() => window.entities && window.entities.length > 10);

    const result = await page.evaluate(() => {
        const origin = window.SPRITE_TEST_ORIGIN;
        const npcs = window.entities.filter(e => e.side !== 'player');
        return {
            currentCampaign: window.currentCampaign,
            npcCount: npcs.length,
            races: [...new Set(npcs.map(e => e.race))].sort(),
            terrainAtOrigin: window.getTerrainAt(origin.q, origin.r).name,
            allEquipped: npcs.every(e => e.equipped.weapon),
            originVisible: window.isVisibleToPlayer(origin),
        };
    });
    expect(result.currentCampaign).toBe('4');
    expect(result.npcCount).toBe(60); // 5 races x 2 genders x 6 loadouts
    expect(result.races).toEqual(['dwarf', 'elf', 'goblin', 'human', 'orc']);
    expect(result.terrainAtOrigin).toBe('Grass');
    expect(result.allEquipped).toBe(true);
    expect(result.originVisible).toBe(true);
});
