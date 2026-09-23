const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

const EXISTING_NPCS = [
    'Ossian Fell','Mirelle Sondhe','Corvin Ashe','Perrin Vance',
];

test.describe('Silverhart capital rebuild', () => {
    test('preserves existing authored merchant, noble and thieves-guild anchors', async ({ page }) => {
        await createCharacter(page);
        const result=await page.evaluate((names)=>({
            npcs:names.map(name=>({name,exists:!!window.entities.find(e=>e.name===name)})),
            palace:window.campaign2PalaceThroneCenter,
            stable:window.campaign2SilverhartStableCenter,
            goods:window.campaign2SilverhartGeneralGoodsCenter,
            manor:window.campaign2SilverhartManorCenter,
            thieves:window.campaign2ThievesGuildCenter,
            neighbor:window.campaign2SilverhartNeighborHouseCenter,
        }),EXISTING_NPCS);
        result.npcs.forEach(x=>expect(x.exists,x.name).toBe(true));
        for(const key of ['palace','stable','goods','manor','thieves','neighbor']) expect(result[key],key).toBeTruthy();
    });

    test('has two planned rings with explicit local detours around preserved authored walls, plus six radial avenues/gates', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(()=>!!window.SilverhartCapitalRegistry?.ringDiagnostics);
        const result=await page.evaluate(()=>{
            const c=window.campaign2PalaceThroneCenter;
            const inner=window.campaign2SilverhartRingRoadRadius;
            const outer=window.campaign2SilverhartOuterRingRadius;
            const dirs=[{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
            const avenueSamples=dirs.map(d=>{
                const h={q:c.q+d.q*40,r:c.r+d.r*40};
                return window.getTerrainAt(h.q,h.r).name;
            });
            const diagnostics=window.SilverhartCapitalRegistry.ringDiagnostics;
            const check=d=>({
                total:d.total,
                pathCount:d.pathCount,
                blocked:d.blocked.length,
                detours:d.detours.length,
                detoursAreRoad:d.detours.every(h=>window.getTerrainAt(h.q,h.r).name==='Path'),
            });
            return {inner,outer,avenueSamples,innerDiag:check(diagnostics.inner),outerDiag:check(diagnostics.outer),stats:window.SilverhartCapitalRebuild.stats};
        });
        expect(result.inner).toBeGreaterThan(23);
        expect(result.outer).toBeGreaterThan(result.inner);
        for(const diag of [result.innerDiag,result.outerDiag]) {
            expect(diag.pathCount+diag.blocked).toBe(diag.total);
            expect(diag.pathCount).toBeGreaterThan(diag.total*0.8);
            expect(diag.detoursAreRoad).toBe(true);
            if(diag.blocked>0) expect(diag.detours).toBeGreaterThan(0);
        }
        result.avenueSamples.forEach(t=>expect(t).toBe('Path'));
        expect(result.stats.avenues).toBe(6);
        expect(result.stats.gates).toBeGreaterThanOrEqual(18);
    });

    test('adds substantial multi-storey urban infill across distinct quarters', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(()=>window.SilverhartCapitalRebuild?.stats?.buildings>=15);
        const result=await page.evaluate(()=>({
            stats:window.SilverhartCapitalRebuild.stats,
            ids:window.SilverhartCapitalRegistry.buildings.map(b=>b.id),
            districts:window.SilverhartCapitalRegistry.buildings.map(b=>b.district),
            upperFloors:window.SilverhartCapitalRegistry.buildings.filter(b=>b.multiStoryBuilding).map(b=>({id:b.id,stair:b.stair,floors:b.floors})),
        }));
        expect(result.stats.buildings).toBeGreaterThanOrEqual(15);
        expect(result.stats.multiStorey).toBeGreaterThanOrEqual(10);
        for(const district of ['merchant','wealthy','civic','commons','warrens']) {
            expect(result.districts.includes(district),district).toBe(true);
        }
        expect(result.upperFloors.length).toBe(result.stats.multiStorey);
        result.upperFloors.forEach(x=>expect(x.stair).toBeTruthy());
    });

    test('ordinary inns are vertically organised with accommodation above public ground floors', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(()=>window.SilverhartCapitalRegistry?.buildings?.filter(b=>String(b.kind||'').includes('inn')).length>=2);
        const result=await page.evaluate(()=>{
            const inns=window.SilverhartCapitalRegistry.buildings.filter(b=>b.kind.includes('inn'));
            return inns.map(b=>{
                const upper=b.multiStoryBuilding?.floors?.[1];
                const types=Object.values(upper?.tileObjects||{}).map(o=>o.type);
                return {id:b.id,floors:b.floors,hasStair:types.includes('stair_down'),beds:types.filter(t=>t==='bed').length};
            });
        });
        expect(result.length).toBeGreaterThanOrEqual(2);
        result.forEach(inn=>{
            expect(inn.floors).toBeGreaterThanOrEqual(2);
            expect(inn.hasStair).toBe(true);
            expect(inn.beds).toBeGreaterThan(0);
        });
    });

    test('districts remain semantic labels only and do not introduce loading-zone state', async ({ page }) => {
        await createCharacter(page);
        const result=await page.evaluate(()=>{
            const s=window.SettlementScale.get('silverhart');
            return {
                ids:s.districts.map(d=>d.id),
                forbidden:s.districts.some(d=>'loaded' in d||'active' in d||'materialisationBudget' in d||'loadRadius' in d),
                streamerExists:!!window.WorldChunkStreaming,
            };
        });
        for(const id of ['palace','merchant','wealthy','civic','diplomatic','commons','warrens']) expect(result.ids).toContain(id);
        expect(result.forbidden).toBe(false);
        expect(result.streamerExists).toBe(true);
    });
});
