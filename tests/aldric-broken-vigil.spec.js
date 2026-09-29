// tests/aldric-broken-vigil.spec.js
// Focused coverage for Ser Aldric Thorne's first post-recruitment personal
// quest. These tests use the exposed quest API for deterministic story-state
// checks and one dialogue assertion to ensure the quest is actually reachable
// from normal companion conversation.

const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

async function addAldric(page) {
    await page.evaluate(() => {
        if (window.party.some(p => p.name === 'Ser Aldric Thorne')) return;
        const companion = window.createCharacterData('human', 'fighter', 'Ser Aldric Thorne', 'male', 'pc_1');
        companion.dialogueId = 'companion_ser_aldric';
        companion.companionClothingBoundaries = true;
        window.party.push(companion);
        window.wireSharedInventory?.(companion);
        window.aldricBrokenVigil?.refresh();
    });
    await page.waitForFunction(() => !!window.aldricBrokenVigil && !!window.getCompanionRelationship);
}

test.describe('Aldric companion quest: The Broken Vigil', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await addAldric(page);
    });

    test('rescue-style authored relationship start gives more trust than familiarity', async ({ page }) => {
        const state = await page.evaluate(() => {
            const aldric = window.party.find(p => p.name === 'Ser Aldric Thorne');
            window.aldricBrokenVigil.ensureAldricStart();
            return window.getCompanionRelationship(aldric);
        });

        expect(state.familiarity).toBe(18);
        expect(state.trust).toBe(30);
        expect(state.approval).toBe(60);
    });

    test('normal Aldric companion dialogue offers the personal quest', async ({ page }) => {
        await page.evaluate(() => {
            const aldric = window.party.find(p => p.name === 'Ser Aldric Thorne');
            window.npcDialogueTrees.companion_ser_aldric(aldric);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.speaker).toContain('Aldric');
        expect(dialogue.options.some(text => text.includes('company that left you'))).toBe(true);
    });

    test('ordinary Company and Baron records are enough to solve the mystery', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.aldricBrokenVigil.startQuest();
            window.aldricBrokenVigil.addClue('company_roster', 'test Company archive');
            window.aldricBrokenVigil.addClue('baron_customs', 'test Baron archive');
            const q = window.questLog.find(entry => entry.id === 'aldric_broken_vigil');
            return {
                clueCount: window.aldricBrokenVigil.clueCount(q),
                enough: window.aldricBrokenVigil.hasEnoughEvidence(q),
                status: q.status,
            };
        });

        expect(result.clueCount).toBe(2);
        expect(result.enough).toBe(true);
        expect(result.status).toBe('active');
    });

    test('the signed dispatch is a skill/faction shortcut rather than a mandatory clue', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.aldricBrokenVigil.startQuest();
            window.aldricBrokenVigil.addClue('sealed_dispatch', 'test signed order');
            const q = window.questLog.find(entry => entry.id === 'aldric_broken_vigil');
            return {
                enough: window.aldricBrokenVigil.hasEnoughEvidence(q),
                count: window.aldricBrokenVigil.clueCount(q),
            };
        });

        expect(result.count).toBe(1);
        expect(result.enough).toBe(true);
    });

    test('sparing the patrol rewards trust and friendship without blaming rank-and-file soldiers', async ({ page }) => {
        const result = await page.evaluate(() => {
            const aldric = window.party.find(p => p.name === 'Ser Aldric Thorne');
            window.aldricBrokenVigil.startQuest();
            window.aldricBrokenVigil.addClue('company_roster', 'test');
            window.aldricBrokenVigil.addClue('baron_customs', 'test');
            const beforeRel = window.getCompanionRelationship(aldric);
            const beforeAffinity = window.getCompanionAffinity(aldric);
            window.aldricBrokenVigil.completeQuest('spare_patrol');
            const q = window.questLog.find(entry => entry.id === 'aldric_broken_vigil');
            const afterRel = window.getCompanionRelationship(aldric);
            const afterAffinity = window.getCompanionAffinity(aldric);
            return {
                resolution: q.resolution,
                rankAndFileSpared: q.rankAndFileSpared,
                trustDelta: afterRel.trust - beforeRel.trust,
                familiarityDelta: afterRel.familiarity - beforeRel.familiarity,
                friendshipDelta: afterAffinity.friendship - beforeAffinity.friendship,
            };
        });

        expect(result.resolution).toBe('spare_patrol');
        expect(result.rankAndFileSpared).toBe(true);
        expect(result.trustDelta).toBe(12);
        expect(result.familiarityDelta).toBe(5);
        expect(result.friendshipDelta).toBeGreaterThan(0);
    });

    test('burying the evidence pays gold but damages Aldric relationship', async ({ page }) => {
        const result = await page.evaluate(() => {
            const aldric = window.party.find(p => p.name === 'Ser Aldric Thorne');
            window.aldricBrokenVigil.startQuest();
            window.aldricBrokenVigil.addClue('company_roster', 'test');
            window.aldricBrokenVigil.addClue('baron_customs', 'test');
            const beforeGold = window.party[0].gold || 0;
            const beforeRel = window.getCompanionRelationship(aldric);
            const beforeAffinity = window.getCompanionAffinity(aldric);
            window.aldricBrokenVigil.completeQuest('buried_for_money');
            const afterRel = window.getCompanionRelationship(aldric);
            const afterAffinity = window.getCompanionAffinity(aldric);
            const q = window.questLog.find(entry => entry.id === 'aldric_broken_vigil');
            return {
                goldDelta: (window.party[0].gold || 0) - beforeGold,
                trustDelta: afterRel.trust - beforeRel.trust,
                friendshipDelta: afterAffinity.friendship - beforeAffinity.friendship,
                evidenceBuried: q.evidenceBuried,
            };
        });

        expect(result.goldDelta).toBe(120);
        expect(result.trustDelta).toBe(-15);
        expect(result.friendshipDelta).toBeLessThan(0);
        expect(result.evidenceBuried).toBe(true);
    });

    test('completion is one-shot and cannot be farmed', async ({ page }) => {
        const result = await page.evaluate(() => {
            const aldric = window.party.find(p => p.name === 'Ser Aldric Thorne');
            window.aldricBrokenVigil.startQuest();
            window.aldricBrokenVigil.addClue('sealed_dispatch', 'test');
            window.aldricBrokenVigil.completeQuest('public_accountability');
            const once = window.getCompanionRelationship(aldric);
            const second = window.aldricBrokenVigil.completeQuest('public_accountability');
            const twice = window.getCompanionRelationship(aldric);
            return { once, twice, second };
        });

        expect(result.second).toBe(false);
        expect(result.twice.trust).toBe(result.once.trust);
        expect(result.twice.approval).toBe(result.once.approval);
    });
});
