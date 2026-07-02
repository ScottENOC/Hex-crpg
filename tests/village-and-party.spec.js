// tests/village-and-party.spec.js
// Temporary-combat-ally exclusion from the movement tab, the general store's
// limited/priced inventory, starting gold, and formation-move offsets.
const { test, expect } = require('@playwright/test');
const { createCharacter, resolveShakedownDirectly } = require('./helpers');

test.describe('village and party-movement changes', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('temporary combat allies never appear in the movement tab, only real party members', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        const names = await page.evaluate(() => {
            window.updatePartyTabs();
            return Array.from(document.getElementById('party-selection').children).map(b => b.innerText);
        });
        expect(names).toEqual(expect.arrayContaining(['Wren'])); // real companion, still listed
        expect(names).toHaveLength(2); // main character + Wren only
        expect(names).not.toEqual(expect.arrayContaining(['Garrick']));
        expect(names).not.toEqual(expect.arrayContaining(['Mira']));
        expect(names).not.toEqual(expect.arrayContaining(['Oskar']));
    });

    test('player starts Campaign 2 with some gold', async ({ page }) => {
        const gold = await page.evaluate(() => window.party[0].gold);
        expect(gold).toBeGreaterThan(0);
    });

    test('the general store sells a restricted, limited-stock, roguelike-priced inventory', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.party[0].gold = 1000;
            window.party[0].inventory = [];
            const stock = { ...window.hollowmereStoreStock }; // isolate from other tests reusing the module-level object
            const swordStockBefore = stock.sword;
            window.openShop({ itemIds: window.hollowmereStoreItems, stock, mounts: false });
            const buyButtons = Array.from(document.querySelectorAll('#shop-buy-list button'));
            const swordRow = Array.from(document.querySelectorAll('#shop-buy-list > div')).find(d => d.textContent.includes('Sword'));
            const swordBtn = swordRow.querySelector('button');
            swordBtn.click();
            return {
                priceMatchesRoguelike: window.items.sword.buyPrice === 25,
                swordStockBefore,
                swordStockAfter: stock.sword,
                hasSword: window.party[0].inventory.includes('sword'),
                noMountsOffered: !document.getElementById('shop-buy-list').textContent.includes('Horse'),
            };
        });
        expect(result.priceMatchesRoguelike).toBe(true);
        expect(result.swordStockAfter).toBe(result.swordStockBefore - 1);
        expect(result.hasSword).toBe(true);
        expect(result.noMountsOffered).toBe(true);
    });

    test('group-move with the "line" formation assigns followers a stable single-file offset', async ({ page }) => {
        const offsets = await page.evaluate(() => {
            window.partyFormation = 'line';
            const leader = window.entities.find(e => e.name === window.party[0].name);
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            return window.getFormationOffset(wren, leader);
        });
        expect(offsets).toEqual({ q: 0, r: 1 }); // first (only) follower, directly behind the leader
    });

    test('group-move defaults to "close" formation, preserving each follower\'s current relative position', async ({ page }) => {
        const offsets = await page.evaluate(() => {
            window.partyFormation = 'close';
            const leader = window.entities.find(e => e.name === window.party[0].name);
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            wren.hex = { q: leader.hex.q + 3, r: leader.hex.r - 2 };
            return window.getFormationOffset(wren, leader);
        });
        expect(offsets).toEqual({ q: 3, r: -2 });
    });
});
