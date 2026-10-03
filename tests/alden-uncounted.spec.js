// Focused coverage for Brother Alden's first post-recruitment companion quest.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function addAlden(page) {
    await page.evaluate(() => {
        if (!window.party.some(p => p.name === 'Brother Alden')) {
            const companion = window.createCharacterData('human', 'monk', 'Brother Alden', 'male', 'pc_1');
            companion.companionClothingBoundaries = true;
            window.party.push(companion);
            window.wireSharedInventory?.(companion);
        }
        window.aldenUncounted?.refresh();
        window.companionMajorQuestReactivity?.refresh();
    });
    await page.waitForFunction(() => !!window.aldenUncounted && !!window.companionMajorQuestReactivity && !!window.getCompanionRelationship && !!window.getCompanionAffinity);
}

test.describe('Brother Alden companion quest: The Uncounted', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await addAlden(page);
    });

    test('Alden starts trusting the party after Northwatch while remaining philosophically detached', async ({ page }) => {
        const state = await page.evaluate(() => {
            const alden = window.party.find(p => p.name === 'Brother Alden');
            window.aldenUncounted.ensureAldenStart();
            return {
                relationship: window.getCompanionRelationship(alden),
                arc: window.aldenUncounted.getArcState(),
                dialogueId: alden.dialogueId,
                attraction: window.getCompanionAffinity(alden).attraction,
            };
        });
        expect(state.relationship.familiarity).toBe(18);
        expect(state.relationship.trust).toBe(28);
        expect(state.arc.engagement).toBe(-20);
        expect(state.arc.particularity).toBe(-25);
        expect(state.dialogueId).toBe('companion_brother_alden');
        expect(state.attraction).toBe(0);
    });

    test('ordinary military, supply and cathedral records are enough to resolve the quest', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.aldenUncounted.startQuest();
            window.aldenUncounted.investigateCommander();
            window.aldenUncounted.investigateQuartermaster();
            window.aldenUncounted.investigateCathedral();
            return {
                title: q.title,
                memory: !!q.clues.alden_memory,
                roll: !!q.clues.garrison_roll,
                names: !!q.clues.quartermaster_names,
                cathedral: !!q.clues.cathedral_receipt,
                canResolve: window.aldenUncounted.canResolve(q),
                missingBody: window.aldenMissingNorthwatchBody,
            };
        });
        expect(state.title).toBe('The Uncounted');
        expect(state.memory).toBe(true);
        expect(state.roll).toBe(true);
        expect(state.names).toBe(true);
        expect(state.cathedral).toBe(true);
        expect(state.canResolve).toBe(true);
        expect(state.missingBody).toBe(true);
    });

    test('restoring names moves Alden toward engaged compassion and particular people', async ({ page }) => {
        const state = await page.evaluate(() => {
            const alden = window.party.find(p => p.name === 'Brother Alden');
            const q = window.aldenUncounted.startQuest();
            window.aldenUncounted.investigateCommander();
            window.aldenUncounted.investigateQuartermaster();
            window.aldenUncounted.investigateCathedral();
            const beforeArc = window.aldenUncounted.getArcState();
            const beforeRel = window.getCompanionRelationship(alden);
            window.aldenUncounted.completeQuest('restore_names');
            const afterArc = window.aldenUncounted.getArcState();
            const afterRel = window.getCompanionRelationship(alden);
            return {
                resolution: q.resolution,
                engagementDelta: afterArc.engagement - beforeArc.engagement,
                particularityDelta: afterArc.particularity - beforeArc.particularity,
                trustDelta: afterRel.trust - beforeRel.trust,
                namesRestored: q.namesRestored,
            };
        });
        expect(state.resolution).toBe('restore_names');
        expect(state.engagementDelta).toBe(16);
        expect(state.particularityDelta).toBe(18);
        expect(state.trustDelta).toBe(12);
        expect(state.namesRestored).toBe(true);
    });

    test('the missing Northwatch body becomes a necromancer breadcrumb once the hunt exists', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.aldenUncounted.startQuest();
            window.aldenUncounted.investigateCommander();
            window.aldenUncounted.investigateQuartermaster();
            window.aldenUncounted.investigateCathedral();
            window.questLog.push({ id: 'necromancer_hunt', title: "The Vessel-Seeker's Crypt", status: 'active', description: 'Find the crypt.' });
            const linked = window.companionMajorQuestReactivity.syncAldenNecromancyLink();
            const hunt = window.questLog.find(x => x.id === 'necromancer_hunt');
            return {
                linked,
                clue: !!q.clues.necromancy_parallel,
                bodyTrail: hunt.aldenBodyTrail,
                description: hunt.description,
            };
        });
        expect(state.linked).toBe(true);
        expect(state.clue).toBe(true);
        expect(state.bodyTrail).toBe(true);
        expect(state.description).toContain('Northwatch');
    });

    test('Wren advice remembers whether the player restored her parents names', async ({ page }) => {
        const text = await page.evaluate(() => {
            const wren = window.createCharacterData('human', 'rogue', 'Wren Talbot', 'female', 'pc_2');
            window.party.push(wren);
            window.questLog.push({ id: 'wren_parents', status: 'completed', resolution: 'restore_names' });
            return window.aldenUncounted.companionViewLines().find(x => x.name === 'Wren Talbot')?.text || '';
        });
        expect(text).toContain('parents');
        expect(text).toContain('names');
    });

    test('Alden can reach romantic intimacy while attraction remains hard zero', async ({ page }) => {
        const state = await page.evaluate(() => {
            const alden = window.party.find(p => p.name === 'Brother Alden');
            const affinity = window.companionAffinity.ensureAffinity(alden);
            const rel = window.companionRelationships.ensureRelationship(alden);
            affinity.friendship = 70;
            affinity.romanticBond = 65;
            affinity.attraction = 0;
            rel.trust = 70;
            return {
                mode: window.aldenUncounted.aftermathMode(),
                attraction: window.getCompanionAffinity(alden).attraction,
                romanticBond: window.getCompanionAffinity(alden).romanticBond,
            };
        });
        expect(state.mode).toBe('romantic');
        expect(state.attraction).toBe(0);
        expect(state.romanticBond).toBe(65);
    });

    test('quest completion is one-shot', async ({ page }) => {
        const state = await page.evaluate(() => {
            const alden = window.party.find(p => p.name === 'Brother Alden');
            window.aldenUncounted.startQuest();
            window.aldenUncounted.investigateCommander();
            window.aldenUncounted.investigateQuartermaster();
            window.aldenUncounted.investigateCathedral();
            window.aldenUncounted.completeQuest('quiet_memorial');
            const once = window.getCompanionRelationship(alden);
            const second = window.aldenUncounted.completeQuest('restore_names');
            const twice = window.getCompanionRelationship(alden);
            return { second, once, twice };
        });
        expect(state.second).toBe(false);
        expect(state.twice.trust).toBe(state.once.trust);
    });
});