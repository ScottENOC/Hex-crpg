const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.SilthandrielSettlementRegistry && !!window.SilthandrielCanopyExpansion, null, { timeout: 10000 });
}

test.describe("Sil'thandriel canopy capital", () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('registers as a multi-level capital rather than a few quest platforms', async ({ page }) => {
        const result = await page.evaluate(() => {
            const s = window.SettlementScale.get('silthandriel');
            const r = window.SilthandrielSettlementRegistry;
            return { tier:s?.tier, population:s?.populationTarget, floors:r.floors, platforms:r.inhabitedPlatforms, districts:r.districts.map(d=>d.id) };
        });
        expect(result.tier).toBe('capital');
        expect(result.population).toBe(430);
        expect(result.floors).toEqual([0,1,2,3]);
        expect(result.platforms).toBeGreaterThanOrEqual(12);
        expect(result.districts).toContain('high-boughs');
        expect(result.districts).toContain('lower-canopy');
    });

    test('empty upper-canopy space is Void rather than walkable ground terrain', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b=window.campaign2SilthandrielBuilding;
            const candidates=[];
            for(let q=b.minQ;q<=b.maxQ;q++) for(let r=b.minR;r<=b.maxR;r++) {
                const t=window.getTerrainAtFloor(q,r,3)?.name;
                if(t==='Void') { candidates.push({q,r,t}); if(candidates.length>=3) break; }
            }
            return candidates;
        });
        expect(result.length).toBeGreaterThan(0);
        expect(result.every(x=>x.t==='Void')).toBe(true);
    });

    test('the high bough creates a real third canopy height with resident life', async ({ page }) => {
        const result = await page.evaluate(() => ({
            high:window.campaign2SilthandrielHighBough,
            floor3:Object.keys(window.campaign2SilthandrielBuilding.floors[3]?.terrain||{}).filter(k=>window.campaign2SilthandrielBuilding.floors[3].terrain[k]!=='Void').length,
            residents:window.entities.filter(e=>e.homeSettlementId==='silthandriel'&&e.floor===3).map(e=>e.name),
        }));
        expect(result.high).toBeTruthy();
        expect(result.floor3).toBeGreaterThan(20);
        expect(result.residents.length).toBeGreaterThanOrEqual(3);
    });

    test('a second eastern ascent provides an independent ground to canopy route', async ({ page }) => {
        const result = await page.evaluate(() => {
            const a=window.campaign2SilthandrielEastAscent;
            const ground=window.tileObjects[`${a.ground.q},${a.ground.r}`];
            const lower=window.getTileObjectAtFloor(a.ground.q,a.ground.r,1);
            const floor1=window.getTileObjectAtFloor(a.upper.q,a.upper.r,1);
            const floor2=window.getTileObjectAtFloor(a.upper.q,a.upper.r,2);
            return {ground,lower,floor1,floor2,main:window.campaign2SilthandrielTreeStairHex};
        });
        expect(result.ground.type).toBe('stair_up');
        expect(result.ground.toFloor).toBe(1);
        expect(result.lower.type).toBe('stair_down');
        expect(result.floor1.type).toBe('stair_up');
        expect(result.floor1.toFloor).toBe(2);
        expect(result.floor2.type).toBe('stair_down');
        expect(result.main).toBeTruthy();
    });

    test('existing royal court and quest NPCs survive the expansion', async ({ page }) => {
        const result = await page.evaluate(() => ({
            court:window.campaign2ElvenCourtCenter,
            queen:window.entities.find(e=>e.name===window.campaign2ElfQueen?.name),
            lodge:window.campaign2ElvenLodgeCenter,
            mainStair:window.campaign2SilthandrielTreeStairHex,
        }));
        expect(result.court).toBeTruthy();
        expect(result.lodge).toBeTruthy();
        expect(result.mainStair).toBeTruthy();
        expect(result.queen?.floor).toBe(2);
    });

    test('the forest floor remains sparse compared with the inhabited canopy', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b=window.campaign2SilthandrielBuilding;
            let surfaceBuilt=0;
            for(let q=b.minQ;q<=b.maxQ;q++) for(let r=b.minR;r<=b.maxR;r++) {
                const name=window.getTerrainAt(q,r)?.name;
                if(name==='Wood Floor'||name==='Stone Floor'||name==='Cave Floor') surfaceBuilt++;
            }
            return {surfaceBuilt,canopy:window.SilthandrielSettlementRegistry.bridgeHexes};
        });
        expect(result.canopy).toBeGreaterThan(100);
        expect(result.surfaceBuilt).toBeLessThan(result.canopy/4);
    });
});