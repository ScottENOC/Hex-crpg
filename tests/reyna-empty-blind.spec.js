// Focused coverage for Reyna Fletcher's first post-recruitment companion quest.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function addReyna(page) {
    await page.evaluate(() => {
        if (!window.party.some(p => p.name === 'Reyna Fletcher')) {
            const companion = window.createCharacterData('human', 'fighter', 'Reyna Fletcher', 'female', 'pc_1');
            companion.companionClothingBoundaries = true;
            window.party.push(companion);
            window.wireSharedInventory?.(companion);
        }
        window.reynaEmptyBlind?.refresh();
    });
    await page.waitForFunction(() => !!window.reynaEmptyBlind && !!window.getCompanionRelationship && !!window.getCompanionAffinity);
}

async function seedBorderContext(page) {
    await page.evaluate(() => {
        window.questLog = window.questLog || [];
        if (!window.questLog.some(q => q.id === 'eyes_on_border')) {
            window.questLog.push({ id: 'eyes_on_border', title: 'Eyes on the Border', status: 'completed' });
        }
    });
}

test.describe('Reyna companion quest: The Empty Blind', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await addReyna(page);
        await seedBorderContext(page);
    });

    test('Reyna starts as a capable acquaintance who still defaults to working alone', async ({ page }) => {
        const state = await page.evaluate(() => {
            const reyna = window.party.find(p => p.name === 'Reyna Fletcher');
            window.reynaEmptyBlind.ensureReynaStart();
            return {
                relationship: window.getCompanionRelationship(reyna),
                arc: window.reynaEmptyBlind.getArcState(),
                dialogueId: reyna.dialogueId,
            };
        });
        expect(state.relationship.familiarity).toBe(16);
        expect(state.relationship.trust).toBe(20);
        expect(state.arc.interdependence).toBe(-25);
        expect(state.arc.institutionalTrust).toBe(-20);
        expect(state.dialogueId).toBe('companion_reyna_fletcher');
    });

    test('the quest grows from existing border content and starts with Reyna recognising the fletching', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.reynaEmptyBlind.startQuest();
            return {
                title: q.title,
                borderReady: window.reynaEmptyBlind.borderContext().ready,
                fletching: !!q.clues.frontier_fletching,
            };
        });
        expect(state.title).toBe('The Empty Blind');
        expect(state.borderReady).toBe(true);
        expect(state.fletching).toBe(true);
    });

    test('ordinary Northwatch records are sufficient to find and confront Tamsin', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.reynaEmptyBlind.startQuest();
            window.reynaEmptyBlind.investigateQuartermaster();
            window.reynaEmptyBlind.investigateCommander();
            const before = window.reynaEmptyBlind.canConfront(q);
            window.reynaEmptyBlind.confrontTamsin();
            return {
                before,
                coercion: !!q.clues.coercion,
                canResolve: window.reynaEmptyBlind.canResolve(q),
            };
        });
        expect(state.before).toBe(true);
        expect(state.coercion).toBe(true);
        expect(state.canResolve).toBe(true);
    });

    test('protecting the trackers as witnesses moves Reyna toward shared burden and conditional institutional trust', async ({ page }) => {
        const state = await page.evaluate(() => {
            const reyna = window.party.find(p => p.name === 'Reyna Fletcher');
            const q = window.reynaEmptyBlind.startQuest();
            window.reynaEmptyBlind.investigateQuartermaster();
            window.reynaEmptyBlind.investigateCommander();
            window.reynaEmptyBlind.confrontTamsin();
            const beforeArc = window.reynaEmptyBlind.getArcState();
            const beforeRel = window.getCompanionRelationship(reyna);
            window.reynaEmptyBlind.completeQuest('witness_deal');
            const afterArc = window.reynaEmptyBlind.getArcState();
            const afterRel = window.getCompanionRelationship(reyna);
            return {
                resolution: q.resolution,
                interdependenceDelta: afterArc.interdependence - beforeArc.interdependence,
                institutionalDelta: afterArc.institutionalTrust - beforeArc.institutionalTrust,
                trustDelta: afterRel.trust - beforeRel.trust,
                protected: q.trackersProtected,
            };
        });
        expect(state.resolution).toBe('witness_deal');
        expect(state.interdependenceDelta).toBe(15);
        expect(state.institutionalDelta).toBe(12);
        expect(state.trustDelta).toBe(12);
        expect(state.protected).toBe(true);
    });

    test('an off-book double-agent scheme reinforces Reyna institutional distrust', async ({ page }) => {
        const state = await page.evaluate(() => {
            const q = window.reynaEmptyBlind.startQuest();
            window.reynaEmptyBlind.investigateQuartermaster();
            window.reynaEmptyBlind.investigateCommander();
            window.reynaEmptyBlind.confrontTamsin();
            const before = window.reynaEmptyBlind.getArcState();
            window.reynaEmptyBlind.completeQuest('double_agent');
            const after = window.reynaEmptyBlind.getArcState();
            return {
                institutionalDelta: after.institutionalTrust - before.institutionalTrust,
                interdependenceDelta: after.interdependence - before.interdependence,
                doubleAgents: q.doubleAgents,
            };
        });
        expect(state.institutionalDelta).toBe(-12);
        expect(state.interdependenceDelta).toBe(-4);
        expect(state.doubleAgents).toBe(true);
    });

    test('Aldric advice in Reyna quest remembers The Broken Vigil outcome', async ({ page }) => {
        const text = await page.evaluate(() => {
            const aldric = window.createCharacterData('human', 'cleric', 'Ser Aldric Thorne', 'male', 'pc_2');
            window.party.push(aldric);
            window.questLog.push({ id: 'aldric_broken_vigil', status: 'completed', resolution: 'spare_patrol' });
            return window.reynaEmptyBlind.companionViewLines().find(x => x.name === 'Ser Aldric Thorne')?.text || '';
        });
        expect(text).toContain('captured');
        expect(text).toContain('accountable');
    });

    test('relationship combinations produce Reyna-specific casual, FWB, romantic and friend modes', async ({ page }) => {
        const modes = await page.evaluate(() => {
            const reyna = window.party.find(p => p.name === 'Reyna Fletcher');
            const affinity = window.companionAffinity.ensureAffinity(reyna);
            const rel = window.companionRelationships.ensureRelationship(reyna);

            affinity.friendship = 20; affinity.romanticBond = 5; affinity.attraction = 75; rel.trust = 30;
            const casual = window.reynaEmptyBlind.aftermathMode();
            affinity.friendship = 70; affinity.romanticBond = 10; affinity.attraction = 75;
            const fwb = window.reynaEmptyBlind.aftermathMode();
            affinity.friendship = 65; affinity.romanticBond = 55; affinity.attraction = 75; rel.trust = 60;
            const romantic = window.reynaEmptyBlind.aftermathMode();
            affinity.friendship = 60; affinity.romanticBond = 5; affinity.attraction = 10;
            const closeFriend = window.reynaEmptyBlind.aftermathMode();
            return { casual, fwb, romantic, closeFriend };
        });
        expect(modes.casual).toBe('casual');
        expect(modes.fwb).toBe('friends_with_benefits');
        expect(modes.romantic).toBe('romantic');
        expect(modes.closeFriend).toBe('close_friend');
    });

    test('quest completion is one-shot', async ({ page }) => {
        const state = await page.evaluate(() => {
            const reyna = window.party.find(p => p.name === 'Reyna Fletcher');
            window.reynaEmptyBlind.startQuest();
            window.reynaEmptyBlind.investigateQuartermaster();
            window.reynaEmptyBlind.investigateCommander();
            window.reynaEmptyBlind.confrontTamsin();
            window.reynaEmptyBlind.completeQuest('turn_in');
            const once = window.getCompanionRelationship(reyna);
            const second = window.reynaEmptyBlind.completeQuest('turn_in');
            const twice = window.getCompanionRelationship(reyna);
            return { second, once, twice };
        });
        expect(state.second).toBe(false);
        expect(state.twice.trust).toBe(state.once.trust);
    });
});