const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('dragons in the arena pool', () => {
    test('a low-fightsCompleted party never rolls a dragon encounter', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            window.roguelikeData = window.roguelikeData || {};
            window.roguelikeData.fightsCompleted = 1;
            window.roguelikeData.mercenaryGraveyard = [];
            window.startArenaFight();
            const dragonPresent = window.entities.some(e => e.dragonSizeTier);
            return { dragonPresent };
        });
        expect(result.dragonPresent).toBe(false);
    });

    test('a high-fightsCompleted party can roll a dragon, and every dragon hex is walkable', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            window.roguelikeData = window.roguelikeData || {};
            window.roguelikeData.mercenaryGraveyard = [];

            // Run several high-level arena fights; with dragons in the pool
            // and a big enough SP budget, at least one should show up.
            let sawDragon = false;
            let footprintOk = true;
            for (let i = 0; i < 15 && !sawDragon; i++) {
                window.roguelikeData.fightsCompleted = 25;
                window.startArenaFight();
                const dragons = window.entities.filter(e => e.dragonSizeTier);
                if (dragons.length > 0) {
                    sawDragon = true;
                    dragons.forEach(d => {
                        d.getAllHexes().forEach(h => {
                            const t = window.getTerrainAt(h.q, h.r);
                            if (t.name === 'Wall' || t.name === 'Water' || t.name === 'Pedestal') footprintOk = false;
                        });
                    });
                }
            }
            return { sawDragon, footprintOk };
        });
        expect(result.sawDragon).toBe(true);
        expect(result.footprintOk).toBe(true);
    });
});
