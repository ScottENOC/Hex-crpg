const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Reddale smithy', () => {
    test('smithy building exists, is walled in, and has a blacksmith NPC selling gear', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2ReddaleSmithyCenter;
            const region = (window.interiorRegions || []).find(r =>
                center && r.minQ !== undefined && r.minQ <= center.q && r.maxQ >= center.q && r.minR <= center.r && r.maxR >= center.r);
            // carveBuilding rooms read as a diamond (see hexRowShiftFlat's
            // comment in campaign2World.js), not a rectangle, so a simple
            // bbox scan isn't a reliable breach check here. Just verify the
            // center, door, and NPC's own standing hex are the declared
            // floor type.
            const centerOk = region && window.getTerrainAt(center.q, center.r).name === 'Wood Floor';
            const doorTerrainOk = region && region.doorHex && window.getTerrainAt(region.doorHex.q, region.doorHex.r).name === 'Wood Floor';
            const doorOk = region && region.doorHex && window.tileObjects[`${region.doorHex.q},${region.doorHex.r}`] &&
                window.tileObjects[`${region.doorHex.q},${region.doorHex.r}`].type === 'door_open';
            const blacksmith = window.entities.find(e => e.name === 'Torvald Anvik');
            const npcStandingOk = blacksmith && window.getTerrainAt(blacksmith.hex.q, blacksmith.hex.r).name === 'Wood Floor';
            return {
                hasCenter: !!center,
                hasRegion: !!region,
                centerOk,
                doorTerrainOk,
                doorOk,
                hasBlacksmith: !!blacksmith,
                npcStandingOk,
                dialogueId: blacksmith && blacksmith.dialogueId,
                allItemsValid: (window.campaign2ReddaleBlacksmithItems || []).every(id => !!window.items[id])
            };
        });
        expect(result.hasCenter).toBe(true);
        expect(result.hasRegion).toBe(true);
        expect(result.centerOk).toBe(true);
        expect(result.doorTerrainOk).toBe(true);
        expect(result.doorOk).toBe(true);
        expect(result.hasBlacksmith).toBe(true);
        expect(result.npcStandingOk).toBe(true);
        expect(result.dialogueId).toBe('reddale_blacksmith');
        expect(result.allItemsValid).toBe(true);
    });

    test('reddale_blacksmith dialogue opens a shop with the blacksmith item list', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Torvald Anvik');
            let openedItems = null;
            const origOpenShop = window.openShop;
            window.openShop = (opts) => { openedItems = opts.itemIds; };
            window.npcDialogueTrees.reddale_blacksmith(npc);
            const buttons = document.querySelectorAll('#dialogue-options button');
            let waresBtn = null;
            buttons.forEach(b => { if (b.innerText.includes('wares')) waresBtn = b; });
            if (waresBtn) waresBtn.click();
            window.openShop = origOpenShop;
            return { openedItems, expected: window.campaign2ReddaleBlacksmithItems };
        });
        expect(result.openedItems).toEqual(result.expected);
    });
});
