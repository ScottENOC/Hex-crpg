// tests/farming.spec.js
// The Stardew-style homestead built on top of the player's cottage: buy the
// adjoining field (construction.js's buy_field order), fence it hex-by-hex
// with wood, buy a lamb from Wick Hallow once it's enclosed, and plant apple
// trees from carried fruit. See buyPlayerField/getFieldBoundaryHexes/
// placeFieldFence/buyFieldLamb/plantAppleTree in campaign2World.js.

const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

async function buildCottage(page) {
    return page.evaluate(() => {
        const plot = window.campaign2PlayerCottagePlot;
        window.buildPlayerCottage(plot.q, plot.r);
        return plot;
    });
}

test.describe('buying the field', () => {
    test('buy_field is unavailable before the cottage is built, available after', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => window.buildOrders.buy_field.isAvailable());
        expect(before).toBeFalsy();

        await buildCottage(page);
        const after = await page.evaluate(() => window.buildOrders.buy_field.isAvailable());
        expect(after).toBe(true);
    });

    test('fulfilling buy_field with gold marks the field bought and registers its bounds', async ({ page }) => {
        await createCharacter(page);
        await buildCottage(page);
        const result = await page.evaluate(() => {
            window.party[0].gold = 100;
            const ok = window.fulfillBuildOrder('buy_field', true);
            return {
                ok,
                bought: window.campaign2PlayerFieldBought,
                field: window.campaign2PlayerField,
                gold: window.party[0].gold,
                isDone: window.buildOrders.buy_field.isDone(),
            };
        });
        expect(result.ok).toBe(true);
        expect(result.bought).toBe(true);
        expect(result.field).toBeTruthy();
        expect(result.gold).toBe(50);
        expect(result.isDone).toBe(true);
    });

    test('buy_field has no materials option (cost: null) — paying with materials fails', async ({ page }) => {
        await createCharacter(page);
        await buildCottage(page);
        const result = await page.evaluate(() => {
            window.party[0].gold = 100;
            const ok = window.fulfillBuildOrder('buy_field', false);
            return { ok, bought: window.campaign2PlayerFieldBought };
        });
        expect(result.ok).toBe(false);
        expect(result.bought).toBeFalsy();
    });
});

test.describe('fencing the field', () => {
    async function buyField(page) {
        await buildCottage(page);
        await page.evaluate(() => {
            window.party[0].gold = 100;
            window.fulfillBuildOrder('buy_field', true);
        });
    }

    test('every boundary hex is fenceable and the field starts unfenced', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => ({
            boundaryCount: window.getFieldBoundaryHexes().length,
            fenced: window.isFieldFullyFenced(),
        }));
        expect(result.boundaryCount).toBeGreaterThan(0);
        expect(result.fenced).toBe(false);
    });

    test('placing a fence segment consumes one wood and places fence_h/fence_v', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => {
            window.player.inventory.push('wood');
            const hex = window.getFieldBoundaryHexes()[0];
            window.placeFieldFence(hex.q, hex.r);
            const obj = window.tileObjects[`${hex.q},${hex.r}`];
            return {
                woodLeft: window.player.inventory.filter(i => i === 'wood').length,
                objType: obj && obj.type,
                expectedOrientation: hex.orientation === 'h' ? 'fence_h' : 'fence_v',
            };
        });
        expect(result.woodLeft).toBe(0);
        expect(result.objType).toBe(result.expectedOrientation);
    });

    test('placing a fence segment without wood fails and leaves the hex empty', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => {
            const hex = window.getFieldBoundaryHexes()[0];
            window.placeFieldFence(hex.q, hex.r);
            return window.tileObjects[`${hex.q},${hex.r}`];
        });
        expect(result).toBeUndefined();
    });

    test('fencing every boundary hex makes the field fully fenced', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => {
            const hexes = window.getFieldBoundaryHexes();
            hexes.forEach(h => {
                window.player.inventory.push('wood');
                window.placeFieldFence(h.q, h.r);
            });
            return window.isFieldFullyFenced();
        });
        expect(result).toBe(true);
    });
});

