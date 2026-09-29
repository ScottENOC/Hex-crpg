// Focused coverage for cross-companion / main-quest reactivity.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function addCompanion(page, race, cls, name, gender, id) {
    await page.evaluate(({ race, cls, name, gender, id }) => {
        if (!window.party.some(p => p.name === name)) {
            const companion = window.createCharacterData(race, cls, name, gender, id);
            companion.companionClothingBoundaries = true;
            window.party.push(companion);
            window.wireSharedInventory?.(companion);
        }
        window.companionRelationships?.ensureRelationship?.(window.party.find(p => p.name === name));
        window.companionAffinity?.ensureAffinity?.(window.party.find(p => p.name === name));
    }, { race, cls, name, gender, id });
}

test.describe('Companion major quest reactivity', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await addCompanion(page, 'human', 'cleric', 'Ser Aldric Thorne', 'male', 'pc_2');
        await addCompanion(page, 'elf', 'wizard', 'Mirabel Quill', 'female', 'pc_3');
        await page.waitForFunction(() => !!window.companionMajorQuestReactivity && !!window.aldricBrokenVigil && !!window.mirabelUnquietConcordance);
    });

    test('Aldric necromancer advice remembers how The Broken Vigil ended', async ({ page }) => {
        const lines = await page.evaluate(() => {
            window.questLog.push({ id: 'aldric_broken_vigil', status: 'completed', resolution: 'spare_patrol' });
            return window.companionMajorQuestReactivity.counselLines('hunt');
        });
        const aldric = lines.find(x => x.name === 'Ser Aldric Thorne');
        expect(aldric).toBeTruthy();
        expect(aldric.text).toContain('coerced');
        expect(aldric.text).toContain('mistake once already');
    });

    test('Mirabel active Concordance quest automatically recognises the Vessel-Seeker parallel', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.mirabelUnquietConcordance.startQuest();
            window.questLog.push({ id: 'necromancer_hunt', title: "The Vessel-Seeker's Crypt", status: 'active' });
            window.companionMajorQuestReactivity.syncMirabelNecromancyLink();
            return {
                hasParallel: !!q.clues.cult_parallel,
                source: q.clues.cult_parallel?.source || null,
            };
        });
        expect(state.hasParallel).toBe(true);
        expect(state.source).toContain('Vessel-Seeker');
    });

    test('Mirabel counsel changes with her Concordance resolution', async ({ page }) => {
        const texts = await page.evaluate(() => {
            const q = window.mirabelUnquietConcordance.startQuest();
            window.mirabelUnquietConcordance.obtainRestrictedAppendix('test');
            window.mirabelUnquietConcordance.completeQuest('destroy_appendix');
            const cautious = window.companionMajorQuestReactivity.counselLines('hunt').find(x => x.name === 'Mirabel Quill')?.text || '';

            // Reset only the authored outcome/arc fields needed for the alternate
            // branch. This is a deterministic dialogue test, not a save-flow test.
            q.resolution = 'experiment';
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            mirabel.mirabelCharacterArc.restraint = -40;
            window.mirabelEchoTechniqueLearned = true;
            const experimental = window.companionMajorQuestReactivity.counselLines('hunt').find(x => x.name === 'Mirabel Quill')?.text || '';
            return { cautious, experimental };
        });
        expect(texts.cautious).toContain('dangerous part will look clever');
        expect(texts.experimental).toContain('I want to see the ritual');
    });

    test('Captain Rennick necromancer offer gains a party-counsel option', async ({ page }) => {
        const labels = await page.evaluate(() => {
            const options = [{ label: "I'll find it and end this.", action: () => {} }, { label: 'Not yet.', action: () => {} }];
            return window.companionMajorQuestReactivity.appendCounselOption(
                { name: 'Captain Ilsa Rennick' },
                "That disciple was one thread. Whatever she served isn't done — there are crypts north of here.",
                options
            ).map(x => x.label);
        });
        expect(labels).toContain('Ask the companions what they make of this.');
    });

    test('Ashgrave parley gives companions a chance to warn the player before lichdom', async ({ page }) => {
        const labels = await page.evaluate(() => {
            const options = [{ label: 'Join you. Teach me what you know.', action: () => {} }, { label: 'Then we fight.', action: () => {} }];
            return window.companionMajorQuestReactivity.appendCounselOption(
                { name: 'Corvin Ashgrave, the Lich', isLichBoss: true },
                'Ashgrave does not lower his blade. "Say what you actually want."',
                options
            ).map(x => x.label);
        });
        expect(labels).toContain('Look to your companions before answering.');
    });

    test('companions who actually clear the Vessel-Seeker crypt remember it once', async ({ page }) => {
        const result = await page.evaluate(() => {
            const aldric = window.party.find(p => p.name === 'Ser Aldric Thorne');
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            window.questLog.push({ id: 'necromancer_hunt', title: "The Vessel-Seeker's Crypt", status: 'completed' });
            const beforeA = window.getCompanionRelationship(aldric);
            const beforeM = window.getCompanionRelationship(mirabel);
            const first = window.companionMajorQuestReactivity.applyHuntCompletionReactivity();
            const afterA = window.getCompanionRelationship(aldric);
            const afterM = window.getCompanionRelationship(mirabel);
            const q = window.questLog.find(x => x.id === 'necromancer_hunt');
            const second = window.companionMajorQuestReactivity.applyHuntCompletionReactivity();
            const twiceA = window.getCompanionRelationship(aldric);
            return {
                first, second,
                aldricTrustDelta: afterA.trust - beforeA.trust,
                mirabelTrustDelta: afterM.trust - beforeM.trust,
                witnessAldric: q.companionWitnesses.includes('Ser Aldric Thorne'),
                witnessMirabel: q.companionWitnesses.includes('Mirabel Quill'),
                trustAfterSecond: twiceA.trust,
                trustAfterFirst: afterA.trust,
            };
        });
        expect(result.first).toBe(true);
        expect(result.second).toBe(false);
        expect(result.aldricTrustDelta).toBe(7);
        expect(result.mirabelTrustDelta).toBe(5);
        expect(result.witnessAldric).toBe(true);
        expect(result.witnessMirabel).toBe(true);
        expect(result.trustAfterSecond).toBe(result.trustAfterFirst);
    });
});