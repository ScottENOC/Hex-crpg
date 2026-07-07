// tests/climbing-skills.spec.js
// Three climbing skills — Iron Grip (strength), Sure-Footed (agility),
// Agile Climber (monk) — stack: each knocks 20% off the TP surcharge for
// climbRisk terrain (floor 40% remaining with all three) and, in combat,
// 10 points off the fall chance (floor 0% with all three). Out of combat,
// climbing always succeeds regardless of skills.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('climbing skills: TP cost + combat fall chance stacking', () => {
    test('each climbing skill reduces the Climbable Wall TP surcharge, stacking to a 40% floor', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            p.skills = {};
            window.setTerrainAt(900, 900, 'Climbable Wall');
            const none = window.getMoveCostMult(900, 900, p);
            p.skills.iron_grip = 1;
            const one = window.getMoveCostMult(900, 900, p);
            p.skills.sure_footed = 1;
            const two = window.getMoveCostMult(900, 900, p);
            p.skills.agile_climber = 1;
            const three = window.getMoveCostMult(900, 900, p);
            return { none, one, two, three };
        });
        // Baseline Climbable Wall moveCostMult is 3; formula is 1 + (3-1)*climbCostMult.
        expect(result.none).toBeCloseTo(3.0, 5);
        expect(result.one).toBeCloseTo(1 + 2 * 0.8, 5);
        expect(result.two).toBeCloseTo(1 + 2 * 0.6, 5);
        expect(result.three).toBeCloseTo(1 + 2 * 0.4, 5); // floor: 40% of the surcharge remains
        expect(result.one).toBeLessThan(result.none);
        expect(result.two).toBeLessThan(result.one);
        expect(result.three).toBeLessThan(result.two);
    });

    test('countClimbingSkills counts only the three climbing skills, capped at what the entity actually has', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            p.skills = { fastMovement: 2 }; // an unrelated skill shouldn't count
            const zero = window.countClimbingSkills(p);
            p.skills.agile_climber = 1;
            const oneSkill = window.countClimbingSkills(p);
            p.skills.iron_grip = 1;
            p.skills.sure_footed = 1;
            const allThree = window.countClimbingSkills(p);
            return { zero, oneSkill, allThree };
        });
        expect(result.zero).toBe(0);
        expect(result.oneSkill).toBe(1);
        expect(result.allThree).toBe(3);
    });
});
