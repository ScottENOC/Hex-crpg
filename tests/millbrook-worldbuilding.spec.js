const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Millbrook worldbuilding', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.MillbrookExpansion?.stats?.expanded && window.MillbrookSettlementRegistry);
    });

    test('turns the one-house quest stop into a small northern village', async ({ page }) => {
        const result = await page.evaluate(() => ({
            buildings: window.MillbrookExpansion.stats.buildings,
            dwellings: window.MillbrookSettlementRegistry.dwellings,
            publicBuildings: window.MillbrookSettlementRegistry.publicBuildings,
            multiStorey: window.MillbrookSettlementRegistry.multiStorey,
            populationTarget: window.MillbrookSettlementRegistry.populationTarget,
            green: window.campaign2MillbrookGreenCenter,
        }));
        expect(result.buildings).toBeGreaterThanOrEqual(10);
        expect(result.dwellings).toBeGreaterThanOrEqual(8);
        expect(result.publicBuildings).toBeGreaterThanOrEqual(3);
        expect(result.multiStorey).toBeGreaterThanOrEqual(1);
        expect(result.populationTarget).toBe(36);
        expect(result.green).toBeTruthy();
    });

    test('preserves Petra Hollis and the existing Border War quartermaster hook', async ({ page }) => {
        const result = await page.evaluate(() => {
            const petra = window.entities.find(e => e.name === window.campaign2MillbrookVillager?.name);
            const qm = window.entities.find(e => e.name === window.campaign2BorderWarQuartermaster?.name);
            return {
                centre: window.campaign2MillbrookCenter,
                petra: petra ? { name:petra.name, hex:{...petra.hex} } : null,
                quartermaster: qm ? { name:qm.name, hex:{...qm.hex} } : null,
            };
        });
        expect(result.centre).toBeTruthy();
        expect(result.petra).toBeTruthy();
        expect(result.quartermaster).toBeTruthy();
        expect(result.petra.hex.q).toBe(result.centre.q + 1);
        expect(result.petra.hex.r).toBe(result.centre.r);
    });

    test('the inn has real upstairs accommodation on the seamless layered map', async ({ page }) => {
        const result = await page.evaluate(() => {
            const inn = window.MillbrookSettlementRegistry.buildings.find(b => b.kind === 'inn');
            const floor = inn?.multiStoryBuilding?.floors?.[1];
            return {
                exists: !!inn,
                stair: inn?.stair || null,
                upstairs: !!floor,
                beds: floor ? Object.values(floor.tileObjects || {}).filter(o => o.type === 'bed').length : 0,
                downStair: floor && inn?.stair ? floor.tileObjects[`${inn.stair.q},${inn.stair.r}`]?.type : null,
            };
        });
        expect(result.exists).toBe(true);
        expect(result.stair).toBeTruthy();
        expect(result.upstairs).toBe(true);
        expect(result.beds).toBeGreaterThanOrEqual(3);
        expect(result.downStair).toBe('stair_down');
    });

    test('registers Millbrook as a settlement so random hostile safety rules cover it', async ({ page }) => {
        const result = await page.evaluate(() => {
            const s = window.SettlementScale?.get?.('millbrook');
            const centre = window.campaign2MillbrookCenter;
            const atCentre = window.SettlementScale?.settlementAt?.(centre);
            return s ? { tier:s.tier, population:s.populationTarget, radius:s.radius, atCentre:atCentre?.id } : null;
        });
        expect(result).toEqual({ tier:'hamlet', population:36, radius:48, atCentre:'millbrook' });
    });

    test('rebuilds deterministically when Campaign 2 world generation runs again', async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = {
                buildings: window.MillbrookExpansion.stats.buildings,
                centre: { ...window.campaign2MillbrookCenter },
            };
            window.setupVillageScene();
            return {
                before,
                afterBuildings: window.MillbrookExpansion.stats.buildings,
                afterCentre: { ...window.campaign2MillbrookCenter },
                registry: !!window.MillbrookSettlementRegistry,
            };
        });
        expect(result.registry).toBe(true);
        expect(result.afterBuildings).toBe(result.before.buildings);
        expect(result.afterCentre).toEqual(result.before.centre);
    });
});
