// tests/world-pulse-camps-caravans.spec.js
// Living-world roadmap A1 (physical caravans) and A2 (self-seeding bandit
// camps that re-populate low-security wilderness and reward its recovery
// when cleared) — see worldPulse.js.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('A2: self-seeding bandit camps', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('3 in-game days below the security threshold seeds a camp of bandits with a campfire', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 10;
            window._banditCampLowSecurityAccum = 0;
            window._activeBanditCamp = null;
            window.checkBanditCampSeeding(3 * 24 * 3600 + 1);
            const camp = window._activeBanditCamp;
            const members = camp ? window.entities.filter(e => e.banditCampId === camp.hexes[0]) : [];
            const fireplace = camp ? window.tileObjects[`${camp.hexes[0].q},${camp.hexes[0].r}`] : null;
            return { seeded: !!camp, memberCount: members.length, allBandits: members.every(e => e.name === 'Bandit'), fireplace };
        });
        expect(result.seeded).toBe(true);
        expect(result.memberCount).toBeGreaterThanOrEqual(3);
        expect(result.allBandits).toBe(true);
        expect(result.fireplace?.type).toBe('fireplace');
    });

    test('staying above the threshold never seeds a camp, even over a long time', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 80;
            window._banditCampLowSecurityAccum = 0;
            window._activeBanditCamp = null;
            window.checkBanditCampSeeding(10 * 24 * 3600);
            return window._activeBanditCamp;
        });
        expect(result).toBeNull();
    });

    test('a second camp never seeds while one is already active', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 10;
            window._banditCampLowSecurityAccum = 0;
            window._activeBanditCamp = null;
            window.checkBanditCampSeeding(3 * 24 * 3600 + 1);
            const firstCamp = window._activeBanditCamp;
            const countAfterFirst = window.entities.filter(e => e.name === 'Bandit').length;
            window.checkBanditCampSeeding(3 * 24 * 3600 + 1); // still below threshold, camp still alive
            const countAfterSecondAttempt = window.entities.filter(e => e.name === 'Bandit').length;
            return { firstCamp: !!firstCamp, countAfterFirst, countAfterSecondAttempt };
        });
        expect(result.firstCamp).toBe(true);
        expect(result.countAfterSecondAttempt).toBe(result.countAfterFirst);
    });

    test('clearing every camp bandit rewards aldervale security and clears the active-camp flag', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.aldervale.security = 10;
            window._banditCampLowSecurityAccum = 0;
            window._activeBanditCamp = null;
            window.checkBanditCampSeeding(3 * 24 * 3600 + 1);
            const camp = window._activeBanditCamp;
            const secBefore = window.regions.aldervale.security;
            window.entities.filter(e => e.banditCampId === camp.hexes[0]).forEach(e => { e.alive = false; });
            window.checkBanditCampSeeding(0); // runs checkBanditCampCleared internally
            return { secAfter: window.regions.aldervale.security, secBefore, campCleared: window._activeBanditCamp === null };
        });
        expect(result.secAfter).toBeGreaterThan(result.secBefore);
        expect(result.campCleared).toBe(true);
    });
});

test.describe('A1: physical caravans', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('a pending caravan spawns 3 neutral entities heading down the road once the player is outdoors', async ({ page }) => {
        const result = await page.evaluate(() => {
            // The scripted intro starts the player inside the tavern
            // interior — move them out to the crossroads (well outside any
            // registered interior region) so checkCaravanSpawn's "player is
            // outdoors" gate actually passes.
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: window.campaign2Landmarks.crossroads.q, r: window.campaign2Landmarks.crossroads.r };
            window._pendingCaravanArrival = true;
            window._activeCaravan = null;
            window.checkCaravanSpawn();
            const camp = window._activeCaravan;
            const members = camp ? window.entities.filter(e => camp.memberIds.includes(e.id)) : [];
            return {
                spawned: !!camp,
                count: members.length,
                allNeutral: members.every(e => e.side === 'neutral'),
                allHaveDestination: members.every(e => !!e.destination),
                flagCleared: window._pendingCaravanArrival === false,
            };
        });
        expect(result.spawned).toBe(true);
        expect(result.count).toBe(3);
        expect(result.allNeutral).toBe(true);
        expect(result.allHaveDestination).toBe(true);
        expect(result.flagCleared).toBe(true);
    });

    test('a second pending caravan does not spawn while one is already active', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: window.campaign2Landmarks.crossroads.q, r: window.campaign2Landmarks.crossroads.r };
            window._pendingCaravanArrival = true;
            window._activeCaravan = null;
            window.checkCaravanSpawn();
            const firstCount = window.entities.filter(e => e.isCaravanMember).length;
            window._pendingCaravanArrival = true; // another event fires while the first is still walking
            window.checkCaravanSpawn();
            const secondCount = window.entities.filter(e => e.isCaravanMember).length;
            return { firstCount, secondCount };
        });
        expect(result.firstCount).toBe(3);
        expect(result.secondCount).toBe(3);
    });

    test('once every member has arrived (destination cleared), checkCaravanDespawn removes them', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: window.campaign2Landmarks.crossroads.q, r: window.campaign2Landmarks.crossroads.r };
            window._pendingCaravanArrival = true;
            window._activeCaravan = null;
            window.checkCaravanSpawn();
            const ids = window._activeCaravan.memberIds;
            window.entities.forEach(e => { if (ids.includes(e.id)) e.destination = null; }); // simulate arrival
            window.checkCaravanDespawn();
            return {
                stillPresent: window.entities.some(e => ids.includes(e.id)),
                campCleared: window._activeCaravan === null,
            };
        });
        expect(result.stillPresent).toBe(false);
        expect(result.campCleared).toBe(true);
    });
});
