// tests/hollowmere-shakedown.spec.js
// The three Ironbond shakedown branches: reputation cascade, NPC side/isNPC
// transitions, and (for the peaceful branches) the soldiers walking out the
// door and later approaching for the quest offer.
const { test, expect } = require('@playwright/test');
const { createCharacter, resolveShakedownDirectly } = require('./helpers');

test.describe('Hollowmere shakedown branches', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('stay_out: small negative rep for Garrick/patrons, small positive for Ironbond', async ({ page }) => {
        await resolveShakedownDirectly(page, 'stay_out');
        const rep = await page.evaluate(() => ({
            garrick: window.entities.find(e => e.name === 'Garrick Holt').reputation,
            mira: window.entities.find(e => e.name === 'Mira Ashbrook').reputation,
            ironbond: window.factions.ironbond_company.standing,
            soldiersWaitingOutside: window.hollowmereSoldiersWaitingOutside,
        }));
        expect(rep.garrick.standing).toBeLessThan(5); // seeded at 5 (same race), should drop
        expect(rep.mira.standing).toBeLessThan(5);
        expect(rep.ironbond).toBeGreaterThan(5);
        expect(rep.soldiersWaitingOutside).toBe(true);
    });

    test('encourage_pay: modest positive rep for Garrick, bigger positive for Ironbond', async ({ page }) => {
        await resolveShakedownDirectly(page, 'encourage_pay');
        const rep = await page.evaluate(() => ({
            garrick: window.entities.find(e => e.name === 'Garrick Holt').reputation,
            ironbond: window.factions.ironbond_company.standing,
        }));
        expect(rep.garrick.standing).toBeGreaterThan(5);
        expect(rep.ironbond).toBeGreaterThan(15); // seeded 5 + at least the 15 base delta
    });

    test('fight: allies flip to aiControlled player-side, soldiers become hostile, cascade reaches the kingdom', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        const state = await page.evaluate(() => {
            const names = ['Garrick Holt', 'Mira Ashbrook', 'Oskar Vinn', 'Dray Coltayne', 'Tomlin Brask', 'Hask Greel'];
            const entities = Object.fromEntries(names.map(n => [n, window.entities.find(e => e.name === n)]));
            return {
                garrickSide: entities['Garrick Holt'].side,
                garrickAiControlled: entities['Garrick Holt'].aiControlled,
                garrickIsNPC: entities['Garrick Holt'].isNPC,
                draySide: entities['Dray Coltayne'].side,
                drayIsNPC: entities['Dray Coltayne'].isNPC,
                ironbond: window.factions.ironbond_company.standing,
                silverhart: window.factions.silverhart_kingdom.standing,
                elder: window.regionalNPCs.elder.reputation.standing,
                baron: window.regionalNPCs.baron.reputation.standing,
            };
        });
        expect(state.garrickSide).toBe('player');
        expect(state.garrickAiControlled).toBe(true); // ally, not a puppet
        expect(state.garrickIsNPC).toBe(false); // so the initiative tracker picks them up
        expect(state.draySide).toBe('enemy');
        expect(state.drayIsNPC).toBe(false);
        expect(state.ironbond).toBeLessThan(-20); // seeded 5, -35 delta
        // Cascade: Garrick +25 -> Elder ~+10 -> Baron ~+4 -> Kingdom ~+1.6, all seeded at 5
        expect(state.elder).toBeGreaterThan(10);
        expect(state.baron).toBeGreaterThan(7);
        expect(state.silverhart).toBeGreaterThan(5);
        expect(state.silverhart).toBeLessThan(8); // kingdom-level effect should stay small
    });

    test('merchant influence over the kingdom moves a little with the branch chosen', async ({ page }) => {
        const before = await page.evaluate(() => window.factions.ironbond_company.merchantInfluence.silverhart_kingdom);
        await resolveShakedownDirectly(page, 'fight');
        const after = await page.evaluate(() => window.factions.ironbond_company.merchantInfluence.silverhart_kingdom);
        // Allow tiny slop from the autonomous agenda tick running in the background
        // between these two reads (see factions.js tickFactionAgendas).
        expect(after).toBeCloseTo(before - 2, 1); // siding with the tavern keeper costs the Company a little ground
    });

    test('all 6 fight participants appear in the initiative tracker after the fight branch', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        const inTracker = await page.evaluate(() => {
            const combatants = ['Garrick Holt', 'Mira Ashbrook', 'Oskar Vinn', 'Dray Coltayne', 'Tomlin Brask', 'Hask Greel'];
            const tracked = window.entities
                .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC)
                .map(e => e.name);
            return combatants.every(n => tracked.includes(n));
        });
        expect(inTracker).toBe(true);
    });
});
