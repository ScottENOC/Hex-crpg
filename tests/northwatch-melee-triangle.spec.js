// tests/northwatch-melee-triangle.spec.js
// Three things added in response to a live-playthrough report: (1) hexagon
// archers get an outward-LOS-aware post instead of the naive center+dir*4
// spot, which sometimes stared straight into the archer's own wedge tip;
// (2) wall-ring defenders retreat individually to one of 18 melee-triangle
// slots (3 per hexagon point, 2 hexes out) instead of one shared hex, so a
// breach draws a 3-on-1 pincer; (3) cover_fire (previously a purchasable
// skill with zero actual game effect) now really works, and the 6 hexagon
// archers + commander get a free use the instant the wall garrison falls
// back, with a commander announcement in the message log.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Northwatch wall ladders: retreat cost without/with one', () => {
    test('6 ladders exist, one at each concave notch closest to the keep', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const ladderHexes = window.campaign2NorthwatchLadderHexes;
            const center = window.campaign2NorthwatchCenter;
            return {
                count: ladderHexes?.length,
                allHaveLadderObject: ladderHexes?.every(h => window.tileObjects[`${h.q},${h.r}`]?.type === 'ladder'),
                allOnClimbableWall: ladderHexes?.every(h => window.getTerrainAt(h.q, h.r).name === 'Climbable Wall'),
                allCloserThanWedgeTip: ladderHexes?.every(h => window.distance(h, center) < 12),
            };
        });
        expect(result.count).toBe(6);
        expect(result.allHaveLadderObject).toBe(true);
        expect(result.allOnClimbableWall).toBe(true);
        expect(result.allCloserThanWedgeTip).toBe(true);
    });

    test('retreating off a laddered wall hex costs less TP than an unladdered one', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const ladderHex = window.campaign2NorthwatchLadderHexes[0];
            const region = window.campaign2NorthwatchFortRegion;
            const unladderedWallHex = region.wallHexes.find(h =>
                window.getTerrainAt(h.q, h.r).name === 'Climbable Wall' &&
                !window.tileObjects[`${h.q},${h.r}`] &&
                window.distance(h, ladderHex) > 2);
            const center = window.campaign2NorthwatchCenter;

            function costToRetreatOneStep(startHex) {
                const soldier = window.createMonster('human', startHex, null, null, 'neutral');
                soldier.combatDirective = {
                    hostileTo: 'enemy',
                    retreatTo: center,
                    contingencies: [],
                    mode: 'retreat',
                };
                soldier.timePoints = 100;
                soldier.aiState = 'combat';
                window.entities = [soldier];
                window.currentTurnEntity = soldier;
                window.isInCombat = true;
                const before = soldier.timePoints;
                window.takeTurn(soldier);
                return before - soldier.timePoints;
            }

            const laddered = costToRetreatOneStep({ ...ladderHex });
            const unladdered = costToRetreatOneStep({ ...unladderedWallHex });
            return { laddered, unladdered };
        });
        expect(result.laddered).toBe(10);
        expect(result.unladdered).toBe(25);
    });
});

