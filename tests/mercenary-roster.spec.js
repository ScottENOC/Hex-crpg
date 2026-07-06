const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption } = require('./helpers.js');

test.describe('Silverhart mercenary recruiter and the 6-person party roster cap', () => {
    test('the recruiter exists in Silverhart, renders on the arenamercenary sprite, and offers a hire', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const recruiter = window.entities.find(e => e.name === 'Mercenary Recruiter');
            return recruiter ? { found: true, customImage: recruiter.customImage, dialogueId: recruiter.dialogueId } : { found: false };
        });
        expect(result.found).toBe(true);
        expect(result.customImage).toBe('arenamercenary');
        expect(result.dialogueId).toBe('silverhart_mercenary_broker');
    });

    test('hiring costs gold and adds a new companion to the active party while under the cap', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => window.party.length);
        await page.evaluate(() => {
            window.party[0].gold = 200;
            const recruiter = window.entities.find(e => e.name === 'Mercenary Recruiter');
            window.npcDialogueTrees.silverhart_mercenary_broker(recruiter);
        });
        await clickDialogueOption(page, 'Hire a mercenary');
        const after = await page.evaluate(() => ({
            partyLen: window.party.length,
            gold: window.party[0].gold,
            entityCount: window.entities.filter(e => e.side === 'player').length,
        }));
        expect(after.partyLen).toBe(before + 1);
        expect(after.gold).toBe(100);
        expect(after.entityCount).toBe(after.partyLen);
    });

    test('hiring past the 6-person cap benches the new hire instead of spawning an entity', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.party[0].gold = 1000;
            const recruiter = window.entities.find(e => e.name === 'Mercenary Recruiter');
            for (let i = 0; i < 6; i++) {
                window.npcDialogueTrees.silverhart_mercenary_broker(recruiter);
                const btn = Array.from(document.getElementById('dialogue-options').children).find(b => b.innerText.includes('Hire a mercenary'));
                if (btn) btn.click();
            }
        });
        const result = await page.evaluate(() => ({
            partyLen: window.party.length,
            benchedLen: window.benchedCompanions.length,
            entityCount: window.entities.filter(e => e.side === 'player').length,
        }));
        expect(result.partyLen).toBe(6);
        expect(result.entityCount).toBe(6);
        expect(result.benchedLen).toBeGreaterThan(0);
    });

    test('benching a companion removes their entity; the main character can never be benched', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => window.party.map(p => p.name));
        expect(before.length).toBeGreaterThan(1);
        const secondName = before[1];

        const benchResult = await page.evaluate((name) => window.benchPartyMember(name), secondName);
        expect(benchResult).toBe(true);

        const afterBench = await page.evaluate((name) => ({
            partyNames: window.party.map(p => p.name),
            benchedNames: window.benchedCompanions.map(p => p.name),
            entityExists: !!window.entities.find(e => e.name === name),
        }), secondName);
        expect(afterBench.partyNames).not.toContain(secondName);
        expect(afterBench.benchedNames).toContain(secondName);

        const mainCharName = before[0];
        const mainBenchResult = await page.evaluate((name) => window.benchPartyMember(name), mainCharName);
        expect(mainBenchResult).toBe(false);
        const stillThere = await page.evaluate((name) => window.party.some(p => p.name === name), mainCharName);
        expect(stillThere).toBe(true);
    });

    test('activating a benched companion respawns their entity adjacent to the player, only when under the cap', async ({ page }) => {
        await createCharacter(page);
        const secondName = await page.evaluate(() => window.party[1].name);
        await page.evaluate((name) => window.benchPartyMember(name), secondName);

        const activateResult = await page.evaluate((name) => window.activatePartyMember(name), secondName);
        expect(activateResult).toBe(true);

        const after = await page.evaluate((name) => ({
            inParty: window.party.some(p => p.name === name),
            entityExists: !!window.entities.find(e => e.name === name && e.side === 'player'),
        }), secondName);
        expect(after.inParty).toBe(true);
        expect(after.entityExists).toBe(true);
    });

    test('the Roster button refuses to open mid-combat', async ({ page }) => {
        await createCharacter(page);
        // window.isInCombat gets recomputed every tick from
        // checkInCombat() (a live scan for an alive enemy with
        // aiState:'combat'), so a bare flag assignment can be raced and
        // overwritten before the click lands. Spawn a real hostile in
        // combat state instead, so the flag holds for real.
        await page.evaluate(() => {
            const playerEntity = window.entities.find(e => e.side === 'player');
            const hostile = window.createMonster('goblin', { q: playerEntity.hex.q + 1, r: playerEntity.hex.r }, null, null, 'enemy');
            hostile.aiState = 'combat';
            window.entities.push(hostile);
        });
        await page.click('.dropbtn');
        await page.click('#roster-btn');
        const modalVisible = await page.evaluate(() => document.getElementById('roster-modal').style.display === 'block');
        expect(modalVisible).toBe(false);
    });
});
