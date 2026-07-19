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

test.describe('D3: hiring on as a caravan guard, or raiding the caravan instead', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: window.campaign2Landmarks.crossroads.q, r: window.campaign2Landmarks.crossroads.r };
            window._pendingCaravanArrival = true;
            window._activeCaravan = null;
            window.checkCaravanSpawn();
        });
    });

    test('every caravan member gets the caravan_merchant dialogueId', async ({ page }) => {
        const result = await page.evaluate(() => {
            const members = window.entities.filter(e => window._activeCaravan.memberIds.includes(e.id));
            return members.every(e => e.dialogueId === 'caravan_merchant');
        });
        expect(result).toBe(true);
    });

    test('hiring on schedules a future ambush and pays a completion reward once the crossing is done', async ({ page }) => {
        const result = await page.evaluate(() => {
            const repBefore = window.factions.silverhart_kingdom.standing;
            const goldBefore = window.player.gold;
            window._activeCaravan.hiredGuard = true;
            window._activeCaravan.ambushAt = window.worldSeconds + 1000;
            const ids = window._activeCaravan.memberIds;
            window.entities.forEach(e => { if (ids.includes(e.id)) e.destination = null; }); // simulate safe arrival
            window.checkCaravanDespawn();
            return {
                goldGain: window.player.gold - goldBefore,
                repGain: window.factions.silverhart_kingdom.standing - repBefore,
                despawned: window._activeCaravan === null,
            };
        });
        expect(result.goldGain).toBe(50);
        expect(result.repGain).toBeGreaterThan(0);
        expect(result.despawned).toBe(true);
    });

    test('the ambush only fires once the scheduled time has passed, and only if hired', async ({ page }) => {
        const result = await page.evaluate(() => {
            const banditsBefore = window.entities.filter(e => e.name === 'Bandit').length;
            window._activeCaravan.hiredGuard = false;
            window.worldSeconds = 999999;
            window.checkCaravanAmbush(); // not hired — nothing happens
            const countNotHired = window.entities.filter(e => e.name === 'Bandit').length;

            window._activeCaravan.hiredGuard = true;
            window._activeCaravan.ambushAt = window.worldSeconds + 10000; // still in the future
            window.checkCaravanAmbush();
            const countTooEarly = window.entities.filter(e => e.name === 'Bandit').length;

            window._activeCaravan.ambushAt = window.worldSeconds - 1; // due
            window.checkCaravanAmbush();
            const countAfterAmbush = window.entities.filter(e => e.name === 'Bandit').length;

            window.checkCaravanAmbush(); // idempotent — already ambushed once
            const countAfterSecondCall = window.entities.filter(e => e.name === 'Bandit').length;

            return { banditsBefore, countNotHired, countTooEarly, countAfterAmbush, countAfterSecondCall, ambushed: window._activeCaravan.ambushed };
        });
        expect(result.countNotHired).toBe(result.banditsBefore);
        expect(result.countTooEarly).toBe(result.banditsBefore);
        expect(result.countAfterAmbush).toBeGreaterThanOrEqual(result.banditsBefore + 2);
        expect(result.countAfterSecondCall).toBe(result.countAfterAmbush);
        expect(result.ambushed).toBe(true);
    });

    test('raiding the caravan grants gold immediately, turns members hostile, and costs kingdom reputation', async ({ page }) => {
        const result = await page.evaluate(() => {
            const goldBefore = window.player.gold;
            const repBefore = window.factions.silverhart_kingdom.standing;
            const secBefore = window.regions.aldervale.security;
            window.raidCaravan();
            const members = window.entities.filter(e => window._activeCaravan.memberIds.includes(e.id));
            return {
                goldGain: window.player.gold - goldBefore,
                repChange: window.factions.silverhart_kingdom.standing - repBefore,
                secChange: window.regions.aldervale.security - secBefore,
                allEnemy: members.every(e => e.side === 'enemy'),
                raided: window._activeCaravan.raided,
            };
        });
        expect(result.goldGain).toBeGreaterThanOrEqual(40);
        expect(result.repChange).toBeLessThan(0);
        expect(result.secChange).toBeLessThan(0);
        expect(result.allEnemy).toBe(true);
        expect(result.raided).toBe(true);
    });

    test('a raided caravan pays no guard reward even if it was hired first', async ({ page }) => {
        const result = await page.evaluate(() => {
            window._activeCaravan.hiredGuard = true;
            window.raidCaravan();
            const goldBefore = window.player.gold;
            const ids = window._activeCaravan.memberIds;
            window.entities.forEach(e => { if (ids.includes(e.id)) e.destination = null; });
            window.checkCaravanDespawn();
            return { goldGain: window.player.gold - goldBefore };
        });
        expect(result.goldGain).toBe(0);
    });
});
