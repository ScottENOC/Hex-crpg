const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Cheat: teleport to location', () => {
    test('the Cheat dropdown never spills off the right edge of a narrow phone screen', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await createCharacter(page);
        const dropbtns = await page.locator('#top-menu .dropbtn').all();
        for (const btn of dropbtns) {
            if ((await btn.innerText()).includes('Cheat')) { await btn.click(); break; }
        }
        const rect = await page.evaluate(() => document.querySelector('#top-menu .dropdown-content.show').getBoundingClientRect());
        expect(rect.right).toBeLessThanOrEqual(375);
    });

    test('the longest destination button (Emberlode) never widens the dropdown past its container', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await createCharacter(page);
        const dropbtns = await page.locator('#top-menu .dropbtn').all();
        for (const btn of dropbtns) {
            if ((await btn.innerText()).includes('Cheat')) { await btn.click(); break; }
        }
        const rect = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('.cheat-teleport-dest-btn')].find(b => b.dataset.teleportDest === 'Emberlode (Mining Village)');
            return btn.getBoundingClientRect();
        });
        expect(rect.right).toBeLessThanOrEqual(375);
    });

    test('clicking a teleport destination button in the Cheat menu actually teleports the party (real click, not a direct function call)', async ({ page }) => {
        await createCharacter(page);
        await page.click('#top-menu .dropdown:has(#cheat-teleport-list) .dropbtn');
        const openBefore = await page.evaluate(() => document.getElementById('cheat-teleport-list').closest('.dropdown-content').classList.contains('show'));
        expect(openBefore).toBe(true);
        await page.click('.cheat-teleport-dest-btn[data-teleport-dest="Reddale (Town)"]');
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider && !e.aiControlled);
            const target = window.campaign2ReddaleGuardhouseCenter;
            return Math.abs(player.hex.q - target.q) + Math.abs(player.hex.r - target.r);
        });
        expect(result).toBeLessThanOrEqual(2);
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
