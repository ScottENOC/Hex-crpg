const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.ProactiveQuestGivers, null, { timeout: 10000 });
}

test.describe('proactive quest givers', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('recognises unseen quest content without a hand-maintained giver list', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.ProactiveQuestGivers;
            window.npcDialogueTrees.__proactive_test = function(npc) {
                window.questLog.push({ id: 'proactive_test_quest', title: 'Test Quest', giver: npc.name, status: 'active' });
            };
            const npc = {
                id: 'proactive:test:giver', name: 'Helpful Local', alive: true, isNPC: true,
                side: 'neutral', dialogueId: '__proactive_test', factionId: null,
                reputation: { standing: 20, knowledge: 20 }, hex: { q: 0, r: 0 },
            };
            const before = {
                helper: api.knowsPlayerAsHelper(npc),
                unseen: api.hasUnseenQuestContent(npc),
                info: api.dialogueQuestInfo(npc.dialogueId),
            };
            window.questLog.push({ id: 'proactive_test_quest', title: 'Test Quest', giver: npc.name, status: 'completed' });
            const after = api.hasUnseenQuestContent(npc);
            window.questLog = window.questLog.filter(q => q.id !== 'proactive_test_quest');
            delete window.npcDialogueTrees.__proactive_test;
            return { before, after };
        });

        expect(result.before.helper).toBe(true);
        expect(result.before.unseen).toBe(true);
        expect(result.before.info.questLike).toBe(true);
        expect(result.before.info.ids).toContain('proactive_test_quest');
        expect(result.after).toBe(false);
    });

    test('fear requires known hostility and military authority stands ground', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.ProactiveQuestGivers;
            const civilian = {
                side: 'neutral', title: 'Shopkeeper',
                reputation: { standing: -30, knowledge: 20 },
            };
            const stranger = {
                side: 'neutral', title: 'Shopkeeper',
                reputation: { standing: -30, knowledge: 0 },
            };
            const captain = {
                side: 'neutral', title: 'Watch Captain',
                reputation: { standing: -30, knowledge: 20 },
            };
            return {
                civilianFear: api.expectsPlayerHarm(civilian),
                strangerFear: api.expectsPlayerHarm(stranger),
                civilianStands: api.likelyToStandGround(civilian),
                captainStands: api.likelyToStandGround(captain),
            };
        });

        expect(result.civilianFear).toBe(true);
        expect(result.strangerFear).toBe(false);
        expect(result.civilianStands).toBe(false);
        expect(result.captainStands).toBe(true);
    });

    test('flee destination increases distance from the threatening player', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.ProactiveQuestGivers;
            const player = { id: 'proactive:test:player', alive: true, side: 'player', hex: { q: 8, r: 24 } };
            const npc = { id: 'proactive:test:flee', alive: true, side: 'neutral', hex: { q: 10, r: 24 } };
            const before = window.distance(npc.hex, player.hex);
            const destination = api.fleeHex(npc, player);
            const after = destination ? window.distance(destination, player.hex) : before;
            return { before, after, destination };
        });

        expect(result.destination).toBeTruthy();
        expect(result.after).toBeGreaterThan(result.before);
    });

    test('public-space gating accepts settlements but rejects cave interiors', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.ProactiveQuestGivers;
            const originalTerrain = window.getTerrainAt;
            const crossroads = window.campaign2Landmarks.crossroads;
            const actor = { hex: { q: crossroads.q, r: crossroads.r } };
            window.getTerrainAt = () => ({ name: 'Grass' });
            const outside = api.isPublicPlayerLocation(actor);
            window.getTerrainAt = () => ({ name: 'Cave Floor' });
            const cave = api.isPublicPlayerLocation(actor);
            window.getTerrainAt = originalTerrain;
            return { outside, cave };
        });

        expect(result.outside).toBe(true);
        expect(result.cave).toBe(false);
    });
});
