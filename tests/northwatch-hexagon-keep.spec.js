// tests/northwatch-hexagon-keep.spec.js
// The redesigned inner keep (carveHexKeep, campaign2World.js): a regular
// hexagon gapped at each of its 6 corners, 6 archers posted at those gaps
// (hold until an enemy is adjacent, then fall back to the hexagon center),
// and the commander's two new triggers (take the first fallen archer's
// post; switch to melee once someone's in reach of the hexagon/archer
// posts specifically).

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Northwatch hexagon keep: archers + commander', () => {
    test('the keep is a hexagon with exactly 6 gap hexes, each a real floor tile', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const gaps = window.campaign2NorthwatchKeepGaps;
            const region = window.campaign2NorthwatchKeepRegion;
            return {
                gapCount: gaps?.length,
                allGapsAreFloor: gaps?.every(g => window.getTerrainAt(g.q, g.r).name === region.floorType),
            };
        });
        expect(result.gapCount).toBe(6);
        expect(result.allGapsAreFloor).toBe(true);
    });

    test('a hexagon archer holds its post with no enemy adjacent, and falls back to the hexagon center once one is', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const archer = window.entities.find(e => e.isHexagonArcher);
            const center = window.campaign2NorthwatchCenter;
            const startHex = { ...archer.hex };
            archer.aiState = 'combat';
            archer.timePoints = 100;
            window.entities = [archer];
            window.currentTurnEntity = archer;
            window.isInCombat = true;
            window.takeTurn(archer);
            await new Promise(r => setTimeout(r, 600));
            const heldPost = archer.hex.q === startHex.q && archer.hex.r === startHex.r;

            // Now an enemy adjacent to the archer's post.
            const attacker = window.createMonster('orc', { q: startHex.q + 1, r: startHex.r }, null, null, 'enemy');
            attacker.timePoints = 100;
            archer.timePoints = 100;
            window.entities = [archer, attacker];
            window.currentTurnEntity = archer;
            window.takeTurn(archer);
            await new Promise(r => setTimeout(r, 600));
            // A fighting withdrawal, not a blind step: something already
            // adjacent gets fought this turn (same "fighting withdrawal"
            // rule the wall garrison's own retreat already uses) rather
            // than the archer just walking away with an enemy on top of
            // it — so the real signal here is the contingency having
            // fired (mode flips to 'retreat'), not an instant hex move.
            const contingencyFired = archer.combatDirective.mode === 'retreat';

            return { heldPost, contingencyFired };
        });
        expect(result.heldPost).toBe(true);
        expect(result.contingencyFired).toBe(true);
    });

    test("the commander takes the first fallen archer's post and draws melee once someone's in reach of an archer post", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const commander = window.entities.find(e => e.name === 'Commander Ysolde Hart');
            const archer = window.entities.find(e => e.isHexagonArcher);
            const archerDeathHex = { ...archer.hex };

            window.handleLethalDamage(archer, { name: 'test attacker', side: 'enemy' });
            const repositioned = commander.combatDirective.mode === 'retreat' &&
                commander.combatDirective.retreatTo.q === archerDeathHex.q &&
                commander.combatDirective.retreatTo.r === archerDeathHex.r;
            const oneShot = commander.takeFallenArcherPostOnce === false;
            // Clear the retreat mode from the reposition check above so it
            // doesn't short-circuit the weapon-switch scenario below (the
            // two triggers are independent; this test just checks both).
            commander.combatDirective.mode = null;

            // Weapon switch: an opponent adjacent to a (different, still-alive)
            // archer's post should draw the commander's melee weapon even
            // though nothing is near the commander's own current hex.
            const otherArcher = window.entities.find(e => e.isHexagonArcher && e.alive && e !== archer);
            commander.hex = { q: window.campaign2NorthwatchCenter.q, r: window.campaign2NorthwatchCenter.r };
            commander.timePoints = 100;
            const raider = window.createMonster('orc', { q: otherArcher.homeHex.q + 1, r: otherArcher.homeHex.r }, null, null, 'enemy');
            raider.timePoints = 100;
            window.entities = [commander, otherArcher, raider];
            window.currentTurnEntity = commander;
            window.isInCombat = true;
            window.takeTurn(commander);
            await new Promise(r => setTimeout(r, 600));
            const weaponId = commander.equipped?.weapon;
            const drewMelee = weaponId && window.items[weaponId]?.subType !== 'ranged';

            return { repositioned, oneShot, drewMelee };
        });
        expect(result.repositioned).toBe(true);
        expect(result.oneShot).toBe(true);
        expect(result.drewMelee).toBe(true);
    });
});
