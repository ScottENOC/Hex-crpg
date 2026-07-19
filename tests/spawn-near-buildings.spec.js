// Nothing should ever wander-spawn on top of a hand-placed site — the
// capital, a star fort, a village — regardless of which random-encounter
// system rolled it (wolves, orc raiders, lich hunters). isNearAnyBuilding
// itself was already correct and already used by the wolf encounter,
// but the orc-raider and lich-hunter encounters never checked it at all,
// so both could place an enemy right next to (or inside) Silverhart
// Palace, a star fort, Kragmoor, etc. Fixed via a single shared gate,
// isNearAnyBuildingUnlessDire (campaign2Dialogue.js) — used by all three
// spawn loops now — which only allows a close spawn once the kingdom's
// overall security has fallen to a genuinely dire level.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('isNearAnyBuildingUnlessDire: the shared gate every random encounter now uses', () => {
    test('blocks a hex right next to Silverhart Palace at normal security', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            window.regions.silverhart_kingdom.security = 55; // healthy, well above the dire floor
            return {
                blocked: window.isNearAnyBuildingUnlessDire({ q: center.q + 5, r: center.r }, 30),
                plainCheck: window.isNearAnyBuilding({ q: center.q + 5, r: center.r }, 30),
            };
        });
        expect(result.plainCheck).toBe(true);
        expect(result.blocked).toBe(true);
    });

    test('allows the same hex once kingdom security is genuinely dire', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            window.regions.silverhart_kingdom.security = 10; // below the dire threshold
            return window.isNearAnyBuildingUnlessDire({ q: center.q + 5, r: center.r }, 30);
        });
        expect(result).toBe(false);
    });

    test('a hex far from any building is never blocked, dire or not', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.regions.silverhart_kingdom.security = 55;
            const far = { q: 5000, r: 5000 };
            return window.isNearAnyBuildingUnlessDire(far, 30);
        });
        expect(result).toBe(false);
    });
});

test.describe('Orc raider and lich hunter encounters never spawn near a hand-placed building', () => {
    test('checkOrcRaiderEncounter never places an orc within range of a nearby building, real geometry aside', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // A synthetic building far from any real content, so the test
            // doesn't depend on guessing exactly how far Silverhart's own
            // sprawl of districts actually extends.
            const center = { q: 3000, r: 3000 };
            window.interiorRegions.push({ minQ: center.q - 2, maxQ: center.q + 2, minR: center.r - 2, maxR: center.r + 2 });
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: center.q + 25, r: center.r }; // within spawn-search range of the building, but not standing in it
            window.regions.silverhart_kingdom.security = 55;

            // Force the "does an encounter fire at all" chance roll to succeed every time (the outer
            // "does an encounter fire at all" roll) to guarantee a fire;
            // every later call (count, angle, distance within the spawn
            // loop) keeps using real randomness.
            const realRandom = Math.random;
            let calls = 0;
            Math.random = () => { calls++; return calls === 1 ? 0 : realRandom(); };

            for (let i = 0; i < 20; i++) {
                window.orcRaiderEncounterAccum = 999; // clear the interval gate every attempt
                calls = 0; // force the outer chance roll to succeed on every attempt, not just the first
                window.checkOrcRaiderEncounter(player, 0);
            }
            const spawned = window.entities.filter(e => e.orcRaiderBand && e.alive);
            Math.random = realRandom;

            const anyTooClose = spawned.some(e => window.distance(e.hex, center) < 30);
            return { spawnedCount: spawned.length, anyTooClose };
        });
        expect(result.spawnedCount).toBeGreaterThan(0); // confirms the forced roll actually fired at least once
        expect(result.anyTooClose).toBe(false);
    });

    test('checkLichHunterEncounter never places a hunter within range of a nearby building, real geometry aside', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = { q: -3000, r: -3000 };
            window.interiorRegions.push({ minQ: center.q - 2, maxQ: center.q + 2, minR: center.r - 2, maxR: center.r + 2 });
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: center.q - 25, r: center.r };
            window.playerIsLich = true;
            window.regions.silverhart_kingdom.security = 55;

            const realRandom = Math.random;
            let calls = 0;
            Math.random = () => { calls++; return calls === 1 ? 0 : realRandom(); };

            for (let i = 0; i < 20; i++) {
                window.lichHunterEncounterAccum = 999;
                calls = 0; // force the tier-chance roll to succeed on every attempt, not just the first
                window.checkLichHunterEncounter(player, 0);
            }
            const spawned = window.entities.filter(e => e.lichHunterParty && e.alive);
            Math.random = realRandom;

            const anyTooClose = spawned.some(e => window.distance(e.hex, center) < 30);
            return { spawnedCount: spawned.length, anyTooClose };
        });
        expect(result.spawnedCount).toBeGreaterThan(0);
        expect(result.anyTooClose).toBe(false);
    });

    test('a dire kingdom security lets an orc raider land close to the palace', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: center.q + 3, r: center.r };
            window.regions.silverhart_kingdom.security = 5; // dire

            const realRandom = Math.random;
            let calls = 0;
            Math.random = () => { calls++; return calls === 1 ? 0 : realRandom(); };

            let sawCloseSpawn = false;
            for (let i = 0; i < 40 && !sawCloseSpawn; i++) {
                window.orcRaiderEncounterAccum = 999;
                window.checkOrcRaiderEncounter(player, 0);
                sawCloseSpawn = window.entities.some(e => e.orcRaiderBand && e.alive && window.distance(e.hex, center) < 30);
            }
            Math.random = realRandom;
            return sawCloseSpawn;
        });
        expect(result).toBe(true);
    });
});
