const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Old Mac farmstead expansion', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.FarmsteadExpansion?.stats?.expanded && window.campaign2FarmsteadExpansion);
    });

    test('farm has a household, workers, outbuildings, fields and mixed livestock', async ({ page }) => {
        const result = await page.evaluate(() => {
            const f = window.campaign2FarmsteadExpansion;
            return {
                population: f.population,
                residentNames: f.residentNames,
                liveResidents: window.entities.filter(e => e.isFarmsteadResident).map(e => ({ name:e.name, role:e.farmsteadRole })),
                barnRegion: window.interiorRegions.some(r => r.farmsteadBuildingId === 'old-mac-barn'),
                bunkhouseRegion: window.interiorRegions.some(r => r.farmsteadBuildingId === 'old-mac-workers-cottage'),
                fields: f.fields.map(field => ({
                    id: field.id,
                    dirt: Object.entries(window.overrideTerrain).filter(([k,t]) => {
                        const [q,r] = k.split(',').map(Number);
                        return q > field.minQ && q < field.maxQ && r > field.minR && r < field.maxR && t.name === 'Dirt';
                    }).length,
                    cropMarkers: Object.entries(window.tileObjects).filter(([k,o]) => {
                        const [q,r] = k.split(',').map(Number);
                        return q > field.minQ && q < field.maxQ && r > field.minR && r < field.maxR && o.farmCrop;
                    }).length,
                })),
                animals: window.entities.filter(e => e.isFarmsteadAnimal).map(e => e.name),
                oldMac: window.entities.some(e => e.name === 'Old Mac'),
            };
        });
        expect(result.population).toBe(6);
        expect(result.liveResidents).toHaveLength(5);
        expect(result.liveResidents.filter(x => x.role === 'worker')).toHaveLength(2);
        expect(result.barnRegion).toBe(true);
        expect(result.bunkhouseRegion).toBe(true);
        expect(result.fields).toHaveLength(2);
        result.fields.forEach(f => {
            expect(f.dirt).toBeGreaterThan(40);
            expect(f.cropMarkers).toBeGreaterThan(8);
        });
        expect(result.animals).toEqual(expect.arrayContaining(['Dairy Cow','Calf','Pig','Chicken 1']));
        expect(result.animals).toHaveLength(8);
        expect(result.oldMac).toBe(true);
    });

    test('authored bear side quest still exists beside the expanded farm', async ({ page }) => {
        const result = await page.evaluate(() => ({
            bear: window.entities.find(e => e.isSideQuestBear)?.name,
            bearHex: window.campaign2SideQuestBearHex,
            reyna: window.entities.some(e => e.dialogueId === 'reyna_fletcher'),
            farm: window.campaign2FarmHouseCenter,
        }));
        expect(result.bear).toBe('Grain-Raiding Bear');
        expect(result.bearHex).toBeTruthy();
        expect(result.reyna).toBe(true);
        expect(result.farm).toBeTruthy();
    });

    test('rebuilding Campaign 2 reproduces one farm household rather than duplicating it', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.setupVillageScene();
            return {
                residents: window.entities.filter(e => e.isFarmsteadResident).map(e => e.name),
                animals: window.entities.filter(e => e.isFarmsteadAnimal).length,
                farmRegions: window.interiorRegions.filter(r => r.farmsteadBuildingId).map(r => r.farmsteadBuildingId),
                baselineHasBarn: Object.keys(window._campaign2TerrainBaseline || {}).some(k => {
                    const f = window.campaign2FarmsteadExpansion?.barn;
                    return f && k === `${f.center.q},${f.center.r}`;
                }),
            };
        });
        expect(result.residents).toHaveLength(5);
        expect(new Set(result.residents).size).toBe(5);
        expect(result.animals).toBe(8);
        expect(result.farmRegions.sort()).toEqual(['old-mac-barn','old-mac-workers-cottage']);
        expect(result.baselineHasBarn).toBe(true);
    });
});