const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.BorderFortsSettlementRegistry && !!window.BorderFortsExpansion, null, { timeout: 10000 });
}

test.describe('border forts become distinct lived-in military settlements', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('Northwatch is registered as a crowded active-front garrison', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const s=window.SettlementScale.get('northwatch');
            const r=window.NorthwatchSettlementRegistry;
            return {tier:s?.tier,pop:s?.populationTarget,frontline:r?.frontline,districts:s?.districts?.map(d=>d.id),sites:r?.sites?.map(x=>x.kind)};
        });
        expect(result.tier).toBe('village');
        expect(result.pop).toBe(95);
        expect(result.frontline).toBe(true);
        expect(result.districts).toContain('field-hospital');
        expect(result.districts).toContain('supply-line');
        expect(result.sites).toContain('infirmary');
        expect(result.sites).toContain('stable');
    });

    test('Ridgehold is a quieter permanent reserve garrison', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const s=window.SettlementScale.get('ridgehold');
            const r=window.RidgeholdSettlementRegistry;
            return {tier:s?.tier,pop:s?.populationTarget,frontline:r?.frontline,districts:s?.districts?.map(d=>d.id),sites:r?.sites?.map(x=>x.kind)};
        });
        expect(result.tier).toBe('village');
        expect(result.pop).toBe(78);
        expect(result.frontline).toBe(false);
        expect(result.districts).toContain('drill-ground');
        expect(result.districts).toContain('garrison-row');
        expect(result.sites).toContain('armoury');
        expect(result.sites).toContain('households');
    });

    test('new residents belong to the correct fort rather than a shared generic settlement', async ({ page }) => {
        const result=await page.evaluate(()=>({
            north:window.entities.filter(e=>e.homeSettlementId==='northwatch').map(e=>e.name),
            ridge:window.entities.filter(e=>e.homeSettlementId==='ridgehold').map(e=>e.name),
        }));
        expect(result.north).toEqual(expect.arrayContaining(['Sister Elwen Marr','Quartermaster Venn','Hessa Coil']));
        expect(result.ridge).toEqual(expect.arrayContaining(['Sergeant Alwen Pike','Marta Rusk','Nell Pike','Corin Pike']));
        expect(result.north.length).toBeGreaterThanOrEqual(6);
        expect(result.ridge.length).toBeGreaterThanOrEqual(6);
    });

    test('the active front has hospital and supply infrastructure while the reserve has training and households', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const sites=window.BorderFortsExpansion.sites;
            const by=id=>sites.find(s=>s.id===id)?.center;
            const nInf=by('northwatch-infirmary'), nStores=by('northwatch-quartermaster');
            const rHomes=by('ridgehold-households'), rDrill=window.campaign2RidgeholdCenter && {q:window.campaign2RidgeholdCenter.q,r:window.campaign2RidgeholdCenter.r+15};
            return {
                northBeds:Object.values(window.tileObjects).filter(o=>o?.type==='bed').length,
                northInf:nInf, northStores:nStores,
                northChest:nStores&&window.tileObjects[`${nStores.q},${nStores.r}`]?.type,
                ridgeHomes:rHomes,
                ridgeDrillObjects:rDrill ? [
                    window.tileObjects[`${rDrill.q},${rDrill.r}`]?.type,
                    window.tileObjects[`${rDrill.q-3},${rDrill.r}`]?.type,
                    window.tileObjects[`${rDrill.q+3},${rDrill.r}`]?.type,
                ] : [],
            };
        });
        expect(result.northInf).toBeTruthy();
        expect(result.northStores).toBeTruthy();
        expect(result.northChest).toBe('storage_chest');
        expect(result.northBeds).toBeGreaterThanOrEqual(4);
        expect(result.ridgeHomes).toBeTruthy();
        expect(result.ridgeDrillObjects).toEqual(['training_dummy','training_dummy','training_dummy']);
    });

    test('the original tactical fort anchors and gates survive the settlement expansion', async ({ page }) => {
        const result=await page.evaluate(()=>({
            northCenter:window.campaign2NorthwatchCenter,
            northRegion:!!window.campaign2NorthwatchFortRegion,
            northGate:window.campaign2NorthwatchGateHex,
            northKeep:!!window.campaign2NorthwatchKeepRegion,
            ridgeCenter:window.campaign2RidgeholdCenter,
            ridgeRegion:!!window.campaign2RidgeholdFortRegion,
        }));
        expect(result.northCenter).toBeTruthy();
        expect(result.northRegion).toBe(true);
        expect(result.northGate).toBeTruthy();
        expect(result.northKeep).toBe(true);
        expect(result.ridgeCenter).toBeTruthy();
        expect(result.ridgeRegion).toBe(true);
    });

    test('the inherited Deepholds freight doorway remains an actual cave threshold', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const d=window.campaign2DeepholdsFreightDoor;
            return d ? {terrain:window.getTerrainAt(d.q,d.r)?.name,obj:window.tileObjects[`${d.q},${d.r}`]?.type} : null;
        });
        expect(result).toBeTruthy();
        expect(result.terrain).toBe('Cave Floor');
        expect(result.obj).toBe('door_open');
    });
});