test.describe('buying a lamb', () => {
    async function buyAndFenceField(page) {
        await buildCottage(page);
        await page.evaluate(() => {
            window.party[0].gold = 100;
            window.fulfillBuildOrder('buy_field', true);
            const hexes = window.getFieldBoundaryHexes();
            hexes.forEach(h => {
                window.player.inventory.push('wood');
                window.placeFieldFence(h.q, h.r);
            });
        });
    }

    test('buyFieldLamb refuses an unfenced field', async ({ page }) => {
        await createCharacter(page);
        await buildCottage(page);
        await page.evaluate(() => {
            window.party[0].gold = 100;
            window.fulfillBuildOrder('buy_field', true);
        });
        const before = await page.evaluate(() => window.entities.filter(e => e.customImage === 'sheep').length);
        await page.evaluate(() => window.buyFieldLamb());
        const after = await page.evaluate(() => window.entities.filter(e => e.customImage === 'sheep').length);
        expect(after).toBe(before);
    });

    test('buyFieldLamb spawns a tame sheep entity inside the fenced field', async ({ page }) => {
        await createCharacter(page);
        await buyAndFenceField(page);
        const before = await page.evaluate(() => window.entities.filter(e => e.customImage === 'sheep').length);
        const result = await page.evaluate(() => {
            window.buyFieldLamb();
            const field = window.campaign2PlayerField;
            const lamb = window.entities.find(e => e.name === 'Lamb');
            return {
                lamb: lamb ? {
                    hp: lamb.hp, side: lamb.side, isNPC: lamb.isNPC, dialogueId: lamb.dialogueId,
                    tags: lamb.tags, insideField: lamb.hex.q > field.minQ && lamb.hex.q < field.maxQ && lamb.hex.r > field.minR && lamb.hex.r < field.maxR,
                } : null,
            };
        });
        const after = await page.evaluate(() => window.entities.filter(e => e.customImage === 'sheep').length);
        expect(after).toBe(before + 1);
        expect(result.lamb).toBeTruthy();
        expect(result.lamb.side).toBe('neutral');
        expect(result.lamb.isNPC).toBe(true);
        expect(result.lamb.dialogueId).toBe('farm_sheep');
        expect(result.lamb.tags).toContain('animal');
        expect(result.lamb.insideField).toBe(true);
    });

    test('Wick Hallow only offers to sell a lamb once the field is fully fenced', async ({ page }) => {
        await createCharacter(page);
        await buildCottage(page);
        await page.evaluate(() => {
            window.party[0].gold = 100;
            window.fulfillBuildOrder('buy_field', true);
        });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Wick Hallow');
            window.npcDialogueTrees.wick_hallow(npc);
        });
        const beforeFence = await readDialogue(page);
        expect(beforeFence.options.some(l => l.toLowerCase().includes('buy a lamb'))).toBe(false);

        await page.evaluate(() => {
            const hexes = window.getFieldBoundaryHexes();
            hexes.forEach(h => {
                window.player.inventory.push('wood');
                window.placeFieldFence(h.q, h.r);
            });
        });
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Wick Hallow');
            window.npcDialogueTrees.wick_hallow(npc);
        });
        const afterFence = await readDialogue(page);
        expect(afterFence.options.some(l => l.toLowerCase().includes('buy a lamb'))).toBe(true);
    });
});

test.describe('planting apple trees', () => {
    async function buyField(page) {
        await buildCottage(page);
        await page.evaluate(() => {
            window.party[0].gold = 100;
            window.fulfillBuildOrder('buy_field', true);
        });
    }

    test('planting consumes one apple and places a harvestable fruit_tree', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => {
            window.player.inventory.push('fruit');
            const field = window.campaign2PlayerField;
            const hex = { q: field.minQ + 1, r: field.minR + 1 };
            window.plantAppleTree(hex.q, hex.r);
            const obj = window.tileObjects[`${hex.q},${hex.r}`];
            return {
                fruitLeft: window.player.inventory.filter(i => i === 'fruit').length,
                objType: obj && obj.type,
                hasFruit: obj && obj.hasFruit,
            };
        });
        expect(result.fruitLeft).toBe(0);
        expect(result.objType).toBe('fruit_tree');
        expect(result.hasFruit).toBe(true);
    });

    test('planting without an apple in inventory fails', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => {
            const field = window.campaign2PlayerField;
            const hex = { q: field.minQ + 1, r: field.minR + 1 };
            window.plantAppleTree(hex.q, hex.r);
            return window.tileObjects[`${hex.q},${hex.r}`];
        });
        expect(result).toBeUndefined();
    });

    test('the planted tree is harvestable via the normal fruit-tree harvest cycle', async ({ page }) => {
        await createCharacter(page);
        await buyField(page);
        const result = await page.evaluate(() => {
            window.player.inventory.push('fruit');
            const field = window.campaign2PlayerField;
            const hex = { q: field.minQ + 1, r: field.minR + 1 };
            window.plantAppleTree(hex.q, hex.r);
            const before = window.player.inventory.filter(i => i === 'fruit').length;
            window.harvestFruitTree(hex.q, hex.r);
            const after = window.player.inventory.filter(i => i === 'fruit').length;
            return { gained: after - before };
        });
        expect(result.gained).toBeGreaterThan(0);
    });
});
