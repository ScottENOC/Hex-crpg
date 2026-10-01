const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForWrenArc(page) {
    await page.waitForFunction(() => {
        const wren = window.party?.find(p => p.name === 'Wren Talbot');
        return !!wren &&
            !!window.wrenCharacterArc &&
            typeof window.getWrenCharacterState === 'function' &&
            typeof window.applyWrenDialogueChoice === 'function' &&
            !!window.showDialogue?.__wrenCharacterArcAware;
    });
}

test.describe('Wren character development', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await waitForWrenArc(page);
    });

    test('starts Wren as loyal, somewhat merciful, but still shaped by abandonment', async ({ page }) => {
        const state = await page.evaluate(() => window.getWrenCharacterState());
        expect(state.player).toEqual({ personalLoyalty: 0, mercy: 0 });
        expect(state.wren).toEqual({ personalLoyalty: 20, mercy: 15, security: -20 });
        expect(state.attachment).toBe('guarded');
    });

    test('direct dialogue shapes player, Wren and relationship only once', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = {
                state: window.getWrenCharacterState(),
                relationship: window.getCompanionRelationship(wren),
            };
            const first = window.applyWrenDialogueChoice('you_do_not_owe_me');
            const afterFirst = {
                state: window.getWrenCharacterState(),
                relationship: window.getCompanionRelationship(wren),
            };
            const second = window.applyWrenDialogueChoice('you_do_not_owe_me');
            const afterSecond = {
                state: window.getWrenCharacterState(),
                relationship: window.getCompanionRelationship(wren),
            };
            return { before, first, afterFirst, second, afterSecond };
        });

        expect(result.first).toBe(true);
        expect(result.second).toBe(false);
        expect(result.afterFirst.state.player.personalLoyalty).toBeLessThan(result.before.state.player.personalLoyalty);
        expect(result.afterFirst.state.player.mercy).toBeGreaterThan(result.before.state.player.mercy);
        expect(result.afterFirst.state.wren.security).toBe(result.before.state.wren.security + 10);
        expect(result.afterFirst.relationship.trust).toBe(result.before.relationship.trust + 6);
        expect(result.afterFirst.relationship.familiarity).toBe(result.before.relationship.familiarity + 3);
        expect(result.afterSecond).toEqual(result.afterFirst);
    });

    test('high trust makes the player a stronger model for Wren than low trust', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.setCompanionRelationship(wren, { trust: 0, familiarity: 35 }, 'low-trust test');
            const lowBefore = window.getWrenCharacterState().wren.mercy;
            window.wrenCharacterArc.applyDevelopmentEvent('low_model', { wrenModel: { mercy: 10 } }, 'test');
            const lowGain = window.getWrenCharacterState().wren.mercy - lowBefore;

            window.setCompanionRelationship(wren, { trust: 100, familiarity: 100 }, 'high-trust test');
            const highBefore = window.getWrenCharacterState().wren.mercy;
            window.wrenCharacterArc.applyDevelopmentEvent('high_model', { wrenModel: { mercy: 10 } }, 'test');
            const highGain = window.getWrenCharacterState().wren.mercy - highBefore;
            return { lowGain, highGain };
        });

        expect(result.lowGain).toBeGreaterThan(0);
        expect(result.highGain).toBeGreaterThan(result.lowGain);
    });

    test('betraying Hollowmere wounds Wren without teaching her to value betrayal', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getWrenCharacterState();
            window.noteWrenDispositionEvent('goblin_resolution:betrayal', {
                approval: -40,
                trust: -35,
                reason: 'test betrayal',
            });
            window.wrenCharacterArc.syncStoryInfluence();
            const after = window.getWrenCharacterState();
            return { before, after, relationship: window.getCompanionRelationship(wren) };
        });

        expect(result.after.player.personalLoyalty).toBeLessThan(result.before.player.personalLoyalty);
        expect(result.after.player.mercy).toBeLessThan(result.before.player.mercy);
        expect(result.after.wren.security).toBe(result.before.wren.security - 12);
        expect(result.after.wren.personalLoyalty).toBeGreaterThan(result.before.wren.personalLoyalty);
        expect(result.relationship.trust).toBeLessThan(result.before.influenceScale * 100); // sanity: betrayal damaged relationship too
    });

    test('different value combinations produce distinct Wren stances', async ({ page }) => {
        const result = await page.evaluate(() => {
            let arc = window.wrenCharacterArc.ensureWrenArc();
            arc.personalLoyalty = 60;
            arc.mercy = -50;
            const darkLoyal = window.wrenCharacterArc.getWrenStance();

            // getWrenStance() normalises the stored arc via ensureWrenArc(),
            // which replaces characterArc with a fresh object. Reacquire the
            // live arc before setting up the second independent scenario.
            arc = window.wrenCharacterArc.ensureWrenArc();
            arc.personalLoyalty = -50;
            arc.mercy = 60;
            const conscience = window.wrenCharacterArc.getWrenStance();
            return { darkLoyal, conscience };
        });

        expect(result.darkLoyal).toBe('us_against_the_world');
        expect(result.conscience).toBe('principled_conscience');
    });
});
