const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue, clickDialogueOption } = require('./helpers.js');

test.describe('Silverhart Commons: tavern, market square, and scattered outlying houses', () => {
    test('the tavern, market square, watch, cutpurse, and outlying houses are all placed', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const names = ['Hollis Vane', 'Sergeant Bell', 'Nix the Cutpurse', 'Osric Fenn', 'Greta Aldwyn', 'Tomlin Reed'];
            const found = Object.fromEntries(names.map(n => [n, !!window.entities.find(e => e.name === n)]));
            const cutpurse = window.entities.find(e => e.name === 'Nix the Cutpurse');
            return {
                found,
                commonsCenter: window.campaign2SilverhartCommonsCenter,
                marketSquare: window.campaign2SilverhartMarketSquare,
                cutpurseSide: cutpurse?.side,
                bountyBoard: Object.values(window.tileObjects).find(o => o.readId === 'silverhart_bounty_board'),
            };
        });
        for (const name of ['Hollis Vane', 'Sergeant Bell', 'Nix the Cutpurse', 'Osric Fenn', 'Greta Aldwyn', 'Tomlin Reed']) {
            expect(result.found[name]).toBe(true);
        }
        expect(result.cutpurseSide).toBe('enemy');
        expect(!!result.bountyBoard).toBe(true);
        expect(result.commonsCenter).toBeTruthy();
        expect(result.marketSquare).toBeTruthy();
    });

    test('reading the bounty board starts the quest, and killing Nix lets it be claimed for gold', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const boardHex = Object.entries(window.tileObjects).find(([, o]) => o.readId === 'silverhart_bounty_board')[0];
            const [q, r] = boardHex.split(',').map(Number);
            window.interactWithTileObject(q, r, window.player);
        });
        const afterAccept = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'silverhart_bounty_cutpurse'));
        expect(afterAccept.status).toBe('active');

        const result = await page.evaluate(() => {
            const cutpurse = window.entities.find(e => e.name === 'Nix the Cutpurse');
            cutpurse.alive = false;
            cutpurse.hp = 0;
            const before = window.party[0].gold || 0;
            const boardHex = Object.entries(window.tileObjects).find(([, o]) => o.readId === 'silverhart_bounty_board')[0];
            const [q, r] = boardHex.split(',').map(Number);
            window.interactWithTileObject(q, r, window.player);
            return {
                before,
                after: window.party[0].gold || 0,
                questStatus: (window.questLog || []).find(q => q.id === 'silverhart_bounty_cutpurse')?.status,
            };
        });
        expect(result.after).toBeGreaterThan(result.before);
        expect(result.questStatus).toBe('completed');
    });

    test('the Watch Sergeant reacts to a shunned player and otherwise points at the bounty board', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => { window.playerIsLich = true; });
        await page.evaluate(() => {
            const sergeant = window.entities.find(e => e.name === 'Sergeant Bell');
            window.npcDialogueTrees.silverhart_watch_sergeant(sergeant);
        });
        const shunnedDialogue = await readDialogue(page);
        expect(shunnedDialogue.message).toContain("I've got my eye on you");

        await page.evaluate(() => { window.playerIsLich = false; });
        await page.evaluate(() => {
            const sergeant = window.entities.find(e => e.name === 'Sergeant Bell');
            window.npcDialogueTrees.silverhart_watch_sergeant(sergeant);
        });
        const normalDialogue = await readDialogue(page);
        expect(normalDialogue.message).toContain('bounty board');
    });

    test('the innkeeper and outlying residents all have working idle dialogue', async ({ page }) => {
        await createCharacter(page);
        const names = ['Hollis Vane', 'Osric Fenn', 'Greta Aldwyn', 'Tomlin Reed'];
        for (const name of names) {
            await page.evaluate((n) => {
                const npc = window.entities.find(e => e.name === n);
                window.npcDialogueTrees[npc.dialogueId](npc);
            }, name);
            const dialogue = await readDialogue(page);
            expect(dialogue.message.length).toBeGreaterThan(0);
            await clickDialogueOption(page, dialogue.options[dialogue.options.length - 1]);
        }
    });
});
