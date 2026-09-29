const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForInvestigation(page) {
    await page.waitForFunction(() => {
        const wren = window.party?.find(p => p.name === 'Wren Talbot');
        return !!wren &&
            !!window.wrenParentsInvestigation &&
            !!window.companionRelationshipProgression &&
            !!window.npcDialogueTrees?.petra_hollis?.__wrenParentsAware;
    });
}

test.describe('Wren parents investigation', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await waitForInvestigation(page);
    });

    test('the Millbrook promise starts The Long Silence when Wren arrives', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.companionRelationshipProgression.promiseWrenParentSearch();
            const center = window.campaign2MillbrookCenter;
            const playerEntity = window.entities.find(e => e.side === 'player' && !e.rider);
            if (center && playerEntity) playerEntity.hex = { ...center };
            window.companionRelationshipProgression.checkWrenStoryState();
            window.wrenParentsInvestigation.refreshHooks();
            const quest = window.questLog.find(q => q.id === 'wren_parents');
            return {
                reached: !!wren.wrenParentsReachedMillbrook,
                title: quest?.title,
                status: quest?.status,
            };
        });

        expect(result.reached).toBe(true);
        expect(result.title).toBe('The Long Silence');
        expect(result.status).toBe('active');
    });

    test('ordinary investigation remains solvable without specialist skills', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.wrenParentsInvestigation;
            api.ensureQuest();
            api.addClue('petra_memory', 'test');
            api.addClue('village_gossip', 'test');
            api.addClue('chapel_register', 'test');
            api.addClue('north_switchback', 'test');
            return {
                count: api.clueCount(),
                required: api.minCluesToResolve,
                quest: window.questLog.find(q => q.id === 'wren_parents'),
            };
        });

        expect(result.count).toBe(4);
        expect(result.required).toBe(4);
        expect(result.quest.description).toContain('enough evidence');
    });

    test('knowledge, perception, insight and stealth expose parallel routes', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.party[0];
            player.skills = player.skills || {};
            player.skills.insight = 1;
            player.skills.keen_perception = 1;
            player.skills.stealth_rogue = 1;
            player.skills.knowledge_religion = 1;
            player.skills.druid_knowledge_nature = 1;
            const access = window.wrenParentsInvestigation.skillAccess;
            return {
                insight: access.insight(),
                religion: access.religion(),
                nature: access.nature(),
                perception: access.perception(),
                stealth: access.stealth(),
            };
        });

        expect(result).toEqual({
            insight: true,
            religion: true,
            nature: true,
            perception: true,
            stealth: true,
        });
    });

    test('the same evidence cannot be farmed repeatedly', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.wrenParentsInvestigation;
            api.ensureQuest();
            const first = api.addClue('petra_memory', 'first');
            const second = api.addClue('petra_memory', 'second');
            return { first, second, count: api.clueCount() };
        });

        expect(result.first).toBe(true);
        expect(result.second).toBe(false);
        expect(result.count).toBe(1);
    });

    test('finding the hidden tally allows full-truth closure and a large trust gain', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.wrenParentsInvestigation;
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const petra = window.entities.find(e => e.name === 'Petra Hollis');
            const before = window.getCompanionRelationship(wren);
            api.ensureQuest();
            api.addClue('petra_memory', 'test');
            api.addClue('village_gossip', 'test');
            api.addClue('chapel_register', 'test');
            api.addClue('hidden_freight_tally', 'test');

            let captured = null;
            const baseShowDialogue = window.showDialogue;
            window.showDialogue = (npc, text, options) => { captured = { npc, text, options }; };
            api.resolveWithWren(petra);
            const support = captured.options.find(o => o.label.includes('Whatever you want'));
            support.action();
            window.showDialogue = baseShowDialogue;

            const after = window.getCompanionRelationship(wren);
            const quest = window.questLog.find(q => q.id === 'wren_parents');
            return {
                before,
                after,
                status: quest.status,
                fullTruth: quest.fullTruth,
            };
        });

        expect(result.status).toBe('completed');
        expect(result.fullTruth).toBe(true);
        expect(result.after.trust).toBe(result.before.trust + 18);
        expect(result.after.approval).toBe(result.before.approval + 7);
        expect(result.after.familiarity).toBe(result.before.familiarity + 5);
    });
});