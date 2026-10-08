const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('multi-story stair interaction', () => {
    test('standing on a stair does not change floors until the stair is clicked', async ({ page }) => {
        await createCharacter(page);

        const result = await page.evaluate(() => {
            const leader = window.entities.find(e => e.name === window.party[0].name);
            leader.floor = 0;
            leader.hex = { q: 10, r: 10 };

            window.multiStoryBuildings = [{
                minQ: 9, maxQ: 11, minR: 9, maxR: 11,
                floors: {
                    1: {
                        terrain: {
                            '10,10': 'Wood Floor',
                            '10,11': 'Wood Floor',
                        },
                        tileObjects: {}
                    }
                }
            }];
            window.tileObjects['10,10'] = { type: 'stair_up', toFloor: 1 };

            window.checkStairTransitions();
            const floorBeforeClick = leader.floor;

            window.useStairFromClick(10, 10, leader);
            return { floorBeforeClick, floorAfterClick: leader.floor };
        });

        expect(result.floorBeforeClick).toBe(0);
        expect(result.floorAfterClick).toBe(1);
    });

    test('group stair click preserves formation on the destination floor', async ({ page }) => {
        await createCharacter(page);

        const result = await page.evaluate(() => {
            const leader = window.entities.find(e => e.name === window.party[0].name);
            const follower = window.entities.find(e => e.name === 'Wren Talbot');
            if (!leader || !follower) throw new Error('Expected Wren Talbot in the test party');

            leader.floor = 0;
            follower.floor = 0;
            leader.hex = { q: 10, r: 10 };
            follower.hex = { q: 10, r: 11 };

            window.multiStoryBuildings = [{
                minQ: 9, maxQ: 12, minR: 9, maxR: 12,
                floors: {
                    1: {
                        terrain: {
                            '10,10': 'Wood Floor',
                            '10,11': 'Wood Floor',
                        },
                        tileObjects: {}
                    }
                }
            }];
            window.tileObjects['10,10'] = { type: 'stair_up', toFloor: 1 };
            window.groupMoveMode = true;
            window.partyFormation = 'close';

            const used = window.useStairFromClick(10, 10, leader);
            return {
                used,
                leader: { floor: leader.floor, q: leader.hex.q, r: leader.hex.r },
                follower: { floor: follower.floor, q: follower.hex.q, r: follower.hex.r },
                groupMoveMode: window.groupMoveMode
            };
        });

        expect(result.used).toBe(true);
        expect(result.leader).toEqual({ floor: 1, q: 10, r: 10 });
        expect(result.follower).toEqual({ floor: 1, q: 10, r: 11 });
        expect(result.groupMoveMode).toBe(false);
    });
});
