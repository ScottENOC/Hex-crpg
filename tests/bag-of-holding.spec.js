const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Bag of Holding encumbrance', () => {
    test('passively offsets 40 carried weight without using an equipment slot', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.party[0];
            const accessoryBefore = player.equipped?.accessory || null;
            const capacityBefore = window.getPartyCarryCapacity();

            // Keep enough ordinary cargo in the pool that the negative-weight
            // bag cannot simply hit the zero-weight clamp.
            for (let i = 0; i < 10; i++) player.inventory.push('stone');
            const loadedWeight = window.getPartyCarryWeight();

            player.inventory.push('magic_backpack');
            const withBagWeight = window.getPartyCarryWeight();

            return {
                type: window.items.magic_backpack.type,
                bagWeight: window.getItemWeight('magic_backpack'),
                carryBonus: window.items.magic_backpack.carryBonus,
                loadedWeight,
                withBagWeight,
                capacityBefore,
                capacityAfter: window.getPartyCarryCapacity(),
                accessoryBefore,
                accessoryAfter: player.equipped?.accessory || null,
            };
        });

        expect(result.type).toBe('container');
        expect(result.bagWeight).toBe(-40);
        expect(result.loadedWeight - result.withBagWeight).toBeCloseTo(40, 8);
        expect(result.capacityAfter).toBe(result.capacityBefore);
        expect(result.accessoryAfter).toBe(result.accessoryBefore);
        expect(result.carryBonus).toBe(0);
    });

    test('multiple Bags of Holding stack their full weight offsets', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.partyInventory.length = 0;
            for (let i = 0; i < 20; i++) window.partyInventory.push('stone');
            const loadedWeight = window.getPartyCarryWeight();
            window.partyInventory.push('magic_backpack', 'magic_backpack');
            return {
                loadedWeight,
                withTwoBagsWeight: window.getPartyCarryWeight(),
            };
        });

        expect(result.loadedWeight - result.withTwoBagsWeight).toBeCloseTo(80, 8);
        expect(result.withTwoBagsWeight).toBeCloseTo(result.loadedWeight - 80, 8);
    });

    test('negative carried weight never reduces the party below its non-inventory weight', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.partyInventory.length = 0;
            const baseline = window.getPartyCarryWeight();
            window.partyInventory.push('magic_backpack', 'magic_backpack');
            return {
                baseline,
                withBags: window.getPartyCarryWeight(),
            };
        });
        expect(result.withBags).toBeCloseTo(result.baseline, 8);
    });

    test('dev all-items cheat grants 20 bags but still only two of ordinary items', async ({ page }) => {
        await createCharacter(page);
        const added = await page.evaluate(() => {
            const inventory = window.player.inventory;
            const count = id => inventory.filter(itemId => itemId === id).length;
            const before = {
                bags: count('magic_backpack'),
                daggers: count('dagger'),
            };

            window.addAllEquipment();

            return {
                bags: count('magic_backpack') - before.bags,
                daggers: count('dagger') - before.daggers,
            };
        });

        expect(added.bags).toBe(20);
        expect(added.daggers).toBe(2);
    });
});
