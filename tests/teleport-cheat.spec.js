const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Cheat: teleport to location', () => {
    test('clicking the location <select> does not close the Cheat dropdown mid-interaction', async ({ page }) => {
        await createCharacter(page);
        await page.click('#top-menu .dropdown:has(#cheat-teleport-select) .dropbtn');
        const openBefore = await page.evaluate(() => document.getElementById('cheat-teleport-select').closest('.dropdown-content').classList.contains('show'));
        expect(openBefore).toBe(true);
        await page.click('#cheat-teleport-select');
        const openAfter = await page.evaluate(() => document.getElementById('cheat-teleport-select').closest('.dropdown-content').classList.contains('show'));
        expect(openAfter).toBe(true);
    });

    test('teleports the player entity to Silverhart (Capital)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.teleportPartyToLocation('Silverhart (Capital)');
            const player = window.entities.find(e => e.side === 'player' && !e.rider && !e.aiControlled);
            return { hex: player.hex, expected: window.campaign2PalaceThroneCenter };
        });
        expect(result.hex.q).toBe(result.expected.q);
        expect(result.hex.r).toBe(result.expected.r);
    });

    test('teleports every real party member, not just the lead character', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.teleportPartyToLocation('Reddale (Town)');
            const friendlies = window.entities.filter(e => e.alive && e.side === 'player' && !e.aiControlled);
            const target = window.campaign2ReddaleGuardhouseCenter;
            return friendlies.map(f => ({
                name: f.name,
                dist: Math.abs(f.hex.q - target.q) + Math.abs(f.hex.r - target.r),
            }));
        });
        expect(result.length).toBeGreaterThan(1); // Wren Talbot is always in the party
        result.forEach(f => expect(f.dist).toBeLessThanOrEqual(2));
    });

    test('teleports to every built location without error', async ({ page }) => {
        await createCharacter(page);
        const results = await page.evaluate(() => {
            const locations = Object.keys(window.campaign2TeleportLocations);
            return locations.map(name => {
                window.teleportPartyToLocation(name);
                const player = window.entities.find(e => e.side === 'player' && !e.rider && !e.aiControlled);
                const expected = window.campaign2TeleportLocations[name]();
                return { name, ok: player.hex.q === expected.q && player.hex.r === expected.r };
            });
        });
        results.forEach(r => expect(r.ok).toBe(true));
    });

    test('an unknown location name shows a message instead of throwing', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            try {
                window.teleportPartyToLocation('Nonexistent Place');
                return { threw: false };
            } catch (e) {
                return { threw: true };
            }
        });
        expect(result.threw).toBe(false);
    });
});
