// tests/orc-reactivity.spec.js
// Orc-race reactivity and companion recruitment, mirroring the goblin
// versions (tests/goblin-reactivity.spec.js) via the shared
// isPlayerGreenskin/goblinVouchedByMarta machinery (factions.js,
// campaign2Dialogue.js) — an orc player gets the exact same "refused on
// sight, redeemable via Prove Your Worth" treatment as a goblin player.

const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('Reactivity when the player is an orc', () => {
    test('isPlayerOrc/isPlayerGreenskin report correctly for an orc player', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        const result = await page.evaluate(() => ({
            isOrc: window.isPlayerOrc(),
            isGoblin: window.isPlayerGoblin(),
            isGreenskin: window.isPlayerGreenskin(),
        }));
        expect(result.isOrc).toBe(true);
        expect(result.isGoblin).toBe(false);
        expect(result.isGreenskin).toBe(true);
    });

    test('Elder Marta refuses an orc player outright until they offer to prove themselves', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        const shown = await readDialogue(page);
        expect(shown.message.toLowerCase()).toContain('greenskin');
        expect(shown.options.some(o => o.includes('warlord'))).toBe(true);
    });

    test('accepting the offer and reporting back vouches for an orc player and hits orc_raiders standing', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        const before = await page.evaluate(() => window.factions.orc_raiders.standing);
        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        await clickDialogueOption(page, "bring you word");
        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        await clickDialogueOption(page, "mean Hollowmere no harm");
        const after = await page.evaluate(() => ({
            vouched: window.goblinVouchedByMarta,
            orcRaiders: window.factions.orc_raiders.standing,
        }));
        expect(after.vouched).toBe(true);
        expect(after.orcRaiders).toBeLessThan(before);
    });

    test('Queen Seraphine refuses an orc player an audience until vouched for, then grants one', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        const before = await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            window.npcDialogueTrees.silverhart_queen(queen);
        });
        const refused = await readDialogue(page);
        expect(refused.options).toHaveLength(1);

        await page.evaluate(() => { window.goblinVouchedByMarta = true; });
        await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            window.npcDialogueTrees.silverhart_queen(queen);
        });
        const granted = await readDialogue(page);
        expect(granted.options.length).toBeGreaterThan(1);
    });

    test('an orc player is shunned by human commerce until vouched for, then it lifts', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        const before = await page.evaluate(() => window.isShunnedByHumanCommerce());
        expect(before).toBe(true);
        const after = await page.evaluate(() => {
            window.goblinVouchedByMarta = true;
            return window.isShunnedByHumanCommerce();
        });
        expect(after).toBe(false);
    });
});

test.describe('Warlord Grukk Ironhide: joinable companion at high orc_raiders trust', () => {
    test('is not offered before the stronghold trust quest completes', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const warlord = window.entities.find(e => e.name === 'Warlord Grukk Ironhide');
            window.npcDialogueTrees.orc_warlord(warlord);
        });
        const shown = await readDialogue(page);
        expect(shown.options.some(o => o.includes('Come with me'))).toBe(false);
    });

    test('is not offered right after the quest completes, below the 40 standing bar', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'orc_stronghold_trust', title: 'Prove Your Strength', status: 'completed' });
            window.factions.orc_raiders.standing = 25; // completed, but below 40
        });
        await page.evaluate(() => {
            const warlord = window.entities.find(e => e.name === 'Warlord Grukk Ironhide');
            window.npcDialogueTrees.orc_warlord(warlord);
        });
        const shown = await readDialogue(page);
        expect(shown.options.some(o => o.includes('Come with me'))).toBe(false);
    });

    test('joining folds Grukk into the party as a real orc-race fighter once standing clears 40', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'orc_stronghold_trust', title: 'Prove Your Strength', status: 'completed' });
            window.factions.orc_raiders.standing = 40;
        });
        await page.evaluate(() => {
            const warlord = window.entities.find(e => e.name === 'Warlord Grukk Ironhide');
            window.npcDialogueTrees.orc_warlord(warlord);
        });
        await clickDialogueOption(page, 'Come with me');
        const result = await page.evaluate(() => {
            const companion = window.party.find(p => p.name === 'Warlord Grukk Ironhide');
            const ent = window.entities.find(e => e.name === 'Warlord Grukk Ironhide');
            return {
                inParty: !!companion,
                race: companion?.race,
                class: companion?.class,
                factionId: companion?.factionId,
                side: ent?.side,
                stillOldWarlordEntity: window.entities.filter(e => e.name === 'Warlord Grukk Ironhide').length,
            };
        });
        expect(result.inParty).toBe(true);
        expect(result.race).toBe('orc');
        expect(result.class).toBe('fighter');
        expect(result.factionId).toBe('orc_raiders');
        expect(result.side).toBe('player');
        expect(result.stillOldWarlordEntity).toBe(1);
    });

    test('joining twice is a no-op the second time', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'orc_stronghold_trust', title: 'Prove Your Strength', status: 'completed' });
            window.factions.orc_raiders.standing = 40;
        });
        await page.evaluate(() => window.recruitOrcCompanion());
        await page.evaluate(() => window.recruitOrcCompanion());
        const count = await page.evaluate(() => window.party.filter(p => p.name === 'Warlord Grukk Ironhide').length);
        expect(count).toBe(1);
    });
});
