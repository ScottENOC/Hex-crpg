// tests/companion.spec.js
const { test, expect } = require('@playwright/test');
const { createCharacter, resolveShakedownDirectly } = require('./helpers');

test.describe('Wren Talbot (permanent companion)', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('is a real party member, seated with the player from game start', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            return {
                inParty: window.party.some(p => p.name === 'Wren Talbot'),
                side: wren?.side,
                aiControlled: wren?.aiControlled,
                level: window.party.find(p => p.name === 'Wren Talbot')?.level,
                cls: window.party.find(p => p.name === 'Wren Talbot')?.class,
                skills: window.party.find(p => p.name === 'Wren Talbot')?.skills,
                equipped: wren?.equipped,
                distanceFromPlayer: wren && window.distance(wren.hex, window.entities.find(e => e.name === window.party[0].name).hex),
            };
        });
        expect(result.inParty).toBe(true);
        expect(result.side).toBe('player');
        expect(result.aiControlled).toBeFalsy(); // a real controllable party member, not an AI ally
        expect(result.level).toBe(1);
        expect(result.cls).toBe('fighter');
        expect(result.skills).toMatchObject({ health: 1, sword_hit: 1, sword_dmg: 1 });
        expect(result.equipped.weapon).toBe('sword');
        expect(result.equipped.armor).toBe('light_armor');
        expect(result.distanceFromPlayer).toBeLessThanOrEqual(1); // seated right next to the player
    });

    for (const branch of ['stay_out', 'encourage_pay', 'fight']) {
        test(`survives the "${branch}" branch regardless of outcome`, async ({ page }) => {
            await resolveShakedownDirectly(page, branch);
            const wren = await page.evaluate(() => {
                const w = window.entities.find(e => e.name === 'Wren Talbot');
                return { alive: w.alive, inParty: window.party.some(p => p.name === 'Wren Talbot') };
            });
            expect(wren.alive).toBe(true);
            expect(wren.inParty).toBe(true);
        });
    }
});
