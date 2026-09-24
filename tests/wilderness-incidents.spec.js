const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.WildernessIncidents, null, { timeout: 10000 });
}

test.describe('persistent wilderness incidents', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('stores incidents inside already-persisted worldMapNotes state', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api=window.WildernessIncidents;
            const c=window.campaign2Landmarks.crossroads;
            const incident=api.spawnIncident('broken_cart',{q:c.q+130,r:c.r+15},{force:true,provenance:{origin:'Reddale',cargo:'cloth',person:'A'}});
            const store=window.worldMapNotes.__wildernessIncidentsV1;
            return {
                id:incident?.id,
                aliased:window.wildernessIncidents===store.incidents,
                stored:store.incidents.some(i=>i.id===incident?.id),
                type:store.incidents.find(i=>i.id===incident?.id)?.type,
            };
        });
        expect(result.id).toBeTruthy();
        expect(result.aliased).toBe(true);
        expect(result.stored).toBe(true);
        expect(result.type).toBe('broken_cart');
    });

    test('broken cart investigation creates a persistent follow-up trail', async ({ page }) => {
        const result=await page.evaluate(() => {
            const api=window.WildernessIncidents;
            const c=window.campaign2Landmarks.crossroads;
            const incident=api.spawnIncident('broken_cart',{q:c.q+130,r:c.r+15},{force:true,regionId:'aldervale',provenance:{origin:'Reddale',cargo:'lamp oil',person:'A'}});
            api.resolveIncident(incident.id,'investigate');
            const child=api.incidentById(incident.followUpIncidentId);
            return {parentId:incident.id,parentState:incident.state,childType:child?.type,parentRef:child?.parentIncidentId,childState:child?.state};
        });
        expect(result.parentState).toBe('discovered');
        expect(result.childType).toBe('fresh_tracks');
        expect(result.parentRef).toBe(result.parentId);
        expect(result.childState).toBe('active');
    });

    test('reporting a wreck resolves it and feeds the living-world event log', async ({ page }) => {
        const result=await page.evaluate(() => {
            const api=window.WildernessIncidents;
            const c=window.campaign2Landmarks.crossroads;
            const before=window.regions.aldervale.security;
            const incident=api.spawnIncident('broken_cart',{q:c.q+130,r:c.r+15},{force:true,regionId:'aldervale',provenance:{origin:'Reddale',cargo:'cloth',person:'A'}});
            api.resolveIncident(incident.id,'report');
            return {
                state:incident.state,
                resolution:incident.resolution,
                securityDelta:window.regions.aldervale.security-before,
                event:window.worldEvents.some(e=>e.type==='road_hazard_reported'),
            };
        });
        expect(result.state).toBe('resolved');
        expect(result.resolution).toBe('reported');
        expect(result.securityDelta).toBeGreaterThan(0);
        expect(result.event).toBe(true);
    });

    test('injured traveller supports compassionate and predatory resolutions with different consequences', async ({ page }) => {
        const result=await page.evaluate(() => {
            const api=window.WildernessIncidents;
            const c=window.campaign2Landmarks.crossroads;
            const baseHex={q:c.q+130,r:c.r+15};
            const rep0=window.factions.silverhart_kingdom.standing;
            const sec0=window.regions.aldervale.security;
            const helped=api.spawnIncident('injured_traveller',baseHex,{force:true,regionId:'aldervale',provenance:{person:'Elin Briar',origin:'Reddale',cargo:'grain'}});
            api.resolveIncident(helped.id,'help');
            const afterHelp={rep:window.factions.silverhart_kingdom.standing,sec:window.regions.aldervale.security};
            const robbed=api.spawnIncident('injured_traveller',{q:baseHex.q+20,r:baseHex.r+4},{force:true,regionId:'aldervale',provenance:{person:'Hale Kettle',origin:'Reddale',cargo:'salt'}});
            const goldBefore=window.player.gold;
            api.resolveIncident(robbed.id,'rob');
            return {
                helpResolution:helped.resolution,
                helpRep:afterHelp.rep-rep0,
                helpSecurity:afterHelp.sec-sec0,
                robResolution:robbed.resolution,
                robGold:window.player.gold-goldBefore,
                finalRep:window.factions.silverhart_kingdom.standing-afterHelp.rep,
                finalSecurity:window.regions.aldervale.security-afterHelp.sec,
            };
        });
        expect(result.helpResolution).toBe('helped');
        expect(result.helpRep).toBeGreaterThan(0);
        expect(result.helpSecurity).toBeGreaterThan(0);
        expect(result.robResolution).toBe('robbed');
        expect(result.robGold).toBeGreaterThan(0);
        expect(result.finalRep).toBeLessThan(0);
        expect(result.finalSecurity).toBeLessThan(0);
    });

    test('approaching evidence discovers and presents the incident without a loading screen', async ({ page }) => {
        const result=await page.evaluate(() => {
            const api=window.WildernessIncidents;
            const c=window.campaign2Landmarks.crossroads;
            const h={q:c.q+130,r:c.r+15};
            const incident=api.spawnIncident('roadside_grave',h,{force:true,provenance:{person:'Mara Wren',epitaph:'Remember me.',origin:'Reddale',cargo:'none'}});
            const p=window.entities.find(e=>e.side==='player'&&!e.rider);
            p.hex={...h};
            api.discoverNearby();
            return {
                state:incident.state,
                discovered:incident.discoveredAt!==null,
                modal:document.getElementById('dialogue-modal')?.style.display,
                text:document.getElementById('dialogue-message')?.innerText || '',
            };
        });
        expect(result.state).toBe('discovered');
        expect(result.discovered).toBe(true);
        expect(result.modal).toBe('block');
        expect(result.text).toContain('Mara Wren');
    });

    test('undiscovered incidents expire but discovered stories wait for the player', async ({ page }) => {
        const result=await page.evaluate(() => {
            const api=window.WildernessIncidents;
            const c=window.campaign2Landmarks.crossroads;
            const a=api.spawnIncident('poacher_cache',{q:c.q+130,r:c.r+15},{force:true});
            const b=api.spawnIncident('roadside_grave',{q:c.q+150,r:c.r+15},{force:true});
            b.state='discovered'; b.discoveredAt=window.worldSeconds;
            window.worldSeconds += api.constants.INCIDENT_LIFETIME_SECONDS + 1;
            api.expireOld();
            return {a:a.state,b:b.state};
        });
        expect(result.a).toBe('expired');
        expect(result.b).toBe('discovered');
    });
});
