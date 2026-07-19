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

    test('adjustMerchantInfluence clamps to [0, 100] and is additive', async ({ page }) => {
        const result = await page.evaluate(() => {
            const f = { merchantInfluence: { silverhart_kingdom: 50 } };
            window.adjustMerchantInfluence(f, 'silverhart_kingdom', 10);
            window.adjustMerchantInfluence(f, 'silverhart_kingdom', 100);
            const high = f.merchantInfluence.silverhart_kingdom;
            window.adjustMerchantInfluence(f, 'silverhart_kingdom', -1000);
            const low = f.merchantInfluence.silverhart_kingdom;
            return { high, low };
        });
        expect(result.high).toBe(100);
        expect(result.low).toBe(0);
    });

    // ironbondArc.js now wraps window.tickFactionAgendas to also drive
    // surfacePower's own always-climbing baseline drift (see
    // SURFACE_POWER_BASE_DRIFT_PER_HOUR) — deliberate, per the design: the
    // player should never be able to "wait it out" by staying neutral, on
    // top of whichever side's rivalry drift this original test covers.
    test("tickFactionAgendas drifts merchant influence based on the Company's own standing trend, on top of surfacePower's always-on baseline climb", async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = window.factions.ironbond_company.merchantInfluence.silverhart_kingdom;
            window.tickFactionAgendas(3600); // 1 in-game hour, standing still at its seeded default (0-5, not >10)
            const neutralAfter = window.factions.ironbond_company.merchantInfluence.silverhart_kingdom;

            window.factions.ironbond_company.standing = 50; // thriving
            window.tickFactionAgendas(3600);
            const thrivingAfter = window.factions.ironbond_company.merchantInfluence.silverhart_kingdom;

            window.factions.ironbond_company.standing = -50; // struggling
            window.tickFactionAgendas(3600);
            const strugglingAfter = window.factions.ironbond_company.merchantInfluence.silverhart_kingdom;

            return {
                before, neutralAfter, thrivingAfter, strugglingAfter,
                neutralDelta: neutralAfter - before,
                thrivingDelta: thrivingAfter - neutralAfter,
                strugglingDelta: strugglingAfter - thrivingAfter,
            };
        });
        // Baseline climb applies even while neutral — no more "wait it out".
        expect(result.neutralAfter).toBeGreaterThan(result.before);
        // The old standing-trend drift still shows up as a real difference
        // in the *rate* of climb (a thriving tick gains more than a
        // struggling one), even though both are now net-positive overall.
        expect(result.thrivingDelta).toBeGreaterThan(result.strugglingDelta);
    });
});
