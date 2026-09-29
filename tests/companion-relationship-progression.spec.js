const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForRelationshipProgression(page) {
    await page.waitForFunction(() =>
        !!window.companionRelationships &&
        !!window.companionRelationshipProgression &&
        typeof window.noteCompanionTrustEvent === 'function'
    );
}

test.describe('Companion familiarity and trust progression', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await waitForRelationshipProgression(page);
        await page.waitForFunction(() => window.party?.some(p => p.name === 'Wren Talbot'));
        await page.evaluate(() => window.companionRelationshipProgression.refreshHooks());
    });

    test('Wren starts as an existing tavern acquaintance, not a stranger', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const relationship = window.getCompanionRelationship(wren);
            return {
                relationship,
                tier: window.companionRelationships.getTier(wren),
                revealing: window.companionRelationships.canUseRevealingControls(wren),
            };
        });

        expect(result.relationship.familiarity).toBe(35);
        expect(result.relationship.trust).toBe(25);
        expect(result.tier).toBe('familiar');
        expect(result.revealing).toBe(false);
    });

    test('a genuinely new personal conversation raises familiarity once', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionRelationship(wren).familiarity;
            const first = window.companionRelationshipProgression.noteUniqueCompanionDialogue(
                wren,
                'A relationship-regression detail Wren has never said before.'
            );
            const afterFirst = window.getCompanionRelationship(wren).familiarity;
            const second = window.companionRelationshipProgression.noteUniqueCompanionDialogue(
                wren,
                'A relationship-regression detail Wren has never said before.'
            );
            const afterSecond = window.getCompanionRelationship(wren).familiarity;
            return { before, first, afterFirst, second, afterSecond };
        });

        expect(result.first).toBe(true);
        expect(result.afterFirst).toBe(result.before + 2);
        expect(result.second).toBe(true); // hook saw valid dialogue; noteConversation itself is idempotent
        expect(result.afterSecond).toBe(result.afterFirst);
    });

    test('trust changes only once for a stable authored event key', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionRelationship(wren).trust;
            window.noteCompanionTrustEvent(wren, 'test_kept_promise', 12, 'kept a serious promise');
            const afterFirst = window.getCompanionRelationship(wren).trust;
            window.noteCompanionTrustEvent(wren, 'test_kept_promise', 12, 'kept a serious promise');
            const afterSecond = window.getCompanionRelationship(wren).trust;
            return { before, afterFirst, afterSecond };
        });

        expect(result.afterFirst).toBe(result.before + 12);
        expect(result.afterSecond).toBe(result.afterFirst);
    });

    test('shared days raise familiarity slowly but never trust', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const rel = window.companionRelationships.ensureRelationship(wren);
            rel.sharedPartyDay = 0;
            const before = window.getCompanionRelationship(wren);
            window.worldSeconds = 3 * 86400;
            window.companionRelationshipProgression.tickSharedFamiliarity();
            const after = window.getCompanionRelationship(wren);
            return { before, after };
        });

        expect(result.after.familiarity).toBe(result.before.familiarity + 3);
        expect(result.after.trust).toBe(result.before.trust);
    });

    test('passive shared-time familiarity is capped at 50', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.setCompanionRelationship(wren, { familiarity: 49, trust: 25 }, 'test setup');
            const rel = window.companionRelationships.ensureRelationship(wren);
            rel.sharedPartyDay = 0;
            window.worldSeconds = 20 * 86400;
            window.companionRelationshipProgression.tickSharedFamiliarity();
            return window.getCompanionRelationship(wren);
        });

        expect(result.familiarity).toBe(50);
        expect(result.trust).toBe(25);
    });
});