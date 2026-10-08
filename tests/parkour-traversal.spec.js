const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('monk parkour traversal', () => {
    test('parkour converts the existing wall elevation rules into short traversals', async ({ page }) => {
        await createCharacter(page);

        const result = await page.evaluate(() => {
            const monk = {
                skills: { agile_climber: 1, parkour: 1 },
                equipped: {}
            };
            const ground = { elevated: false, climbRisk: false, name: 'Grass' };
            const wall = { elevated: true, climbRisk: true, name: 'Climbable Wall' };

            return {
                canParkour: window.hasParkour(monk),
                up: window.getParkourTraversalCost(ground, wall, monk),
                down: window.getParkourTraversalCost(wall, ground, monk),
                blockedByArmor: window.hasParkour({
                    skills: { parkour: 1 },
                    equipped: { armor: 'some_armor' }
                }),
                blockedByShield: window.hasParkour({
                    skills: { parkour: 1 },
                    equipped: { offhand: 'some_shield' }
                })
            };
        });

        expect(result.canParkour).toBe(true);
        expect(result.up).toBe(20);
        expect(result.down).toBe(5);
        expect(result.blockedByArmor).toBe(false);
        expect(result.blockedByShield).toBe(false);
    });
});
