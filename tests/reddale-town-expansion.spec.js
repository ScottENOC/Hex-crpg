const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.ReddaleSettlementRegistry && !!window.ReddaleTownExpansion, null, { timeout: 10000 });
}

test.describe('Reddale commercial town expansion', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('Reddale remains a town and now has a physical commercial/residential structure', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const s=window.SettlementScale.get('reddale');
            const r=window.ReddaleSettlementRegistry;
            return {tier:s?.tier,pop:s?.populationTarget,districts:s?.districts?.map(d=>d.id),buildings:r?.buildings?.length};
        });
        expect(result.tier).toBe('town');
        expect(result.pop).toBe(220);
        expect(result.districts).toEqual(expect.arrayContaining(['watch-quarter','market','ironbond','manor','residential']));
        expect(result.buildings).toBeGreaterThanOrEqual(8);
    });

    test('market square and ordinary trades exist outside the espionage quest buildings', async ({ page }) => {
        const result=await page.evaluate(()=>({
            market:window.campaign2ReddaleMarketCenter,
            kinds:window.ReddaleTownExpansion.buildings.map(b=>b.kind),
            residents:window.entities.filter(e=>e.homeSettlementId==='reddale').map(e=>`${e.name}:${e.occupation||''}`),
        }));
        expect(result.market).toBeTruthy();
        expect(result.kinds).toEqual(expect.arrayContaining(['warehouse','smithy','workshop','house','chapel']));
        expect(result.residents.some(x=>x.includes('Town Smith'))).toBe(true);
        expect(result.residents.some(x=>x.includes('Cooper'))).toBe(true);
        expect(result.residents.some(x=>x.includes('Market Broker'))).toBe(true);
    });

    test('existing Reddale political and espionage anchors remain in place', async ({ page }) => {
        const result=await page.evaluate(()=>({
            guard:window.campaign2ReddaleGuardhouseCenter,
            reeve:window.campaign2ReddaleReeveHouseCenter,
            inn:window.campaign2ReddaleInnCenter,
            guild:window.campaign2ReddaleGuildhouseCenter,
            manor:window.campaign2ReddaleManorCenter,
            guildEvidence:window.campaign2GuildEvidenceHex,
            manorEvidence:window.campaign2ManorEvidenceHex,
        }));
        expect(result.guard).toBeTruthy();
        expect(result.reeve).toBeTruthy();
        expect(result.inn).toBeTruthy();
        expect(result.guild).toBeTruthy();
        expect(result.manor).toBeTruthy();
        expect(result.guildEvidence).toBeTruthy();
        expect(result.manorEvidence).toBeTruthy();
    });

    test('new buildings do not overwrite the five existing anchor interiors', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const anchors=[window.campaign2ReddaleGuardhouseCenter,window.campaign2ReddaleReeveHouseCenter,window.campaign2ReddaleInnCenter,window.campaign2ReddaleGuildhouseCenter,window.campaign2ReddaleManorCenter].filter(Boolean);
            return {
                anchorTerrain:anchors.map(h=>window.getTerrainAt(h.q,h.r)?.name),
                tooClose:window.ReddaleTownExpansion.buildings.some(b=>anchors.some(a=>window.distance(a,b.center)<5)),
            };
        });
        expect(result.anchorTerrain.every(t=>t==='Wood Floor')).toBe(true);
        expect(result.tooClose).toBe(false);
    });

    test('the added town has meaningful storage, craft and domestic props', async ({ page }) => {
        const result=await page.evaluate(()=>{
            const centres=window.ReddaleTownExpansion.buildings.map(b=>b.center);
            const types=centres.map(h=>window.tileObjects[`${h.q},${h.r}`]?.type).filter(Boolean);
            return {types,homes:window.ReddaleTownExpansion.buildings.filter(b=>b.kind==='house').length};
        });
        expect(result.types).toContain('anvil');
        expect(result.types).toContain('storage_chest');
        expect(result.types).toContain('bed');
        expect(result.homes).toBeGreaterThanOrEqual(4);
    });
});