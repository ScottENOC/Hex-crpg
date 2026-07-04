const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe("the necromancer's disciple in Reddale", () => {
    test('without Knowledge: Religion, she reads as an ordinary herbalist with no suspicious options', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const disciple = window.entities.find(e => e.name === 'Mirella Thorn');
            window.npcDialogueTrees.reddale_disciple(disciple);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('Look closer'))).toBe(false);
    });

    test('with Knowledge: Religion, looking closer flags her as suspected and unlocks the conspire option', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.party[0].skills = { ...(window.party[0].skills || {}), knowledge_religion: 1 };
            const disciple = window.entities.find(e => e.name === 'Mirella Thorn');
            window.npcDialogueTrees.reddale_disciple(disciple);
        });
        await clickDialogueOption(page, 'Look closer');
        const suspected = await page.evaluate(() => window.discipleSuspected);
        expect(suspected).toBe(true);

        await page.evaluate(() => {
            const disciple = window.entities.find(e => e.name === 'Mirella Thorn');
            window.npcDialogueTrees.reddale_disciple(disciple);
        });
        const dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes("secret's safe"))).toBe(true);
    });

    test('conspiring with her raises necromancer_cult standing and lowers the kingdom\'s', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => ({
            cult: window.factions.necromancer_cult.standing,
            kingdom: window.factions.silverhart_kingdom.standing,
        }));
        await page.evaluate(() => {
            window.party[0].skills = { ...(window.party[0].skills || {}), knowledge_religion: 1 };
            window.discipleSuspected = true;
            const disciple = window.entities.find(e => e.name === 'Mirella Thorn');
            window.npcDialogueTrees.reddale_disciple(disciple);
        });
        await clickDialogueOption(page, "secret's safe");
        const after = await page.evaluate(() => ({
            cult: window.factions.necromancer_cult.standing,
            kingdom: window.factions.silverhart_kingdom.standing,
            conspired: window.discipleConspired,
        }));
        expect(after.conspired).toBe(true);
        expect(after.cult).toBeGreaterThan(before.cult);
        expect(after.kingdom).toBeLessThan(before.kingdom);
    });

    test('reading her note (found near the inn) grants the evidence item exactly once', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.readDiscipleNote();
            const firstCount = window.player.inventory.filter(i => i === 'disciple_evidence').length;
            window.readDiscipleNote(); // reading again shouldn't duplicate it
            const secondCount = window.player.inventory.filter(i => i === 'disciple_evidence').length;
            return { firstCount, secondCount };
        });
        expect(result.firstCount).toBe(1);
        expect(result.secondCount).toBe(1);
    });

    test('the Captain only offers to report the disciple once the player actually has the evidence, and doing so removes her', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const captain = window.entities.find(e => e.name === 'Captain Ilsa Rennick');
            window.npcDialogueTrees.reddale_captain(captain);
        });
        let dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('Report a cult disciple'))).toBe(false);

        await page.evaluate(() => {
            window.player.inventory.push('disciple_evidence');
            const captain = window.entities.find(e => e.name === 'Captain Ilsa Rennick');
            window.npcDialogueTrees.reddale_captain(captain);
        });
        dialogue = await readDialogue(page);
        expect(dialogue.options.some(o => o.includes('Report a cult disciple'))).toBe(true);

        const before = await page.evaluate(() => ({ cult: window.factions.necromancer_cult.standing, gold: window.party[0].gold || 0 }));
        await clickDialogueOption(page, 'Report a cult disciple');
        const after = await page.evaluate(() => ({
            questStatus: (window.questLog || []).find(q => q.id === 'disciple_exposed')?.status,
            discipleAlive: window.entities.find(e => e.name === 'Mirella Thorn')?.alive,
            cult: window.factions.necromancer_cult.standing,
            gold: window.party[0].gold || 0,
            hasEvidence: window.player.inventory.includes('disciple_evidence'),
        }));
        expect(after.questStatus).toBe('completed');
        expect(after.discipleAlive).toBe(false);
        expect(after.cult).toBeLessThan(before.cult);
        expect(after.gold).toBeGreaterThan(before.gold);
        expect(after.hasEvidence).toBe(false);
    });
});
