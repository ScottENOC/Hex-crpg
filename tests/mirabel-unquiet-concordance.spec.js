// tests/mirabel-unquiet-concordance.spec.js
// Focused coverage for Mirabel Quill's first post-recruitment companion quest,
// character-development axes and relationship-sensitive aftermath modes.

const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

async function addMirabel(page) {
    await page.evaluate(() => {
        if (window.party.some(p => p.name === 'Mirabel Quill')) return;
        const companion = window.createCharacterData('elf', 'wizard', 'Mirabel Quill', 'female', 'pc_1');
        companion.companionClothingBoundaries = true;
        window.party.push(companion);
        window.wireSharedInventory?.(companion);
        window.mirabelUnquietConcordance?.refresh();
    });
    await page.waitForFunction(() => !!window.mirabelUnquietConcordance && !!window.getCompanionRelationship && !!window.getCompanionAffinity);
}

test.describe('Mirabel companion quest: The Unquiet Concordance', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await addMirabel(page);
    });

    test('Mirabel gets an authored post-recruitment relationship start and companion dialogue tree', async ({ page }) => {
        const state = await page.evaluate(() => {
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            window.mirabelUnquietConcordance.ensureMirabelStart();
            window.mirabelUnquietConcordance.refresh();
            return {
                relationship: window.getCompanionRelationship(mirabel),
                dialogueId: mirabel.dialogueId,
                hasTree: typeof window.npcDialogueTrees?.companion_mirabel_quill === 'function',
                arc: window.mirabelUnquietConcordance.getArcState(),
            };
        });

        expect(state.relationship.familiarity).toBe(14);
        expect(state.relationship.trust).toBe(16);
        expect(state.dialogueId).toBe('companion_mirabel_quill');
        expect(state.hasTree).toBe(true);
        expect(state.arc.restraint).toBe(-20);
        expect(state.arc.rootedness).toBe(-25);
    });

    test('normal Mirabel conversation offers the book that motivated her recruitment', async ({ page }) => {
        await page.evaluate(() => {
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            window.npcDialogueTrees.companion_mirabel_quill(mirabel);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.speaker).toContain('Mirabel');
        expect(dialogue.options.some(text => text.includes('book from the spider ruin'))).toBe(true);
    });

    test('starting the quest carries the spider-ruin folio forward instead of inventing a new inciting object', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.mirabelUnquietConcordance.startQuest();
            return {
                title: q.title,
                hasFolio: !!q.clues.ruin_folio,
                count: window.mirabelUnquietConcordance.clueCount(q),
            };
        });
        expect(state.title).toBe('The Unquiet Concordance');
        expect(state.hasFolio).toBe(true);
        expect(state.count).toBe(1);
    });

    test('ordinary dealer plus court archive route reaches the restricted appendix without specialist skills', async ({ page }) => {
        const state = await page.evaluate(() => {
            window.mirabelUnquietConcordance.startQuest();
            window.mirabelUnquietConcordance.recordDealerProvenance();
            window.mirabelUnquietConcordance.recordCourtCatalogue();
            const q = window.questLog.find(x => x.id === 'mirabel_unquiet_concordance');
            const ordinaryReady = window.mirabelUnquietConcordance.ordinaryArchiveReady(q);
            window.mirabelUnquietConcordance.obtainRestrictedAppendix('test supervised archive');
            return {
                ordinaryReady,
                canResolve: window.mirabelUnquietConcordance.canResolve(q),
                hasAppendix: !!q.clues.restricted_appendix,
            };
        });
        expect(state.ordinaryReady).toBe(true);
        expect(state.hasAppendix).toBe(true);
        expect(state.canResolve).toBe(true);
    });

    test('preserving the appendix under restriction moves Mirabel toward responsible scholarship and builds trust', async ({ page }) => {
        const result = await page.evaluate(() => {
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            window.mirabelUnquietConcordance.startQuest();
            window.mirabelUnquietConcordance.obtainRestrictedAppendix('test');
            const beforeArc = window.mirabelUnquietConcordance.getArcState();
            const beforeRel = window.getCompanionRelationship(mirabel);
            window.mirabelUnquietConcordance.completeQuest('preserve_sealed');
            const q = window.questLog.find(x => x.id === 'mirabel_unquiet_concordance');
            const afterArc = window.mirabelUnquietConcordance.getArcState();
            const afterRel = window.getCompanionRelationship(mirabel);
            return {
                resolution: q.resolution,
                restraintDelta: afterArc.restraint - beforeArc.restraint,
                trustDelta: afterRel.trust - beforeRel.trust,
                policy: q.archivePolicy,
            };
        });
        expect(result.resolution).toBe('preserve_sealed');
        expect(result.restraintDelta).toBe(16);
        expect(result.trustDelta).toBe(10);
        expect(result.policy).toBe('sealed_copy');
    });

    test('destroying dangerous pages can reduce approval while still increasing trust', async ({ page }) => {
        const result = await page.evaluate(() => {
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            window.mirabelUnquietConcordance.startQuest();
            window.mirabelUnquietConcordance.obtainRestrictedAppendix('test');
            const before = window.getCompanionRelationship(mirabel);
            window.mirabelUnquietConcordance.completeQuest('destroy_appendix');
            const after = window.getCompanionRelationship(mirabel);
            const q = window.questLog.find(x => x.id === 'mirabel_unquiet_concordance');
            return {
                approvalDelta: after.approval - before.approval,
                trustDelta: after.trust - before.trust,
                destroyed: q.appendixDestroyed,
                arc: window.mirabelUnquietConcordance.getArcState(),
            };
        });
        expect(result.approvalDelta).toBe(-5);
        expect(result.trustDelta).toBe(4);
        expect(result.destroyed).toBe(true);
        expect(result.arc.restraint).toBeGreaterThan(-20);
    });

    test('testing the echo method makes Mirabel more curiosity-first and records a future technique hook', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.mirabelUnquietConcordance.startQuest();
            window.mirabelUnquietConcordance.obtainRestrictedAppendix('test');
            const before = window.mirabelUnquietConcordance.getArcState();
            window.mirabelUnquietConcordance.completeQuest('experiment');
            const after = window.mirabelUnquietConcordance.getArcState();
            return {
                restraintDelta: after.restraint - before.restraint,
                learned: !!window.mirabelEchoTechniqueLearned,
            };
        });
        expect(result.restraintDelta).toBe(-28);
        expect(result.learned).toBe(true);
    });

    test('relationship combinations produce different Mirabel aftermath modes', async ({ page }) => {
        const modes = await page.evaluate(() => {
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            let affinity = window.companionAffinity.ensureAffinity(mirabel);
            const rel = window.companionRelationships.ensureRelationship(mirabel);

            affinity.friendship = 20;
            affinity.romanticBond = 5;
            affinity.attraction = 70;
            rel.trust = 30;
            const casual = window.mirabelUnquietConcordance.aftermathMode();

            // aftermathMode() reads a normalised affinity snapshot, and that
            // normalisation replaces companion.playerAffinity. Reacquire the
            // live canonical state before setting up each independent case.
            affinity = window.companionAffinity.ensureAffinity(mirabel);
            affinity.friendship = 70;
            affinity.romanticBond = 10;
            affinity.attraction = 70;
            const fwb = window.mirabelUnquietConcordance.aftermathMode();

            affinity = window.companionAffinity.ensureAffinity(mirabel);
            affinity.friendship = 70;
            affinity.romanticBond = 55;
            affinity.attraction = 40;
            rel.trust = 60;
            const romantic = window.mirabelUnquietConcordance.aftermathMode();

            affinity = window.companionAffinity.ensureAffinity(mirabel);
            affinity.friendship = 65;
            affinity.romanticBond = 5;
            affinity.attraction = 10;
            const closeFriend = window.mirabelUnquietConcordance.aftermathMode();

            return { casual, fwb, romantic, closeFriend };
        });
        expect(modes.casual).toBe('casual');
        expect(modes.fwb).toBe('friends_with_benefits');
        expect(modes.romantic).toBe('romantic');
        expect(modes.closeFriend).toBe('close_friend');
    });

    test('quest completion is one-shot and cannot farm relationship gains', async ({ page }) => {
        const result = await page.evaluate(() => {
            const mirabel = window.party.find(p => p.name === 'Mirabel Quill');
            window.mirabelUnquietConcordance.startQuest();
            window.mirabelUnquietConcordance.obtainRestrictedAppendix('test');
            window.mirabelUnquietConcordance.completeQuest('preserve_open');
            const once = window.getCompanionRelationship(mirabel);
            const second = window.mirabelUnquietConcordance.completeQuest('preserve_open');
            const twice = window.getCompanionRelationship(mirabel);
            return { once, twice, second };
        });
        expect(result.second).toBe(false);
        expect(result.twice.trust).toBe(result.once.trust);
        expect(result.twice.approval).toBe(result.once.approval);
    });
});
