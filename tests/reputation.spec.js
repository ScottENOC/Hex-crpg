// tests/reputation.spec.js
// Pure logic checks against factions.js's reputation math — no need to play
// through any scene, just load the game and call the functions directly.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('reputation math (factions.js)', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('seedStanding gives +5 for matching race, 0 otherwise', async ({ page }) => {
        const result = await page.evaluate(() => ({
            sameRace: window.seedStanding('human', 'human'),
            differentRace: window.seedStanding('elf', 'human'),
        }));
        expect(result.sameRace).toBe(5);
        expect(result.differentRace).toBe(0);
    });

    test('adjustReputation applies full-strength swings at knowledge=0', async ({ page }) => {
        const result = await page.evaluate(() => {
            const target = { knowledge: 0, standing: 0 };
            window.adjustReputation(target, 10, 20);
            return target;
        });
        expect(result.standing).toBe(10);
        expect(result.knowledge).toBe(20);
    });

    test('adjustReputation dampens standing swings as knowledge rises (70% max dampening)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const target = { knowledge: 100, standing: 0 };
            window.adjustReputation(target, 10, 0);
            return target.standing;
        });
        // dampening = 1 - (100/100)*0.7 = 0.3 -> 10 * 0.3 = 3
        expect(result).toBeCloseTo(3, 5);
    });

    test('adjustReputation clamps standing to [-100, 100] and knowledge to [0, 100]', async ({ page }) => {
        const result = await page.evaluate(() => {
            const high = { knowledge: 0, standing: 95 };
            window.adjustReputation(high, 50, 50);
            const low = { knowledge: 5, standing: -95 };
            window.adjustReputation(low, -50, -50);
            return { high, low };
        });
        expect(result.high.standing).toBe(100);
        expect(result.high.knowledge).toBe(50);
        expect(result.low.standing).toBe(-100);
        expect(result.low.knowledge).toBe(0);
    });

    test('cascadeReputation applies a 40%-per-tier falloff down the chain', async ({ page }) => {
        const result = await page.evaluate(() => {
            const tiers = [
                { knowledge: 0, standing: 0 },
                { knowledge: 0, standing: 0 },
                { knowledge: 0, standing: 0 },
                { knowledge: 0, standing: 0 },
            ];
            window.cascadeReputation(tiers, 25, 20);
            return tiers.map(t => t.standing);
        });
        expect(result[0]).toBeCloseTo(25, 5);        // 25 * 0.4^0
        expect(result[1]).toBeCloseTo(10, 5);         // 25 * 0.4^1
        expect(result[2]).toBeCloseTo(4, 5);           // 25 * 0.4^2
        expect(result[3]).toBeCloseTo(1.6, 5);         // 25 * 0.4^3
    });

    test('cascadeReputation skips missing/undefined tiers without throwing', async ({ page }) => {
        const result = await page.evaluate(() => {
            const tiers = [{ knowledge: 0, standing: 0 }, undefined, { knowledge: 0, standing: 0 }];
            let threw = false;
            try {
                window.cascadeReputation(tiers, 10, 10);
            } catch (e) {
                threw = true;
            }
            return { threw, first: tiers[0].standing, third: tiers[2].standing };
        });
        expect(result.threw).toBe(false);
        expect(result.first).toBeCloseTo(10, 5);
        expect(result.third).toBeCloseTo(1.6, 5); // tier index 2 -> 0.4^2
    });
});
