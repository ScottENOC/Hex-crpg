const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.DeepholdsCityExpansion?.stats?.expanded && !!window.DeepholdsSettlementRegistry, null, { timeout: 10000 });
}

test.describe('Deepholds vertical capital expansion', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('registers Kragmoor as a capital whose inhabited city is vertical', async ({ page }) => {
        const result = await page.evaluate(() => ({
            registry: window.DeepholdsSettlementRegistry,
            scale: window.SettlementScale?.get?.('deepholds'),
            stats: window.DeepholdsCityExpansion.stats,
        }));
        expect(result.registry.populationTarget).toBe(480);
        expect(result.scale.tier).toBe('capital');
        expect(result.registry.floors).toEqual([0,-1,-2,-3,-4,-5]);
        expect(result.registry.surfaceEntrances).toBe(2);
        expect(result.stats.inhabitedRooms).toBeGreaterThanOrEqual(13);
    });

    test('keeps the mountain surface sparse while adding a second freight entrance', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b=window.campaign2DeepholdsBuilding;
            let surfaceCave=0;
            for(let q=b.minQ;q<=b.maxQ;q++) for(let r=b.minR;r<=b.maxR;r++) {
                if(window.getTerrainAt(q,r)?.name==='Cave Floor') surfaceCave++;
            }
            const door=window.campaign2DeepholdsFreightDoor;
            const stair=window.campaign2DeepholdsFreightStair;
            return {
                surfaceCave,
                doorTerrain:window.getTerrainAt(door.q,door.r)?.name,
                doorObject:window.tileObjects[`${door.q},${door.r}`]?.type,
                stairObject:window.tileObjects[`${stair.q},${stair.r}`],
                below:window.getTileObjectAtFloor?.(stair.q,stair.r,-2),
            };
        });
        // Two compact vestibules, not a surface city painted over the massif.
        expect(result.surfaceCave).toBeLessThan(120);
        expect(result.doorTerrain).toBe('Cave Floor');
        expect(result.doorObject).toBe('door_open');
        expect(result.stairObject?.type).toBe('stair_down');
        expect(result.stairObject?.toFloor).toBe(-2);
        expect(result.below?.type).toBe('stair_up');
    });

    test('the Iron Keg tavern uses the same footprint across floors -1 and -2', async ({ page }) => {
        const result = await page.evaluate(() => {
            const d=window.campaign2DeepholdsCityDistricts;
            const b=window.campaign2DeepholdsBuilding;
            const stair={q:d.tavern.q,r:d.tavern.r+1};
            return {
                sameCenter:d.tavern.q===d.guesthall.q && d.tavern.r===d.guesthall.r,
                topTerrain:window.getTerrainAtFloor?.(d.tavern.q,d.tavern.r,-1)?.name,
                bottomTerrain:window.getTerrainAtFloor?.(d.guesthall.q,d.guesthall.r,-2)?.name,
                topStair:b.floors[-1].tileObjects[`${stair.q},${stair.r}`],
                bottomStair:b.floors[-2].tileObjects[`${stair.q},${stair.r}`],
            };
        });
        expect(result.sameCenter).toBe(true);
        expect(result.topTerrain).toBe('Cave Floor');
        expect(result.bottomTerrain).toBe('Cave Floor');
        expect(result.topStair).toMatchObject({type:'stair_down',toFloor:-2});
        expect(result.bottomStair).toMatchObject({type:'stair_up',toFloor:-1});
    });

    test('inhabited floors have distinct civic, trade and workers districts', async ({ page }) => {
        const result = await page.evaluate(() => {
            const r=window.DeepholdsSettlementRegistry;
            const rooms=window.DeepholdsCityExpansion.rooms;
            return {
                districts:r.districts.map(d=>({id:d.id,floor:d.floor})),
                byFloor:Object.fromEntries([-1,-2,-3].map(f=>[f,rooms.filter(x=>x.floor===f).map(x=>x.id)])),
                residents:window.entities.filter(e=>e.homeSettlementId==='deepholds').map(e=>({name:e.name,floor:e.floor,title:e.title})),
            };
        });
        expect(result.districts).toEqual(expect.arrayContaining([
            {id:'crown-halls',floor:-1},
            {id:'forge-market',floor:-2},
            {id:'workers-ward',floor:-3},
        ]));
        expect(result.byFloor[-1]).toEqual(expect.arrayContaining(['iron-keg-tavern','common-hall','ancestor-shrine','gate-barracks']));
        expect(result.byFloor[-2]).toEqual(expect.arrayContaining(['market-arcade','smith-row','store-hall','iron-keg-cellar-and-rooms']));
        expect(result.byFloor[-3]).toEqual(expect.arrayContaining(['family-hall-east','family-hall-south','steam-baths','miners-mess']));
        expect(result.residents.length).toBeGreaterThanOrEqual(12);
        expect(new Set(result.residents.map(r=>r.floor))).toEqual(new Set([-1,-2,-3]));
    });

    test('adds a second inhabited stair spine without bypassing the dangerous deep levels', async ({ page }) => {
        const result = await page.evaluate(() => {
            const d=window.campaign2DeepholdsCityDistricts;
            const b=window.campaign2DeepholdsBuilding;
            const a=d.workersStair, c=d.workersStair2;
            return {
                a1:b.floors[-1].tileObjects[`${a.q},${a.r}`],
                a2:b.floors[-2].tileObjects[`${a.q},${a.r}`],
                c2:b.floors[-2].tileObjects[`${c.q},${c.r}`],
                c3:b.floors[-3].tileObjects[`${c.q},${c.r}`],
                oldMineDown:Object.values(b.floors[-3].tileObjects).some(x=>x?.type==='stair_down'&&x?.toFloor===-4),
                sealedDeep:!Object.values(b.floors[-4].tileObjects).some(x=>x?.type==='stair_down'&&x?.toFloor===-5),
                deepExists:!!b.floors[-5],
            };
        });
        expect(result.a1).toMatchObject({type:'stair_down',toFloor:-2});
        expect(result.a2).toMatchObject({type:'stair_up',toFloor:-1});
        expect(result.c2).toMatchObject({type:'stair_down',toFloor:-3});
        expect(result.c3).toMatchObject({type:'stair_up',toFloor:-2});
        expect(result.oldMineDown).toBe(true);
        expect(result.sealedDeep).toBe(true);
        expect(result.deepExists).toBe(true);
    });
});