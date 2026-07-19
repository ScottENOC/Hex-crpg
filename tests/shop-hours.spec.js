// tests/shop-hours.spec.js
// Shops other than the tavern now keep real hours: a shopkeeper given a
// schedule (getNpcSchedules, gameEngine.js) only offers their wares during
// the block tagged `shop: true`; outside those hours they're literally
// somewhere else in the same small building — asleep in a bed tucked into
// their own shop, not a separate house — see isShopOpen and the
// campaign2*BedHex/*CounterHex globals (campaign2World.js).

const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

test.describe('isShopOpen', () => {
    test('a shopkeeper with no schedule at all is always open', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.worldSeconds = 2 * 3600; // 2 AM
            return window.isShopOpen('Nobody With A Schedule');
        });
        expect(result).toBe(true);
    });

    test('Wick Hallow is closed overnight and open during the day', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.worldSeconds = 3 * 3600;
            const nightOpen = window.isShopOpen('Wick Hallow');
            window.worldSeconds = 14 * 3600;
            const dayOpen = window.isShopOpen('Wick Hallow');
            return { nightOpen, dayOpen };
        });
        expect(result.nightOpen).toBe(false);
        expect(result.dayOpen).toBe(true);
    });

    test("Silverhart's clothier, magic dealer, and blacksmith are all closed overnight and open by day", async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            window.worldSeconds = 3 * 3600;
            const nightOpen = {
                clothier: window.isShopOpen('Mirelle Sondhe'),
                magicDealer: window.isShopOpen('Corvin Ashe'),
                blacksmith: window.isShopOpen('Torvald Anvik'),
            };
            window.worldSeconds = 14 * 3600;
            const dayOpen = {
                clothier: window.isShopOpen('Mirelle Sondhe'),
                magicDealer: window.isShopOpen('Corvin Ashe'),
                blacksmith: window.isShopOpen('Torvald Anvik'),
            };
            return { nightOpen, dayOpen };
        });
        expect(result.nightOpen).toEqual({ clothier: false, magicDealer: false, blacksmith: false });
        expect(result.dayOpen).toEqual({ clothier: true, magicDealer: true, blacksmith: true });
    });
});

test.describe('shopkeepers sleep above their own shop', () => {
    test('bed tileObjects exist in the clothier, magic shop, and smithy rooms', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => ({
            clothierBed: window.tileObjects[`${window.campaign2ClothierBedHex.q},${window.campaign2ClothierBedHex.r}`]?.type,
            magicDealerBed: window.tileObjects[`${window.campaign2MagicDealerBedHex.q},${window.campaign2MagicDealerBedHex.r}`]?.type,
            blacksmithBed: window.tileObjects[`${window.campaign2BlacksmithBedHex.q},${window.campaign2BlacksmithBedHex.r}`]?.type,
        }));
        expect(result.clothierBed).toBe('bed');
        expect(result.magicDealerBed).toBe('bed');
        expect(result.blacksmithBed).toBe('bed');
    });
});

test.describe('closed shops turn away the player instead of opening the shop', () => {
    test('Wick Hallow refuses to sell at night but sells during the day', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => { window.worldSeconds = 3 * 3600; });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Wick Hallow');
            window.npcDialogueTrees.wick_hallow(npc);
        });
        const nightDialogue = await readDialogue(page);
        expect(nightDialogue.options.some(o => o.toLowerCase().includes('wares'))).toBe(false);

        await page.evaluate(() => { window.worldSeconds = 14 * 3600; });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Wick Hallow');
            window.npcDialogueTrees.wick_hallow(npc);
        });
        const dayDialogue = await readDialogue(page);
        expect(dayDialogue.options.some(o => o.toLowerCase().includes('wares'))).toBe(true);
    });

    test("Silverhart's clothier refuses to sell at night but sells during the day", async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await page.evaluate(() => { window.worldSeconds = 3 * 3600; });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Mirelle Sondhe');
            window.npcDialogueTrees.silverhart_clothier(npc);
        });
        const nightDialogue = await readDialogue(page);
        expect(nightDialogue.options.some(o => o.toLowerCase().includes('see what you have'))).toBe(false);

        await page.evaluate(() => { window.worldSeconds = 14 * 3600; });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Mirelle Sondhe');
            window.npcDialogueTrees.silverhart_clothier(npc);
        });
        const dayDialogue = await readDialogue(page);
        expect(dayDialogue.options.some(o => o.toLowerCase().includes('see what you have'))).toBe(true);
    });
});
