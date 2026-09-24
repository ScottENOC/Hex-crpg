const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.GreenskinSettlementRegistry && !!window.GreenskinSettlementExpansion, null, { timeout: 10000 });
}

test.describe('greenskin settlements have distinct built cultures', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test("Skarnak's Hold expands as an irregular militarised surface village", async ({ page }) => {
        const result = await page.evaluate(() => {
            const s=window.SettlementScale.get('skarnaks_hold');
            const r=window.GreenskinSettlementRegistry.orc;
            return {tier:s?.tier,pop:s?.populationTarget,districts:s?.districts?.map(d=>d.id),r};
        });
        expect(result.tier).toBe('village');
        expect(result.pop).toBe(110);
        expect(result.districts).toContain('fighting-pit');
        expect(result.districts).toContain('beast-pens');
        expect(result.r.forge).toBeTruthy();
        expect(result.r.pit).toBeTruthy();
    });

    test('the orc annexes visibly sprawl beyond the old stockade core', async ({ page }) => {
        const result = await page.evaluate(() => {
            const c=window.campaign2OrcStrongholdCenter;
            let dirt=0,farDirt=0;
            for(let q=c.q-18;q<=c.q+18;q++) for(let r=c.r-18;r<=c.r+18;r++) {
                if(window.getTerrainAt(q,r)?.name!=='Dirt') continue;
                dirt++;
                if(window.distance(c,{q,r})>8) farDirt++;
            }
            return {dirt,farDirt};
        });
        expect(result.dirt).toBeGreaterThan(80);
        expect(result.farDirt).toBeGreaterThan(20);
    });

    test('the Skarn-tooth site remains an outpost but gains a real hidden warren', async ({ page }) => {
        const result = await page.evaluate(() => {
            const s=window.SettlementScale.get('skarn_tooth_outpost');
            const b=window.campaign2GoblinWarrenBuilding;
            const floor=b.floors[-1];
            const cave=Object.values(floor.terrain).filter(v=>v==='Cave Floor').length;
            const wall=Object.values(floor.terrain).filter(v=>v==='Wall').length;
            return {tier:s?.tier,pop:s?.populationTarget,cave,wall,districts:s?.districts?.map(d=>d.id)};
        });
        expect(result.tier).toBe('hamlet');
        expect(result.pop).toBe(40);
        expect(result.districts).toContain('warren');
        expect(result.cave).toBeGreaterThan(30);
        expect(result.wall).toBeGreaterThan(result.cave);
    });

    test('the goblin warren has both a camp entrance and a separate escape route', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b=window.campaign2GoblinWarrenBuilding;
            const main=window.campaign2GoblinWarrenMain;
            const escape=window.campaign2GoblinWarrenEscape;
            return {
                same:main.q===escape.q&&main.r===escape.r,
                mainSurface:window.tileObjects[`${main.q},${main.r}`],
                mainBelow:b.floors[-1].tileObjects[`${main.q},${main.r}`],
                escapeSurface:window.tileObjects[`${escape.q},${escape.r}`],
                escapeBelow:b.floors[-1].tileObjects[`${escape.q},${escape.r}`],
            };
        });
        expect(result.same).toBe(false);
        expect(result.mainSurface.type).toBe('stair_down');
        expect(result.mainBelow.type).toBe('stair_up');
        expect(result.escapeSurface.type).toBe('stair_down');
        expect(result.escapeBelow.type).toBe('stair_up');
    });

    test('new ambient residents inhabit both surface cultures and the goblin underlevel', async ({ page }) => {
        const result = await page.evaluate(() => ({
            orcs:window.entities.filter(e=>e.homeSettlementId==='skarnaks_hold').map(e=>({name:e.name,floor:e.floor||0})),
            goblins:window.entities.filter(e=>e.homeSettlementId==='skarn_tooth_outpost').map(e=>({name:e.name,floor:e.floor||0})),
        }));
        expect(result.orcs.length).toBeGreaterThanOrEqual(4);
        expect(result.goblins.length).toBeGreaterThanOrEqual(4);
        expect(result.goblins.some(e=>e.floor===-1)).toBe(true);
    });

    test('existing greenskin leadership locations remain present', async ({ page }) => {
        const result = await page.evaluate(() => ({
            orcCenter:window.campaign2OrcStrongholdCenter,
            goblinCenter:window.campaign2GoblinCampCenter,
            orcWarlord:window.entities.some(e=>e.factionId==='orc_raiders' && /warlord/i.test(`${e.title||''} ${e.name||''}`)),
        }));
        expect(result.orcCenter).toBeTruthy();
        expect(result.goblinCenter).toBeTruthy();
        expect(result.orcWarlord).toBe(true);
    });
});