const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Emberlode lived-in settlement', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await expect.poll(() => page.evaluate(() => !!window.EmberlodeSettlementRegistry)).toBe(true);
    });

    test('expands around the authored mine anchors without replacing them', async ({ page }) => {
        const info = await page.evaluate(() => ({
            centre: window.campaign2EmberlodeCenter,
            foreman: !!window.entities.find(e => e.name === 'Corran Vale'),
            miner: !!window.entities.find(e => e.name === 'Bettina Marrow'),
            ledger: !!Object.values(window.tileObjects).find(o => o.readId === 'emberlode_ledger'),
            registry: {
                buildings: window.EmberlodeSettlementRegistry.buildings.length,
                publicBuildings: window.EmberlodeSettlementRegistry.publicBuildings,
                dwellings: window.EmberlodeSettlementRegistry.dwellings,
                populationTarget: window.EmberlodeSettlementRegistry.populationTarget,
                anchors: window.EmberlodeSettlementRegistry.existingAnchors,
            },
        }));
        expect(info.centre).toBeTruthy();
        expect(info.foreman).toBe(true);
        expect(info.miner).toBe(true);
        expect(info.ledger).toBe(true);
        expect(info.registry.buildings).toBe(10);
        expect(info.registry.publicBuildings).toBe(5);
        expect(info.registry.dwellings).toBe(5);
        expect(info.registry.populationTarget).toBe(52);
        expect(info.registry.anchors).toEqual(['foremans-hall', 'bunkhouse', 'mine']);
    });

    test('every added enterable building has authored content and a named resident', async ({ page }) => {
        const coverage = await page.evaluate(() => {
            const r = window.EmberlodeSettlementRegistry;
            return {
                contentCoverage: r.contentCoverage,
                covered: r.contentCoveredBuildings,
                buildingCount: r.buildings.length,
                residentCount: r.residents.length,
                missing: r.buildings.filter(b => !b.contentType || !b.residentName).map(b => b.id),
                dialogueMissing: r.residents.filter(n => !window.npcDialogueTrees[n.dialogueId]).map(n => n.name),
            };
        });
        expect(coverage.buildingCount).toBe(10);
        expect(coverage.residentCount).toBe(10);
        expect(coverage.covered).toBe(coverage.buildingCount);
        expect(coverage.contentCoverage).toBe(1);
        expect(coverage.missing).toEqual([]);
        expect(coverage.dialogueMissing).toEqual([]);
    });

    test('public-building conversations provide humour, useful information and plot breadcrumbs', async ({ page }) => {
        const lines = await page.evaluate(() => {
            const sample = id => {
                const npc = window.EmberlodeSettlementRegistry.residents.find(n => n.dialogueId === id);
                window.npcDialogueTrees[id](npc);
                return {
                    message: document.getElementById('dialogue-message').innerText,
                    options: Array.from(document.getElementById('dialogue-options').children).map(b => b.innerText),
                };
            };
            return {
                assayer: sample('emberlode_assayer'),
                alewife: sample('emberlode_alewife'),
                shrine: sample('emberlode_shrine_keeper'),
            };
        });
        expect(lines.assayer.options.some(x => /unusual/i.test(x))).toBe(true);
        expect(lines.alewife.message).toMatch(/Crooked Pick/i);
        expect(lines.shrine.message).toMatch(/names|miner/i);
    });

    test('dialogue reacts to the existing goblin raid state', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.emberlodeRaided = true;
            const assayer = window.EmberlodeSettlementRegistry.residents.find(n => n.dialogueId === 'emberlode_assayer');
            window.npcDialogueTrees.emberlode_assayer(assayer);
            const assayerLine = document.getElementById('dialogue-message').innerText;
            const supply = window.EmberlodeSettlementRegistry.residents.find(n => n.dialogueId === 'emberlode_supply_keeper');
            window.npcDialogueTrees.emberlode_supply_keeper(supply);
            const supplyLine = document.getElementById('dialogue-message').innerText;
            return { assayerLine, supplyLine };
        });
        expect(result.assayerLine).toMatch(/goblins|ingots/i);
        expect(result.supplyLine).toMatch(/goblins|inventory/i);
    });

    test('rebuilding the campaign does not duplicate Emberlode expansion residents or buildings', async ({ page }) => {
        const before = await page.evaluate(() => ({
            buildings: window.EmberlodeSettlementRegistry.buildings.length,
            residents: window.entities.filter(e => e.emberlodeResident).length,
        }));
        await page.evaluate(() => window.setupVillageScene());
        await expect.poll(() => page.evaluate(() => !!window.EmberlodeSettlementRegistry)).toBe(true);
        const after = await page.evaluate(() => ({
            buildings: window.EmberlodeSettlementRegistry.buildings.length,
            residents: window.entities.filter(e => e.emberlodeResident).length,
        }));
        expect(after).toEqual(before);
    });
});