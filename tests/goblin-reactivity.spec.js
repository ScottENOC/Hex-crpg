// tests/goblin-reactivity.spec.js
// The goblin_tribe is a scouting warband of orc_raiders, not a standalone
// faction — reputation swings should ripple onto orc_raiders too. A
// goblin-race player should also get real reactivity from human NPCs
// (refused audiences/commerce, not just quietly ignored), and siding with
// the tribe (goblin_alliance) should let Nix Sharpear actually join.

const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('The Skarn-tooth tribe as an orc scouting party', () => {
    test('adjustReputation on goblin_tribe also nudges orc_raiders, dampened', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => window.factions.orc_raiders.standing);
        await page.evaluate(() => window.adjustReputation(window.factions.goblin_tribe, 20, 20));
        const after = await page.evaluate(() => ({
            orc: window.factions.orc_raiders.standing,
            goblin: window.factions.goblin_tribe.standing,
        }));
        expect(after.goblin).toBeGreaterThan(before);
        expect(after.orc).toBeGreaterThan(before);
        expect(after.orc).toBeLessThan(after.goblin); // dampened, not a 1:1 mirror
    });

    test('adjusting orc_raiders directly does not ripple back onto goblin_tribe', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => window.factions.goblin_tribe.standing);
        await page.evaluate(() => window.adjustReputation(window.factions.orc_raiders, 30, 20));
        const after = await page.evaluate(() => window.factions.goblin_tribe.standing);
        expect(after).toBe(before);
    });
});

test.describe('Reactivity when the player is a goblin', () => {
    test('Elder Marta refuses a goblin player outright until they offer to prove themselves', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        const shown = await readDialogue(page);
        expect(shown.message.toLowerCase()).toContain('greenskin');
        expect(shown.options.some(o => o.includes("bring you word"))).toBe(true);
    });

    test('accepting the offer starts the Prove Your Worth quest, and reporting back resolves it', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        const before = await page.evaluate(() => ({
            kingdom: window.factions.silverhart_kingdom.standing,
            goblin: window.factions.goblin_tribe.standing,
        }));
        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        await clickDialogueOption(page, "bring you word");
        const midQuest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'goblin_spy_for_humans'));
        expect(midQuest.status).toBe('active');

        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        await clickDialogueOption(page, "mean Hollowmere no harm");

        const after = await page.evaluate(() => ({
            quest: (window.questLog || []).find(q => q.id === 'goblin_spy_for_humans'),
            vouched: window.goblinVouchedByMarta,
            kingdom: window.factions.silverhart_kingdom.standing,
            goblin: window.factions.goblin_tribe.standing,
        }));
        expect(after.quest.status).toBe('completed');
        expect(after.vouched).toBe(true);
        expect(after.kingdom).toBeGreaterThan(before.kingdom);
        expect(after.goblin).toBeLessThan(before.goblin); // reporting on your own chief is a real betrayal
    });

    test('Elder Marta speaks civilly once vouched, no more "get out"', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        await page.evaluate(() => { window.goblinVouchedByMarta = true; });
        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        const shown = await readDialogue(page);
        expect(shown.message.toLowerCase()).not.toContain('get out');
    });

    test('Queen Seraphine refuses a goblin player an audience until Marta has vouched for them', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            window.npcDialogueTrees.silverhart_queen(queen);
        });
        const shown = await readDialogue(page);
        expect(shown.options).toHaveLength(1);
        expect(shown.message.toLowerCase()).toContain('guards');
    });

    test('Queen Seraphine grants a begrudging audience once Marta has vouched for the player', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        await page.evaluate(() => { window.goblinVouchedByMarta = true; });
        await page.evaluate(() => {
            const queen = window.entities.find(e => e.name === 'Queen Seraphine Corrin');
            window.npcDialogueTrees.silverhart_queen(queen);
        });
        const shown = await readDialogue(page);
        expect(shown.options.length).toBeGreaterThan(1);
        expect(shown.message.toLowerCase()).not.toContain('guards!');
    });

    test('a goblin player is shunned by human commerce until vouched for, then it lifts', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        const before = await page.evaluate(() => window.isShunnedByHumanCommerce());
        expect(before).toBe(true);
        const after = await page.evaluate(() => {
            window.goblinVouchedByMarta = true;
            return window.isShunnedByHumanCommerce();
        });
        expect(after).toBe(false);
    });

    test('a human player is not shunned or refused by default', async ({ page }) => {
        await createCharacter(page, { race: 'human', campaign: '2' });
        const result = await page.evaluate(() => ({
            shunned: window.isShunnedByHumanCommerce(),
            isGoblin: window.isPlayerGoblin(),
        }));
        expect(result.shunned).toBe(false);
        expect(result.isGoblin).toBe(false);
    });
});

test.describe('Nix Sharpear: joinable companion after the goblin alliance', () => {
    test('is not offered before the tribe has actually allied', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const nix = window.entities.find(e => e.name === 'Nix Sharpear');
            window.npcDialogueTrees.nix_sharpear(nix);
        });
        const shown = await readDialogue(page);
        expect(shown.options.some(o => o.includes('Come with me'))).toBe(false);
    });

    test('joining folds Nix into the party as a real goblin-race rogue', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', status: 'completed', resolution: 'goblin_alliance' });
        });
        await page.evaluate(() => {
            const nix = window.entities.find(e => e.name === 'Nix Sharpear');
            window.npcDialogueTrees.nix_sharpear(nix);
        });
        await clickDialogueOption(page, 'Come with me');
        const result = await page.evaluate(() => {
            const companion = window.party.find(p => p.name === 'Nix Sharpear');
            const ent = window.entities.find(e => e.name === 'Nix Sharpear');
            return {
                inParty: !!companion,
                race: companion?.race,
                class: companion?.class,
                factionId: companion?.factionId,
                side: ent?.side,
                stillOldNixEntity: window.entities.filter(e => e.name === 'Nix Sharpear').length,
            };
        });
        expect(result.inParty).toBe(true);
        expect(result.race).toBe('goblin');
        expect(result.class).toBe('rogue');
        expect(result.factionId).toBe('goblin_tribe');
        expect(result.side).toBe('player');
        expect(result.stillOldNixEntity).toBe(1); // old NPC entity replaced, not duplicated
    });

    test('joining twice is a no-op the second time', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', status: 'completed', resolution: 'goblin_alliance' });
        });
        await page.evaluate(() => window.recruitGoblinCompanion());
        await page.evaluate(() => window.recruitGoblinCompanion());
        const count = await page.evaluate(() => window.party.filter(p => p.name === 'Nix Sharpear').length);
        expect(count).toBe(1);
    });
});