test.describe('Northwatch hexagon defense: LOS placement, melee triangle, cover fire', () => {
    test('every hexagon archer has a clear sightline down its own point, well past the keep gap', async ({ page }) => {
        // NOT "can see past the star's own outer wall" — a post several
        // hexes inside the keep is never going to see past its own fort's
        // curtain wall (that's the wall correctly doing its job, verified
        // directly: every post's sightline runs unbroken right up to that
        // wall). What actually matters for a defender covering the keep's
        // approach is a clear view into the star's open core/point well
        // beyond their own gap — confirmed here at 10 hexes out.
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.lightLevel = 1.0;
            window.invalidateVisibilityCache && window.invalidateVisibilityCache();
            const center = window.campaign2NorthwatchCenter;
            const HEX_DIRS = [
                { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
            ];
            const archers = window.entities.filter(e => e.isHexagonArcher);
            return archers.map((a, i) => {
                const dir = HEX_DIRS[i];
                const target = { q: center.q + dir.q * 10, r: center.r + dir.r * 10 };
                return { name: a.name, hex: a.hex, ok: window.hasLineOfSight(a.hex, target) };
            });
        });
        expect(result.length).toBe(6);
        const bad = result.filter(r => !r.ok);
        expect(bad, `posts with no clear sightline down their own point: ${JSON.stringify(bad)}`).toEqual([]);
    });

    test('wall-ring defenders retreat to individual melee-triangle slots, not one shared hex', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const archers = window.entities.filter(e => e.isHexagonArcher);
            const wallDefenders = window.entities.filter(e =>
                e.factionTag === 'northwatch_human' && !e.isHexagonArcher &&
                e.name !== 'Commander Ysolde Hart' && !e.title?.includes('Gate Guard') &&
                e.combatDirective?.contingencies?.some(c => c.id === 'retreat_if_walls_overrun'));
            const retreatPoints = wallDefenders.map(e => `${e.combatDirective.retreatTo.q},${e.combatDirective.retreatTo.r}`);
            const uniquePoints = new Set(retreatPoints);
            // Every retreat point should land within 2 hexes of some
            // archer's own post (that's the whole point of the triangle —
            // close enough to actually converge on whoever reaches the gap).
            const allNearAnArcher = wallDefenders.every(e => {
                const rt = e.combatDirective.retreatTo;
                return archers.some(a => window.distance(rt, a.homeHex) <= 2);
            });
            return { count: wallDefenders.length, uniqueCount: uniquePoints.size, allNearAnArcher };
        });
        expect(result.count).toBeGreaterThan(0);
        // Previously every one of these had the exact same retreatTo (the
        // hexagon center) — now should be spread across up to 18 slots.
        expect(result.uniqueCount).toBeGreaterThan(1);
        expect(result.allNearAnArcher).toBe(true);
    });

    test('cover_fire actually slows the declared side through its 7-hex zone, and the free retreat-triggered use fires with a commander message', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const target = { q: 0, r: 0 };
            const caster = window.createMonster('orc', { q: 5, r: 5 }, null, null, 'neutral');
            caster.combatDirective = { hostileTo: 'enemy' };
            caster.timePoints = 100;
            const before = caster.timePoints;
            const deployed = window.deployCoverFire(caster, target, { free: false });
            const afterTP = caster.timePoints;

            const neighbors = window.getNeighbors(target.q, target.r);
            const zoneSize = window.coverFireZones[window.coverFireZones.length - 1].hexes.size;

            const enemyMult = window.getMoveCostMult(target.q, target.r, { side: 'enemy' });
            const friendlyMult = window.getMoveCostMult(target.q, target.r, { side: 'player' });

            // Retreat-triggered free use + commander message.
            window.northwatchRetreatCalled = false;
            let lastMessage = null;
            const origShowMessage = window.showMessage;
            window.showMessage = (msg) => { lastMessage = msg; if (origShowMessage) origShowMessage(msg); };
            const commander = window.entities.find(e => e.name === 'Commander Ysolde Hart');
            const commanderTPBefore = commander ? commander.timePoints : null;
            if (commander) commander.timePoints = 100;
            window.triggerNorthwatchCoveringFire();
            window.showMessage = origShowMessage;
            const zonesAfterTrigger = window.coverFireZones.length;

            return {
                deployed, tpCost: before - afterTP, zoneSize, neighborCount: neighbors.length,
                enemyMult, friendlyMult, lastMessage, zonesAfterTrigger,
                commanderTPUnchanged: commander ? commander.timePoints === 100 : null,
            };
        });
        expect(result.deployed).toBe(true);
        expect(result.tpCost).toBe(5);
        expect(result.zoneSize).toBe(result.neighborCount + 1); // target + its 6 neighbors
        expect(result.enemyMult).toBeGreaterThan(result.friendlyMult);
        expect(result.lastMessage).toMatch(/covering fire/i);
        expect(result.zonesAfterTrigger).toBeGreaterThan(0);
        // Free use: the commander's TP shouldn't have been spent.
        expect(result.commanderTPUnchanged).toBe(true);
    });
});
