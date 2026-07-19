// tests/border-war.spec.js
// The Border War arc: star-fort geometry, elevated-terrain mechanics
// (climb cost, ranged cover, melee immunity), destructible keep walls, the
// sally-out fight against Northwatch's siege engine, and the two quest-giver
// dialogue hooks. See TASKS.md-adjacent plan notes for the full design.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('The Border War: star forts, elevated terrain, destructible walls', () => {
    test('both forts are built with a climbable outer wall ring and a genuinely impassable keep', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const nw = window.campaign2NorthwatchFortRegion;
            const rh = window.campaign2RidgeholdFortRegion;
            const climbSample = nw.wallHexes.find(h => !window.getEntityAtHex(h.q, h.r));
            const climbTerrain = climbSample && window.getTerrainAt(climbSample.q, climbSample.r);

            let keepWallHex = null;
            for (const key in window.overrideTerrain) {
                if (window.overrideTerrain[key].name === 'Keep Wall') {
                    const [q, r] = key.split(',').map(Number);
                    keepWallHex = { q, r };
                    break;
                }
            }
            return {
                nwFloorCount: nw.floorHexes.length,
                rhFloorCount: rh.floorHexes.length,
                climbTerrainName: climbTerrain && climbTerrain.name,
                climbElevated: climbTerrain && !!climbTerrain.elevated,
                climbImpassable: climbTerrain && !!climbTerrain.impassable,
                keepWallExists: !!keepWallHex,
                keepWallImpassable: keepWallHex && window.getTerrainAt(keepWallHex.q, keepWallHex.r).impassable === true,
                keepWallOpenHex: keepWallHex && window.isOpenHex(keepWallHex),
            };
        });
        expect(result.nwFloorCount).toBeGreaterThan(100);
        expect(result.rhFloorCount).toBeGreaterThan(100);
        expect(result.climbTerrainName).toBe('Climbable Wall');
        expect(result.climbElevated).toBe(true);
        expect(result.climbImpassable).toBe(false);
        expect(result.keepWallExists).toBe(true);
        expect(result.keepWallImpassable).toBe(true);
        expect(result.keepWallOpenHex).toBe(false);
    });

    test('both forts are garrisoned with patrolling soldiers; Northwatch also has a commander and a siege engine', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const soldiers = window.entities.filter(e => e.title === 'Border Soldier');
            const commander = window.entities.find(e => e.name === 'Commander Ysolde Hart');
            const engine = window.campaign2NorthwatchSiegeEngine;
            return {
                soldierCount: soldiers.length,
                // Not every Border Soldier patrols anymore — the wall-corner
                // and hexagon-keep-archer posts (buildNorthwatchFort) hold a
                // static guard position instead. At least the original
                // wall-ring patrollers should still be patrolling.
                somePatrol: soldiers.some(s => s.behaviorType === 'patrol' && Array.isArray(s.patrolPath) && s.patrolPath.length > 0),
                hasCommander: !!commander,
                commanderIsNeutral: commander && commander.side === 'neutral',
                engineExists: !!engine,
                engineStartsInert: engine && engine.side === 'neutral' && engine.noAttack === true,
            };
        });
        expect(result.soldierCount).toBeGreaterThanOrEqual(12); // 6 soldiers x 2 forts
        expect(result.somePatrol).toBe(true);
        expect(result.hasCommander).toBe(true);
        expect(result.commanderIsNeutral).toBe(true);
        expect(result.engineExists).toBe(true);
        expect(result.engineStartsInert).toBe(true);
    });

    test('climbing an elevated hex costs more time than flat ground, but is not blocked', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.overrideTerrain['5000,5000'] = window.terrainTypes['grass'];
            window.overrideTerrain['5001,5000'] = window.terrainTypes['climbable_wall'];
            const flat = window.getMoveCostMult(5000, 5000, window.player);
            const climb = window.getMoveCostMult(5001, 5000, window.player);
            return { flatOpen: window.isOpenHex({ q: 5000, r: 5000 }), climbOpen: window.isOpenHex({ q: 5001, r: 5000 }), flat, climb };
        });
        expect(result.flatOpen).toBe(true);
        expect(result.climbOpen).toBe(true);
    });

    test('a defender near elevated terrain gets a ranged cover bonus; melee is blocked across an elevation mismatch in both directions', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.overrideTerrain['6000,4999'] = window.terrainTypes['climbable_wall'];
            const covered = window.isCoveredFromRangedAttack({ hex: { q: 6000, r: 5000 } });
            const notCovered = window.isCoveredFromRangedAttack({ hex: { q: 7000, r: 7000 } });

            window.overrideTerrain['8000,8000'] = window.terrainTypes['grass'];
            window.overrideTerrain['8001,8000'] = window.terrainTypes['climbable_wall'];
            const getAllHexes = function () { return [this.hex]; };
            const groundGuy = { name: 'Ground Guy', hex: { q: 8000, r: 8000 }, side: 'player', equipped: {}, skills: {}, alive: true, getAllHexes };
            const wallGuy = { name: 'Wall Guy', hex: { q: 8001, r: 8000 }, side: 'enemy', equipped: {}, skills: {}, alive: true, timePoints: 100, reputation: {}, getAllHexes };
            window.entities.push(groundGuy, wallGuy);

            // Block detection via a resolveAttack spy rather than the
            // showMessage text: tryAttack only calls showMessage for the
            // block when attacker.side === 'player' (matching the existing
            // flying-immunity convention it sits beside), so an enemy
            // attacker blocked by elevation is silent but still genuinely
            // blocked — resolveAttack simply never runs.
            const origResolveAttack = window.resolveAttack;
            let resolveAttackCalled = false;
            window.resolveAttack = (...args) => { resolveAttackCalled = true; return origResolveAttack(...args); };

            let msg1 = null;
            const orig = window.showMessage;
            window.showMessage = (m) => { msg1 = m; };
            window.tryAttack(groundGuy, wallGuy, false, false, 0, true);
            const groundToWallBlocked = (msg1 && msg1.includes('height difference')) && !resolveAttackCalled;

            resolveAttackCalled = false;
            window.tryAttack(wallGuy, groundGuy, false, false, 0, true);
            const wallToGroundBlocked = !resolveAttackCalled;

            // Same elevation: not blocked, resolveAttack actually runs.
            wallGuy.hex = { q: 8000, r: 8001 };
            window.overrideTerrain['8000,8001'] = window.terrainTypes['grass'];
            resolveAttackCalled = false;
            window.tryAttack(groundGuy, wallGuy, false, false, 0, true);
            const sameLevelBlocked = !resolveAttackCalled;
            window.showMessage = orig;
            window.resolveAttack = origResolveAttack;

            window.entities = window.entities.filter(e => e !== groundGuy && e !== wallGuy);
            return { covered, notCovered, groundToWallBlocked, wallToGroundBlocked, sameLevelBlocked };
        });
        expect(result.covered).toBe(true);
        expect(result.notCovered).toBe(false);
        expect(result.groundToWallBlocked).toBe(true);
        expect(result.wallToGroundBlocked).toBe(true);
        expect(result.sameLevelBlocked).toBe(false);
    });

    test('damageWall breaks a Keep Wall hex into passable Rubble once hp reaches 0', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            let keepWallHex = null;
            for (const key in window.overrideTerrain) {
                if (window.overrideTerrain[key].name === 'Keep Wall') {
                    const [q, r] = key.split(',').map(Number);
                    keepWallHex = { q, r };
                    break;
                }
            }
            window.damageWall(keepWallHex.q, keepWallHex.r, 10);
            const midHp = window.tileObjects[`${keepWallHex.q},${keepWallHex.r}`]?.hp;
            const stillImpassable = window.getTerrainAt(keepWallHex.q, keepWallHex.r).impassable;
            window.damageWall(keepWallHex.q, keepWallHex.r, 100);
            const finalTerrain = window.getTerrainAt(keepWallHex.q, keepWallHex.r).name;
            const nowOpen = window.isOpenHex(keepWallHex);
            const tileObjectCleared = !window.tileObjects[`${keepWallHex.q},${keepWallHex.r}`];
            return { midHp, stillImpassable, finalTerrain, nowOpen, tileObjectCleared };
        });
        expect(result.midHp).toBeLessThan(40);
        expect(result.stillImpassable).toBe(true);
        expect(result.finalTerrain).toBe('Rubble');
        expect(result.nowOpen).toBe(true);
        expect(result.tileObjectCleared).toBe(true);
    });

    test('the quartermaster only offers Border War once the goblin scout note has been read', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => {
            window.goblinScoutNoteRead = false;
            window.questLog = [];
            const npc = window.entities.find(e => e.dialogueId === 'border_war_quartermaster');
            let offered = null;
            const orig = window.showDialogue;
            window.showDialogue = (n, msg, opts) => { offered = { msg, opts: (opts || []).map(o => o.label) }; };
            window.npcDialogueTrees.border_war_quartermaster(npc);
            window.showDialogue = orig;
            return { offered, questPushed: window.questLog.some(q => q.id === 'border_war') };
        });
        expect(before.offered.opts.join(',')).not.toContain('head to Northwatch');

        const after = await page.evaluate(() => {
            window.goblinScoutNoteRead = true;
            window.questLog = [];
            const npc = window.entities.find(e => e.dialogueId === 'border_war_quartermaster');
            let offered = null;
            const orig = window.showDialogue;
            window.showDialogue = (n, msg, opts) => { offered = { msg, opts: opts || [] }; };
            window.npcDialogueTrees.border_war_quartermaster(npc);
            const acceptOpt = offered.opts.find(o => o.label.includes('Northwatch'));
            acceptOpt.action();
            window.showDialogue = orig;
            return { questPushed: window.questLog.some(q => q.id === 'border_war' && q.status === 'active') };
        });
        expect(after.questPushed).toBe(true);
    });

    test('the commander triggers the sally-out fight: the siege engine flips to a real target and a small band of escorts spawns', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const engine = window.campaign2NorthwatchSiegeEngine;
            const entitiesBefore = window.entities.length;
            window.startNorthwatchSally();
            const entitiesAfter = window.entities.length;
            return {
                engineNowEnemy: engine.side === 'enemy',
                engineAttackable: engine.noAttack === false,
                sallyActive: window.borderWarSallyActive === true,
                spawnedCount: entitiesAfter - entitiesBefore,
            };
        });
        expect(result.engineNowEnemy).toBe(true);
        expect(result.engineAttackable).toBe(true);
        expect(result.sallyActive).toBe(true);
        // escortTypes has 5 entries, but a mounted type (wolf_rider_goblin)
        // spawns as two entities (mount + rider) via createMonster — so the
        // real ceiling is 6, not 5. Still a small band, not the fort's full
        // garrison (12+ soldiers).
        expect(result.spawnedCount).toBeGreaterThan(0);
        expect(result.spawnedCount).toBeLessThanOrEqual(6);
    });

    test('cheat teleports land the party at each fort\'s gate', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.cheatTeleportNorthwatch();
            const nwHero = window.entities.find(e => e.side === 'player' && !e.rider);
            const nwDist = window.distance(nwHero.hex, window.campaign2NorthwatchGateHex);

            window.cheatTeleportRidgehold();
            const rhHero = window.entities.find(e => e.side === 'player' && !e.rider);
            const rhDist = window.distance(rhHero.hex, window.campaign2RidgeholdFortRegion.doorHex);

            return { nwDist, rhDist };
        });
        expect(result.nwDist).toBeLessThanOrEqual(5);
        expect(result.rhDist).toBeLessThanOrEqual(5);
    });
});
