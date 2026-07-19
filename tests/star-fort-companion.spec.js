// tests/star-fort-companion.spec.js
// Whichever side the player ends up on when the Northwatch siege resolves
// (win or lose) can gain a companion. Greenskin side (Snik Fangtooth) is
// still an automatic grant. Human side (Brother Alden) now fights in the
// compound during the real assault instead of appearing out of nowhere:
// he has to actually survive the fight (spawnBrotherAlden), the siege
// resolving in the humans' favor only offers a real join/reject
// conversation (npcDialogueTrees.brother_alden), and he's not in the
// party until that's accepted.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Star Fort companion reward', () => {
    test('siege_broken with no betrayals offers Brother Alden a join conversation, not an automatic grant', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.spawnBrotherAlden();
            window.resolveNorthwatchSiege('siege_broken');
            const ent = window.entities.find(e => e.name === 'Brother Alden');
            return {
                side: window.northwatchPlayerSide,
                inPartyBeforeTalking: window.party.some(p => p.name === 'Brother Alden'),
                offersToJoin: ent?.offersToJoin,
                entAlive: ent?.alive,
                entSide: ent?.side,
                stayWithinCompound: !!ent?.combatDirective?.constraints?.stayWithinHexes,
            };
        });
        expect(result.side).toBe('human');
        expect(result.inPartyBeforeTalking).toBe(false);
        expect(result.offersToJoin).toBe(true);
        expect(result.entAlive).toBe(true);
        expect(result.entSide).toBe('neutral');
        expect(result.stayWithinCompound).toBe(true);
    });

    test('accepting Brother Alden\'s offer via dialogue adds him to the party; declining leaves him behind', async ({ page }) => {
        await createCharacter(page);
        const accepted = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.spawnBrotherAlden();
            window.resolveNorthwatchSiege('siege_broken');
            const ent = window.entities.find(e => e.name === 'Brother Alden');
            window.npcDialogueTrees.brother_alden(ent);
            const btn = [...document.querySelectorAll('#dialogue-options button')].find(b => b.innerText.includes('Join us'));
            btn.click();
            return {
                inParty: window.party.some(p => p.name === 'Brother Alden'),
                entSide: ent.side,
            };
        });
        expect(accepted.inParty).toBe(true);
        expect(accepted.entSide).toBe('player');
    });

    test('a dead Brother Alden never gets offersToJoin set, so the siege reward is skipped entirely', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.spawnBrotherAlden();
            const ent = window.entities.find(e => e.name === 'Brother Alden');
            ent.alive = false;
            window.resolveNorthwatchSiege('siege_broken');
            return { offersToJoin: !!ent.offersToJoin, inParty: window.party.some(p => p.name === 'Brother Alden') };
        });
        expect(result.offersToJoin).toBe(false);
        expect(result.inParty).toBe(false);
    });

    test('fort_fallen with no betrayals grants the goblin rogue companion', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.resolveNorthwatchSiege('fort_fallen');
            const companion = window.party.find(p => p.name === 'Snik Fangtooth');
            return {
                side: window.northwatchPlayerSide,
                inParty: !!companion,
                companionRace: companion?.race,
                customImage: companion?.customImage,
            };
        });
        expect(result.side).toBe('greenskin');
        expect(result.inParty).toBe(true);
        expect(result.companionRace).toBe('goblin');
        expect(result.customImage).toBe('goblin');
    });

    test('betraying the humans forces greenskin side even on a siege_broken outcome', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            const soldier = { factionTag: 'northwatch_human', combatDirective: { hostileToPlayer: true }, hex: { q: 0, r: 0 }, alive: true, side: 'neutral' };
            window.entities.push(soldier);
            window.resolveNorthwatchSiege('siege_broken');
            const side = window.northwatchPlayerSide;
            window.entities = window.entities.filter(e => e !== soldier);
            return { side, inParty: !!window.party.find(p => p.name === 'Snik Fangtooth') };
        });
        expect(result.side).toBe('greenskin');
        expect(result.inParty).toBe(true);
    });

    test('goblin race has its data-driven attribute bonus and racial skills exist', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const companion = window.createCharacterData('goblin', 'rogue', 'Test Goblin', 'male', 'pc_1');
            return {
                bonusApplied: companion.attributes.agility,
                hasOpportunist: !!window.skills.goblin_opportunist,
                hasKeenSenses: !!window.skills.goblin_keen_senses,
            };
        });
        expect(result.bonusApplied).toBeGreaterThan(0);
        expect(result.hasOpportunist).toBe(true);
        expect(result.hasKeenSenses).toBe(true);
    });
});
