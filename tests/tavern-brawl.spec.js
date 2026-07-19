// tests/tavern-brawl.spec.js
// Covers three related additions:
//  1. Shove off a wall is allowed (fall damage) but shove UP a wall is not
//     (see tryShove's asymmetric elevated-terrain check, gameEngine.js).
//  2. Improvised weapons (chair/bottle) break after one use, win or miss
//     (see breakImprovisedWeapon, gameEngine.js).
//  3. The Tavern Brawl scenario itself: table-flipping for cover, and the
//     5-a-side scripted fight (startTavernBrawl/endTavernBrawl,
//     campaign2Dialogue.js).

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('shove vs. walls', () => {
    test('shoving a target off a wall onto ground succeeds and deals fall damage', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const shover = window.entities.find(e => e.side === 'player' && !e.rider);
            shover.hex = { q: 0, r: 0 };
            shover.timePoints = 100;
            shover.toHitMelee = 100;
            window.setTerrainAt(0, 0, 'Grass');
            window.setTerrainAt(1, 0, 'Climbable Wall');
            window.setTerrainAt(2, 0, 'Grass');

            const target = new window.Entity('Wall Target', 'blue', { q: 1, r: 0 }, 5);
            target.side = 'enemy';
            target.hp = 20;
            target.maxHp = 20;
            target.passiveDodge = -1000; // guarantee the shove connects
            target.forcedMoveResistance = 0;
            window.entities.push(target);

            const before = target.hp;
            const origRandom = Math.random;
            Math.random = () => 0; // guarantee hit-roll success
            const ok = window.tryShove(shover, target);
            Math.random = origRandom;

            return {
                ok,
                hexAfter: { ...target.hex },
                hpLost: before - target.hp,
            };
        });
        expect(result.ok).toBe(true);
        expect(result.hexAfter).toEqual({ q: 2, r: 0 });
        expect(result.hpLost).toBeGreaterThan(0);
    });

    test('shoving a target UP onto a wall is blocked — no free climb, no fall damage', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const shover = window.entities.find(e => e.side === 'player' && !e.rider);
            shover.hex = { q: 0, r: 0 };
            shover.timePoints = 100;
            shover.toHitMelee = 100;
            window.setTerrainAt(0, 0, 'Grass');
            window.setTerrainAt(1, 0, 'Grass');
            window.setTerrainAt(2, 0, 'Climbable Wall');

            const target = new window.Entity('Ground Target', 'blue', { q: 1, r: 0 }, 5);
            target.side = 'enemy';
            target.hp = 20;
            target.maxHp = 20;
            target.passiveDodge = -1000;
            target.forcedMoveResistance = 0;
            window.entities.push(target);

            const before = target.hp;
            const origRandom = Math.random;
            Math.random = () => 0;
            const ok = window.tryShove(shover, target);
            Math.random = origRandom;

            return {
                ok,
                hexAfter: { ...target.hex },
                hpLost: before - target.hp,
            };
        });
        expect(result.ok).toBe(true); // the shove attempt resolves (a message, no forced move)
        expect(result.hexAfter).toEqual({ q: 1, r: 0 }); // never moved
        expect(result.hpLost).toBe(0);
    });
});

test.describe('improvised weapons break after one use', () => {
    test('a chair breaks after a successful melee hit', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            attacker.equipped = attacker.equipped || {};
            attacker.equipped.weapon = 'chair';
            attacker.inventory = attacker.inventory || [];
            attacker.inventory.push('chair');
            attacker.toHitMelee = 1000;
            attacker.hex = { q: 0, r: 0 };

            const target = new window.Entity('Dummy', 'blue', { q: 1, r: 0 }, 5);
            target.side = 'enemy';
            target.hp = 50;
            target.maxHp = 50;
            target.passiveDodge = -1000;
            window.entities.push(target);

            const origRandom = Math.random;
            Math.random = () => 0; // guaranteed hit
            window.resolveAttack(attacker, target, false, false);
            Math.random = origRandom;

            return {
                weaponAfter: attacker.equipped.weapon,
                stillInInventory: attacker.inventory.includes('chair'),
            };
        });
        expect(result.weaponAfter).toBeNull();
        expect(result.stillInInventory).toBe(false);
    });

    test('a chair also breaks on a miss', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            attacker.equipped = attacker.equipped || {};
            attacker.equipped.weapon = 'chair';
            attacker.inventory = attacker.inventory || [];
            attacker.inventory.push('chair');
            attacker.toHitMelee = -1000; // guaranteed miss
            attacker.hex = { q: 0, r: 0 };

            const target = new window.Entity('Dummy2', 'blue', { q: 1, r: 0 }, 5);
            target.side = 'enemy';
            target.hp = 50;
            target.maxHp = 50;
            target.passiveDodge = 1000;
            window.entities.push(target);

            const origRandom = Math.random;
            Math.random = () => 0.999;
            window.resolveAttack(attacker, target, false, false);
            Math.random = origRandom;

            return { weaponAfter: attacker.equipped.weapon };
        });
        expect(result.weaponAfter).toBeNull();
    });

    test('a real weapon (sword) survives both a hit and a miss', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            attacker.equipped = attacker.equipped || {};
            attacker.equipped.weapon = 'sword';
            attacker.toHitMelee = 1000;
            attacker.hex = { q: 0, r: 0 };

            const target = new window.Entity('Dummy3', 'blue', { q: 1, r: 0 }, 5);
            target.side = 'enemy';
            target.hp = 50;
            target.maxHp = 50;
            target.passiveDodge = -1000;
            window.entities.push(target);

            const origRandom = Math.random;
            Math.random = () => 0;
            window.resolveAttack(attacker, target, false, false);
            Math.random = origRandom;

            return { weaponAfter: attacker.equipped.weapon };
        });
        expect(result.weaponAfter).toBe('sword');
    });
});

