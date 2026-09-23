// Procedural hostiles must never appear inside a settlement or within normal
// player vision of its limits. Low security may unlock authored riots, raids
// or sieges, but it never permits wilderness encounter generators to drop
// wolves/orcs/bandits into populated streets.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('SettlementSafety: permanent procedural-hostile exclusion', () => {
    test('blocks Silverhart itself and one normal vision range beyond the city limit', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const safety = window.SettlementSafety;
            const settlement = window.SettlementScale.get('silverhart');
            const limit = safety.limitsRadius(settlement);
            const vision = safety.standardVisionBuffer();
            const c = settlement.centre;
            return {
                limit, vision,
                inside: safety.isProceduralHostileSpawnBlocked({ q:c.q + limit - 1, r:c.r }),
                edgeOfBuffer: safety.isProceduralHostileSpawnBlocked({ q:c.q + limit + vision, r:c.r }),
                beyond: safety.isProceduralHostileSpawnBlocked({ q:c.q + limit + vision + 8, r:c.r }),
            };
        });
        expect(result.vision).toBeGreaterThanOrEqual(25);
        expect(result.inside).toBe(true);
        expect(result.edgeOfBuffer).toBe(true);
        expect(result.beyond).toBe(false);
    });

    test('low kingdom security never disables the settlement exclusion', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            window.regions.silverhart_kingdom.security = 5;
            return {
                proceduralGate: window.isNearAnyBuildingUnlessDire({ q:center.q + 5, r:center.r }, 30),
                centralGate: window.SettlementSafety.isProceduralHostileSpawnBlocked({ q:center.q + 5, r:center.r }),
            };
        });
        expect(result.proceduralGate).toBe(true);
        expect(result.centralGate).toBe(true);
    });

    test('wilderness well beyond settlements remains eligible', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const far={q:5000,r:5000};
            return {
                blocked:window.SettlementSafety.isProceduralHostileSpawnBlocked(far),
                legacyBlocked:window.isNearAnyBuildingUnlessDire(far,30),
            };
        });
        expect(result.blocked).toBe(false);
        expect(result.legacyBlocked).toBe(false);
    });
});

test.describe('Existing random encounter systems obey the permanent gate', () => {
    test('orc raiders cannot spawn near Silverhart even at dire security', async ({ page }) => {
        await createCharacter(page);
        const result=await page.evaluate(()=>{
            const center=window.campaign2PalaceThroneCenter;
            const player=window.entities.find(e=>e.side==='player'&&!e.rider);
            player.hex={q:center.q+3,r:center.r};
            window.regions.silverhart_kingdom.security=5;
            const realRandom=Math.random;let calls=0;
            Math.random=()=>{calls++;return calls===1?0:realRandom();};
            for(let i=0;i<40;i++){
                window.orcRaiderEncounterAccum=999;calls=0;
                window.checkOrcRaiderEncounter(player,0);
            }
            Math.random=realRandom;
            const spawned=window.entities.filter(e=>e.orcRaiderBand&&e.alive);
            return {
                spawned:spawned.length,
                unsafe:spawned.filter(e=>window.SettlementSafety.isProceduralHostileSpawnBlocked(e.hex)).length,
                close:spawned.filter(e=>window.distance(e.hex,center)<105).length,
            };
        });
        expect(result.unsafe).toBe(0);
        expect(result.close).toBe(0);
    });

    test('lich hunters cannot spawn inside the same settlement buffer', async ({ page }) => {
        await createCharacter(page);
        const result=await page.evaluate(()=>{
            const center=window.campaign2PalaceThroneCenter;
            const player=window.entities.find(e=>e.side==='player'&&!e.rider);
            player.hex={q:center.q-4,r:center.r};
            window.playerIsLich=true;
            window.regions.silverhart_kingdom.security=5;
            const realRandom=Math.random;let calls=0;
            Math.random=()=>{calls++;return calls===1?0:realRandom();};
            for(let i=0;i<40;i++){
                window.lichHunterEncounterAccum=999;calls=0;
                window.checkLichHunterEncounter(player,0);
            }
            Math.random=realRandom;
            const spawned=window.entities.filter(e=>e.lichHunterParty&&e.alive);
            return {unsafe:spawned.filter(e=>window.SettlementSafety.isProceduralHostileSpawnBlocked(e.hex)).length};
        });
        expect(result.unsafe).toBe(0);
    });

    test('the legacy building gate is broadened to settlement space for bandit-camp/world-pulse paths', async ({ page }) => {
        await createCharacter(page);
        const result=await page.evaluate(()=>{
            const s=window.SettlementScale.get('hollowmere');
            const c=s.centre;
            // Deliberately choose an open-ish point in the village safety area;
            // it need not be next to a particular interior to be protected.
            const h={q:c.q+50,r:c.r};
            return {
                central:window.SettlementSafety.isProceduralHostileSpawnBlocked(h),
                oldHelper:window.isNearAnyBuilding(h,30),
            };
        });
        expect(result.central).toBe(true);
        expect(result.oldHelper).toBe(true);
    });
});