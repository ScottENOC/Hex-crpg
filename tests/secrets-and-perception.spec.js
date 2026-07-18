const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Keen Perception (agility skill)', () => {
    test('boosts the roll for spotting a stealthed opponent (canSee)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const viewer = window.entities.find(e => e.side === 'player' && !e.rider);
            const target = window.createMonster('wolf', { q: viewer.hex.q + 3, r: viewer.hex.r });
            target.isStealthed = true;
            target.stealthScore = 90; // very hard to spot without help
            window.entities.push(target);

            let sawWithout = 0, sawWith = 0;
            const trials = 200;
            for (let i = 0; i < trials; i++) {
                viewer.knownStealthedTargets = new Set();
                if (window.canSee(viewer, target)) sawWithout++;
            }
            viewer.skills = { ...viewer.skills, keen_perception: 3 };
            for (let i = 0; i < trials; i++) {
                viewer.knownStealthedTargets = new Set();
                if (window.canSee(viewer, target)) sawWith++;
            }
            return { sawWithout, sawWith };
        });
        expect(result.sawWith).toBeGreaterThan(result.sawWithout);
    });
});

test.describe('Secret doors and hidden objects', () => {
    test('an undiscovered secret door renders as plain, unrevealed terrain (not yet a door)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.placeSecretDoor(950, 950, { concealment: 90 });
            const obj = window.tileObjects['950,950'];
            return { terrain: window.getTerrainAt(950, 950).name, type: obj.type, discovered: obj.discovered };
        });
        expect(result.terrain).toBe('Wall');
        expect(result.type).toBe('secret_door');
        expect(result.discovered).toBe(false);
    });

    test('a high-concealment door resists detection; a low-concealment one is reliably found — deterministic via a fixed RNG roll', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Pin Math.random so the spotChance comparison is deterministic
            // instead of relying on statistical near-certainty over many
            // tries — a 0.5 roll only clears a spotChance > 50.
            const originalRandom = Math.random;
            Math.random = () => 0.5;

            window.placeSecretDoor(960, 960, { concealment: 99 }); // spotChance well under 50 even with perception help
            window.placeSecretDoor(970, 970, { concealment: 5 });  // spotChance well over 50
            const viewer = window.entities.find(e => e.side === 'player' && !e.rider);
            // Kept far from both doors (distance > 10) so the distance bonus
            // is 0 for both rolls — only concealment and perception decide
            // the outcome, matching the spotChance math in the comments above.
            viewer.hex = { q: -500, r: -500 };
            viewer.skills = { ...viewer.skills, keen_perception: 3 };

            window.checkSecretDoorDiscovery(viewer, { q: 960, r: 960 });
            window.checkSecretDoorDiscovery(viewer, { q: 970, r: 970 });
            // A discovered door converts to a plain door_closed tileObject
            // (no 'discovered' field of its own) — check the type
            // transition, not a field that only exists pre-discovery.
            const hardFound = window.tileObjects['960,960'].type === 'door_closed';
            const easyFound = window.tileObjects['970,970'].type === 'door_closed';

            Math.random = originalRandom;
            return { hardFound, easyFound };
        });
        expect(result.hardFound).toBe(false);
        expect(result.easyFound).toBe(true);
    });

    test('discovering a secret door converts it into a fully normal, toggleable door', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.placeSecretDoor(980, 980, { concealment: 0, openTerrain: 'Wood Floor' });
            const viewer = window.entities.find(e => e.side === 'player' && !e.rider);
            window.checkSecretDoorDiscovery(viewer, { q: 980, r: 980 });
            const afterDiscovery = { type: window.tileObjects['980,980'].type, terrain: window.getTerrainAt(980, 980).name };

            window.toggleDoor(980, 980, viewer);
            const afterToggle = { type: window.tileObjects['980,980'].type, terrain: window.getTerrainAt(980, 980).name };
            return { afterDiscovery, afterToggle };
        });
        expect(result.afterDiscovery.type).toBe('door_closed');
        expect(result.afterDiscovery.terrain).toBe('Wall');
        expect(result.afterToggle.type).toBe('door_open');
        expect(result.afterToggle.terrain).toBe('Wood Floor');
    });

    test('the discovery roll has a cooldown — an immediate re-check right after a failed roll does not re-roll', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const originalRandom = Math.random;
            Math.random = () => 0.5; // spotChance floors at 5 here, so a 0.5 roll (50) always misses
            window.placeSecretDoor(990, 990, { concealment: 100 }); // guaranteed miss on the first roll
            const viewer = window.entities.find(e => e.side === 'player' && !e.rider);
            viewer.hex = { q: -500, r: -500 }; // far enough that the distance bonus is 0
            window.checkSecretDoorDiscovery(viewer, { q: 990, r: 990 });
            const nextAttemptAfterFirst = window.tileObjects['990,990'].nextAttemptAt;
            window.checkSecretDoorDiscovery(viewer, { q: 990, r: 990 }); // should be a no-op, still on cooldown
            const nextAttemptAfterSecond = window.tileObjects['990,990'].nextAttemptAt;
            Math.random = originalRandom;
            return { nextAttemptAfterFirst, nextAttemptAfterSecond, stillHidden: !window.tileObjects['990,990'].discovered };
        });
        expect(result.nextAttemptAfterFirst).toBeGreaterThan(0);
        expect(result.nextAttemptAfterSecond).toBe(result.nextAttemptAfterFirst); // unchanged — the cooldown blocked a second roll
        expect(result.stillHidden).toBe(true);
    });

    test('a discovered secret stash pays out gold/items to the shared party inventory and removes itself', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.placeSecretStash(1000, 1000, { concealment: 0, gold: 50, items: ['gem_red'] });
            const viewer = window.entities.find(e => e.side === 'player' && !e.rider);
            const goldBefore = window.party[0].gold;
            window.checkSecretDoorDiscovery(viewer, { q: 1000, r: 1000 });
            return {
                goldAfter: window.party[0].gold, goldBefore,
                hasGem: window.party[0].inventory.includes('gem_red'),
                objectGone: window.tileObjects['1000,1000'] === undefined
            };
        });
        expect(result.goldAfter).toBe(result.goldBefore + 50);
        expect(result.hasGem).toBe(true);
        expect(result.objectGone).toBe(true);
    });

    test('the Thieves\' Guild hidden vault and the necromancer crypt hidden stash are placed in the world', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const vaultCenter = window.campaign2ThievesGuildVaultCenter;
            const secretDoorHex = { q: vaultCenter.q - 2, r: vaultCenter.r };
            const doorObj = window.tileObjects[`${secretDoorHex.q},${secretDoorHex.r}`];
            const chestObj = window.tileObjects[`${vaultCenter.q + 1},${vaultCenter.r}`];

            const ossuaryCenter = window.campaign2NecromancerOssuaryCenter;
            const stashObj = window.tileObjects[`${ossuaryCenter.q},${ossuaryCenter.r}`];
            return {
                hasVaultCenter: !!vaultCenter,
                doorType: doorObj && doorObj.type,
                doorTerrain: window.getTerrainAt(secretDoorHex.q, secretDoorHex.r).name,
                chestType: chestObj && chestObj.type,
                chestItems: chestObj && chestObj.items,
                hasOssuaryCenter: !!ossuaryCenter,
                stashType: stashObj && stashObj.type,
                stashGold: stashObj && stashObj.gold,
            };
        });
        expect(result.hasVaultCenter).toBe(true);
        expect(result.doorType).toBe('secret_door');
        expect(result.doorTerrain).toBe('Wall');
        expect(result.chestType).toBe('storage_chest');
        expect(result.chestItems).toContain('silvertongue_ring');
        expect(result.hasOssuaryCenter).toBe(true);
        expect(result.stashType).toBe('secret_stash');
        expect(result.stashGold).toBe(80);
    });
});
