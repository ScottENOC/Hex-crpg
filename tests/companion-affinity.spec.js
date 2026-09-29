const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForAffinity(page) {
    await page.waitForFunction(() => {
        const wren = window.party?.find(p => p.name === 'Wren Talbot');
        return !!wren && !!window.companionAffinity && !!window.getCompanionAffinity;
    });
}

test.describe('companion affinity', () => {
    test('Wren has a high masculine attraction cap', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForAffinity(page);
        const state = await page.evaluate(() => window.getCompanionAffinity('Wren Talbot'));

        expect(state.orientationLabel).toBe('straight');
        expect(state.presentation).toBe('masculine');
        expect(state.attractionCap).toBe(100);
        expect(state.romanticCap).toBe(100);
        expect(state.friendship).toBe(38);
        expect(state.attraction).toBe(18);
        expect(state.canDevelopPhysicalInterest).toBe(true);
    });

    test('a feminine protagonist can build deep romance but cannot overwrite Wren physical orientation', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForAffinity(page);

        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.adjustCompanionAffinity(wren, { friendship: 200, romanticBond: 200, attraction: 200 }, 'test');
            window.setCompanionRelationship(wren, { familiarity: 70, trust: 70 }, 'test');
            return {
                affinity: window.getCompanionAffinity(wren),
                readiness: window.getCompanionRomanceReadiness(wren),
            };
        });

        expect(result.affinity.presentation).toBe('feminine');
        expect(result.affinity.friendship).toBe(100);
        expect(result.affinity.romanticBond).toBe(85);
        expect(result.affinity.attraction).toBe(30);
        expect(result.affinity.attractionCap).toBe(30);
        expect(result.affinity.romanticCap).toBe(85);
        expect(result.readiness.romanticConversationPossible).toBe(true);
        expect(result.readiness.physicalPathPossible).toBe(false);
        expect(result.readiness.physicallyInterested).toBe(false);
    });

    test('pronouns do not determine attraction while explicit body presentation does', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForAffinity(page);

        const result = await page.evaluate(() => {
            const pc = window.party[0];
            pc.pronouns = { subject: 'she', object: 'her', possessive: 'her' };
            const pronounsOnly = window.companionAffinity.compatibilityFor('Wren Talbot', pc);
            pc.bodyPresentation = 'feminine';
            const explicitPresentation = window.companionAffinity.compatibilityFor('Wren Talbot', pc);
            return { pronounsOnly, explicitPresentation };
        });

        expect(result.pronounsOnly.presentation).toBe('masculine');
        expect(result.pronounsOnly.attractionCap).toBe(100);
        expect(result.explicitPresentation.presentation).toBe('feminine');
        expect(result.explicitPresentation.attractionCap).toBe(30);
    });

    test('story affinity is idempotent', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForAffinity(page);

        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionAffinity(wren);
            window.hollowmereEventFired = true;
            window.resolveShakedown('fight');
            window.companionAffinity.syncWrenStoryAffinity();
            const once = window.getCompanionAffinity(wren);
            window.companionAffinity.syncWrenStoryAffinity();
            const twice = window.getCompanionAffinity(wren);
            return { before, once, twice };
        });

        expect(result.once.friendship).toBeGreaterThan(result.before.friendship);
        expect(result.once.attraction).toBeGreaterThan(result.before.attraction);
        expect(result.twice.friendship).toBe(result.once.friendship);
        expect(result.twice.attraction).toBe(result.once.attraction);
    });

    test('skill taste gives small one-shot attraction milestones', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForAffinity(page);

        const result = await page.evaluate(() => {
            const pc = window.party[0];
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionAffinity(wren).attraction;
            pc.skills = pc.skills || {};
            pc.skills.meleeDamage = 3;
            window.companionAffinity.syncSkillAttraction(wren);
            const once = window.getCompanionAffinity(wren).attraction;
            window.companionAffinity.syncSkillAttraction(wren);
            const twice = window.getCompanionAffinity(wren).attraction;
            return { before, once, twice };
        });

        expect(result.once).toBeGreaterThan(result.before);
        expect(result.twice).toBe(result.once);
    });
});
