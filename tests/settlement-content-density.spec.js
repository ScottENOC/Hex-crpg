const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('expanded settlement content density', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await expect.poll(() => page.evaluate(() =>
            !!window.MillbrookSettlementRegistry && !!window.EmberlodeSettlementRegistry
        )).toBe(true);
        await expect.poll(() => page.evaluate(() =>
            (window.MillbrookSettlementRegistry?.residents?.length || 0) ===
            (window.MillbrookSettlementRegistry?.buildings?.length || -1)
        )).toBe(true);
    });

    test('Millbrook gives every added enterable building authored dialogue', async ({ page }) => {
        const info = await page.evaluate(() => {
            const r=window.MillbrookSettlementRegistry;
            return {
                buildings:r.buildings.length,
                residents:r.residents.length,
                coverage:r.contentCoverage,
                missing:r.buildings.filter(b=>!b.contentType||!b.residentName).map(b=>b.id),
                dialogueMissing:r.residents.filter(n=>!window.npcDialogueTrees[n.dialogueId]).map(n=>n.name),
                petra:!!window.entities.find(e=>e.name==='Petra Hollis'),
            };
        });
        expect(info.buildings).toBe(12);
        expect(info.residents).toBe(12);
        expect(info.coverage).toBe(1);
        expect(info.missing).toEqual([]);
        expect(info.dialogueMissing).toEqual([]);
        expect(info.petra).toBe(true);
    });

    test('Millbrook content mixes world information and flavour instead of generic filler', async ({ page }) => {
        const content = await page.evaluate(() => {
            const invoke=id=>{
                const npc=window.MillbrookSettlementRegistry.residents.find(n=>n.dialogueId===id);
                window.npcDialogueTrees[id](npc);
                return {
                    text:document.getElementById('dialogue-message').innerText,
                    options:Array.from(document.getElementById('dialogue-options').children).map(b=>b.innerText)
                };
            };
            return {
                inn:invoke('millbrook_innkeeper'),
                smith:invoke('millbrook_smith'),
                chapel:invoke('millbrook_chapel_keeper'),
                tinker:invoke('millbrook_nim')
            };
        });
        expect(content.inn.text).toMatch(/Northbound Hare/i);
        expect(content.inn.options.some(x=>/comes through|local advice/i.test(x))).toBe(true);
        expect(content.smith.options.some(x=>/levy|hills/i.test(x))).toBe(true);
        expect(content.chapel.options.some(x=>/silver flame/i.test(x))).toBe(true);
        expect(content.tinker.text).toMatch(/royal policy|hinges/i);
    });

    test('Emberlode and Millbrook both expose complete authored-building coverage', async ({ page }) => {
        const result=await page.evaluate(()=>({
            millbrook:window.MillbrookSettlementRegistry.contentCoverage,
            emberlode:window.EmberlodeSettlementRegistry.contentCoverage,
            totalBuildings:window.MillbrookSettlementRegistry.buildings.length+window.EmberlodeSettlementRegistry.buildings.length,
            totalCovered:window.MillbrookSettlementRegistry.contentCoveredBuildings+window.EmberlodeSettlementRegistry.contentCoveredBuildings
        }));
        expect(result.millbrook).toBe(1);
        expect(result.emberlode).toBe(1);
        expect(result.totalCovered).toBe(result.totalBuildings);
        expect(result.totalBuildings).toBe(22);
    });
});