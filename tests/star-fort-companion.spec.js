// tests/star-fort-companion.spec.js
// Whichever side the player ends up on when the Northwatch siege resolves
// (win or lose) grants a companion: a goblin rogue for the greenskin side,
// a human monk for the human side. Player-side is forced from the
// unforgivable-act hostility flips if any fired, else falls back to
// whoever won the siege.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Star Fort companion reward', () => {
    test('siege_broken with no betrayals grants the human monk companion', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activateNorthwatchSiege();
            window.resolveNorthwatchSiege('siege_broken');
            const companion = window.party.find(p => p.name === 'Brother Alden');
            const ent = window.entities.find(e => e.name === 'Brother Alden');
            return {
                side: window.northwatchPlayerSide,
                inParty: !!companion,
                companionRace: companion?.race,
                entSide: ent?.side,
            };
        });
        expect(result.side).toBe('human');
        expect(result.inParty).toBe(true);
        expect(result.companionRace).toBe('human');
        expect(result.entSide).toBe('player');
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
