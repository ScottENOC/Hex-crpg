// tests/fenn-living-boundary.spec.js
// Focused coverage for Fenn Oakheart's first post-recruitment companion quest,
// persistent land-ethic/independence axes and relationship-sensitive aftermath.

const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

async function addFenn(page) {
    await page.evaluate(() => {
        if (window.party.some(p => p.name === 'Fenn Oakheart')) return;
        const companion = window.createCharacterData('human', 'druid', 'Fenn Oakheart', 'male', 'pc_1');
        companion.dialogueId = 'fenn_oakheart';
        companion.companionClothingBoundaries = true;
        window.party.push(companion);
        window.wireSharedInventory?.(companion);
        window.fennLivingBoundary?.refresh();
    });
    await page.waitForFunction(() => !!window.fennLivingBoundary && !!window.getCompanionRelationship && !!window.getCompanionAffinity);
}

test.describe('Fenn companion quest: The Living Boundary', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await addFenn(page);
    });

    test('Fenn gets an authored relationship start, character axes and persistent companion dialogue', async ({ page }) => {
        const state = await page.evaluate(() => {
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            window.fennLivingBoundary.ensureFennStart();
            window.fennLivingBoundary.refresh();
            return {
                relationship: window.getCompanionRelationship(fenn),
                dialogueId: fenn.dialogueId,
                hasTree: typeof window.npcDialogueTrees?.companion_fenn_oakheart === 'function',
                arc: window.fennLivingBoundary.getArcState(),
            };
        });
        expect(state.relationship.familiarity).toBe(15);
        expect(state.relationship.trust).toBe(18);
        expect(state.dialogueId).toBe('companion_fenn_oakheart');
        expect(state.hasTree).toBe(true);
        expect(state.arc.stewardship).toBe(-15);
        expect(state.arc.independence).toBe(-20);
    });

    test('normal Fenn conversation offers the changed-watercourse personal quest', async ({ page }) => {
        await page.evaluate(() => {
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            window.npcDialogueTrees.companion_fenn_oakheart(fenn);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.speaker).toContain('Fenn');
        expect(dialogue.options.some(text => text.includes('thinking about the grove'))).toBe(true);
    });

    test('ordinary route only requires hearing the farm and grove sides', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.investigateFarm();
            window.fennLivingBoundary.investigateGrove();
            return {
                changedFlow: !!q.clues.changed_flow,
                farm: !!q.clues.flooded_pasture,
                grove: !!q.clues.young_marsh,
                oldChannel: !!q.clues.old_channel,
                canResolve: window.fennLivingBoundary.canResolve(q),
            };
        });
        expect(state.changedFlow).toBe(true);
        expect(state.farm).toBe(true);
        expect(state.grove).toBe(true);
        expect(state.oldChannel).toBe(false);
        expect(state.canResolve).toBe(true);
    });

    test('Nature/Perception hydrology is useful context, not a mandatory gate', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.addClue('old_channel', 'test nature reading');
            return {
                oldChannel: !!q.clues.old_channel,
                canResolveBeforeSides: window.fennLivingBoundary.canResolve(q),
            };
        });
        expect(state.oldChannel).toBe(true);
        expect(state.canResolveBeforeSides).toBe(false);
    });

    test('managed spillway protects both interests and moves Fenn toward active stewardship and independence', async ({ page }) => {
        const result = await page.evaluate(() => {
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.investigateFarm();
            window.fennLivingBoundary.investigateGrove();
            window.fennLivingBoundary.addClue('old_channel', 'test');
            const beforeArc = window.fennLivingBoundary.getArcState();
            const beforeRel = window.getCompanionRelationship(fenn);
            window.fennLivingBoundary.completeQuest('managed_spillway');
            const q = window.questLog.find(x => x.id === 'fenn_living_boundary');
            const afterArc = window.fennLivingBoundary.getArcState();
            const afterRel = window.getCompanionRelationship(fenn);
            return {
                resolution: q.resolution,
                pastureProtected: q.pastureProtected,
                marshPreserved: q.marshPreserved,
                stewardshipDelta: afterArc.stewardship - beforeArc.stewardship,
                independenceDelta: afterArc.independence - beforeArc.independence,
                trustDelta: afterRel.trust - beforeRel.trust,
                worldState: window.campaign2WetlandState,
            };
        });
        expect(result.resolution).toBe('managed_spillway');
        expect(result.pastureProtected).toBe(true);
        expect(result.marshPreserved).toBe(true);
        expect(result.stewardshipDelta).toBe(12);
        expect(result.independenceDelta).toBe(13);
        expect(result.trustDelta).toBe(14);
        expect(result.worldState.managedFlow).toBe(true);
    });

    test('preservation and full drainage push Fenn in genuinely different directions', async ({ page }) => {
        const preserve = await page.evaluate(() => {
            window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.investigateFarm();
            window.fennLivingBoundary.investigateGrove();
            const before = window.fennLivingBoundary.getArcState();
            window.fennLivingBoundary.completeQuest('preserve_marsh');
            const after = window.fennLivingBoundary.getArcState();
            return { stewardshipDelta: after.stewardship - before.stewardship, resolution: window.fennWetlandOutcome };
        });
        expect(preserve.resolution).toBe('preserve_marsh');
        expect(preserve.stewardshipDelta).toBe(-15);

        // New page state for the opposite outcome.
        await createCharacter(page);
        await addFenn(page);
        const drain = await page.evaluate(() => {
            window.questLog = (window.questLog || []).filter(q => q.id !== 'fenn_living_boundary');
            delete window.fennWetlandOutcome;
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            fenn.fennCharacterArc = null;
            window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.investigateFarm();
            window.fennLivingBoundary.investigateGrove();
            const before = window.fennLivingBoundary.getArcState();
            window.fennLivingBoundary.completeQuest('drain_marsh');
            const after = window.fennLivingBoundary.getArcState();
            return { stewardshipDelta: after.stewardship - before.stewardship, resolution: window.fennWetlandOutcome };
        });
        expect(drain.resolution).toBe('drain_marsh');
        expect(drain.stewardshipDelta).toBe(18);
    });

    test('compensating Mac costs real gold while preserving the marsh', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.party[0];
            player.gold = 100;
            window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.investigateFarm();
            window.fennLivingBoundary.investigateGrove();
            const before = player.gold;
            const completed = window.fennLivingBoundary.completeQuest('compensate_preserve');
            const q = window.questLog.find(x => x.id === 'fenn_living_boundary');
            return { completed, goldDelta: player.gold - before, marshPreserved: q.marshPreserved, pastureProtected: q.pastureProtected };
        });
        expect(result.completed).toBe(true);
        expect(result.goldDelta).toBe(-60);
        expect(result.marshPreserved).toBe(true);
        expect(result.pastureProtected).toBe(true);
    });

    test('Fenn relationship combinations keep a consistent non-possessive voice', async ({ page }) => {
        const texts = await page.evaluate(async () => {
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            const affinity = window.companionAffinity.ensureAffinity(fenn);
            const rel = window.companionRelationships.ensureRelationship(fenn);
            const capture = () => document.querySelector('#dialogue-message')?.textContent || '';

            affinity.friendship = 20; affinity.romanticBond = 5; affinity.attraction = 70; rel.trust = 30;
            window.fennLivingBoundary.openAftermath();
            const casual = capture();

            affinity.friendship = 70; affinity.romanticBond = 10; affinity.attraction = 70; rel.trust = 50;
            window.fennLivingBoundary.openAftermath();
            const fwb = capture();

            affinity.friendship = 70; affinity.romanticBond = 55; affinity.attraction = 50; rel.trust = 60;
            window.fennLivingBoundary.openAftermath();
            const romantic = capture();

            return { casual, fwb, romantic };
        });
        expect(texts.casual).toContain('attraction');
        expect(texts.casual).toContain('honesty');
        expect(texts.fwb).toContain('We’re friends');
        expect(texts.fwb).toContain('fancy you');
        expect(texts.romantic).toContain('I care about you');
        expect(texts.romantic).toContain('fence around you');
    });

    test('completion is one-shot and cannot farm relationship gains', async ({ page }) => {
        const result = await page.evaluate(() => {
            const fenn = window.party.find(p => p.name === 'Fenn Oakheart');
            window.fennLivingBoundary.startQuest();
            window.fennLivingBoundary.investigateFarm();
            window.fennLivingBoundary.investigateGrove();
            window.fennLivingBoundary.completeQuest('managed_spillway');
            const once = window.getCompanionRelationship(fenn);
            const second = window.fennLivingBoundary.completeQuest('managed_spillway');
            const twice = window.getCompanionRelationship(fenn);
            return { once, twice, second };
        });
        expect(result.second).toBe(false);
        expect(result.twice.trust).toBe(result.once.trust);
        expect(result.twice.approval).toBe(result.once.approval);
    });
});