test.describe('flipping a table for cover', () => {
    test('flipTable converts a table into a cover-granting overturned_table', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.tileObjects['5,5'] = { type: 'table' };
            const actor = { timePoints: 100 };
            window.flipTable(5, 5, actor);
            return window.tileObjects['5,5'];
        });
        expect(result.type).toBe('overturned_table');
        expect(result.cover).toBe(true);
    });

    test('standing behind an overturned table grants the ranged cover bonus', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const target = { hex: { q: 5, r: 5 } };
            const beforeCover = window.isCoveredFromRangedAttack(target);
            window.tileObjects['5,4'] = { type: 'overturned_table', cover: true };
            const afterCover = window.isCoveredFromRangedAttack(target);
            return { beforeCover, afterCover };
        });
        expect(result.beforeCover).toBe(false);
        expect(result.afterCover).toBe(true);
    });
});

test.describe('The Tavern Brawl: 5-a-side scripted fight', () => {
    async function completeOskarsWager(page) {
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'oskars_wager', title: "Oskar's Wager", giver: 'Oskar Vinn', status: 'completed' });
        });
    }

    test('startTavernBrawl spawns 5 hostile brawlers and flips Garrick/Mira/Oskar to the player side', async ({ page }) => {
        await createCharacter(page);
        await completeOskarsWager(page);
        const result = await page.evaluate(() => {
            window.startTavernBrawl();
            const brawlers = window.entities.filter(e => e.name.startsWith('Rowdy Brawler') && e.side === 'enemy');
            const allies = ['Garrick Holt', 'Mira Ashbrook', 'Oskar Vinn'].map(n => window.entities.find(e => e.name === n));
            return {
                brawlerCount: brawlers.length,
                alliesFlipped: allies.every(a => a && a.side === 'player' && a.aiControlled === true),
                isInCombat: window.isInCombat,
                triggered: window.tavernBrawlTriggered,
                active: window.tavernBrawlActive,
            };
        });
        expect(result.brawlerCount).toBe(5);
        expect(result.alliesFlipped).toBe(true);
        expect(result.isInCombat).toBe(true);
        expect(result.triggered).toBe(true);
        expect(result.active).toBe(true);
    });

    test('startTavernBrawl only fires once', async ({ page }) => {
        await createCharacter(page);
        await completeOskarsWager(page);
        const result = await page.evaluate(() => {
            window.startTavernBrawl();
            const firstCount = window.entities.filter(e => e.name.startsWith('Rowdy Brawler')).length;
            window.startTavernBrawl();
            const secondCount = window.entities.filter(e => e.name.startsWith('Rowdy Brawler')).length;
            return { firstCount, secondCount };
        });
        expect(result.firstCount).toBe(5);
        expect(result.secondCount).toBe(5); // unchanged — the second call was a no-op
    });

    // Calls endTavernBrawl directly rather than routing through
    // checkCombatEnd's generic "no alive enemies anywhere on the map" gate —
    // same reasoning the codebase's other scripted-fight resolutions
    // document (resolveShakedown's fight branch, the Northwatch sally, etc.):
    // that gate is a known, accepted limitation blocked by any unrelated
    // wilderness monster alive elsewhere, not something this test should
    // depend on. checkCombatEnd's own tavernBrawlActive dispatch to
    // endTavernBrawl is one line and not worth re-proving here.
    test('killing every brawler resolves the brawl: gold/XP reward and allies revert to neutral', async ({ page }) => {
        await createCharacter(page);
        await completeOskarsWager(page);
        const before = await page.evaluate(() => window.party[0].gold || 0);
        const result = await page.evaluate(() => {
            window.startTavernBrawl();
            window.entities.filter(e => e.name.startsWith('Rowdy Brawler')).forEach(e => { e.hp = 0; e.alive = false; });
            window.endTavernBrawl();
            const allies = ['Garrick Holt', 'Mira Ashbrook', 'Oskar Vinn'].map(n => window.entities.find(e => e.name === n));
            return {
                gold: window.party[0].gold || 0,
                active: window.tavernBrawlActive,
                isInCombat: window.isInCombat,
                alliesReverted: allies.every(a => a && a.side === 'neutral' && a.isNPC === true),
                questCompleted: (window.questLog || []).find(q => q.id === 'tavern_brawl')?.status,
            };
        });
        expect(result.gold).toBe(before + 30);
        expect(result.active).toBe(false);
        expect(result.isInCombat).toBe(false);
        expect(result.alliesReverted).toBe(true);
        expect(result.questCompleted).toBe('completed');
    });
});
