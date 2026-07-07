// tests/arena-void-bridge.spec.js
// First of the new arena scenario types (see the plan's "Arena scenario
// variety" section): a narrow floor bridge crossing a sea of 'Void' —
// genuinely impassable (like Wall) but NOT line-of-sight/ranged-blocking,
// the opposite of Wall's "blocks both" profile. Confirms the terrain/LOS/
// pathing claims from the design research actually hold, before any more
// scenario types are built on the same assumptions.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('arena scenario: bridge over void', () => {
    test('void tiles are impassable but do not block line of sight, and the floor bridge stays walkable', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const originalRandom = Math.random;
            Math.random = () => 0.05; // forces isVoidBridgeArena=true (roll is < 0.15)
            window.startArenaFight();
            Math.random = originalRandom;

            const bridgeHex = { q: 0, r: 0 };
            const offBridgeHex = { q: 0, r: 10 };
            const bridgeTerrain = window.getTerrainAt(bridgeHex.q, bridgeHex.r);
            const voidTerrain = window.getTerrainAt(offBridgeHex.q, offBridgeHex.r);

            // Two hexes on opposite sides of the void gap, well clear of the
            // bridge and boundary ring — line of sight should pass straight
            // through the void between them.
            const farSideA = { q: -5, r: 10 };
            const farSideB = { q: 5, r: 10 };
            const losAcrossVoid = window.hasLineOfSight(farSideA, farSideB);

            // A path attempt straight across the void (not along the bridge)
            // should fail to move directly — the void blocks movement. Uses
            // an NPC-side entity deliberately: the player-only fog-of-war
            // pathing (this session's earlier work) treats unexplored
            // impassable terrain as not-yet-known, so a player-side entity
            // wouldn't be blocked by never-explored void — NPCs always path
            // with full terrain knowledge, which is what's under test here.
            const dummyEntity = { side: 'enemy', skills: {}, getAllHexes: () => [farSideA] };
            const pathAcrossVoid = window.findPath(farSideA, farSideB, undefined, dummyEntity, true);

            const scenarioType = window.arenaScenario?.type;

            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const playerTerrainName = window.getTerrainAt(player.hex.q, player.hex.r).name;

            return {
                scenarioType,
                bridgeTerrainName: bridgeTerrain.name,
                bridgeImpassable: !!bridgeTerrain.impassable,
                voidTerrainName: voidTerrain.name,
                voidImpassable: !!voidTerrain.impassable,
                losAcrossVoid,
                pathAcrossVoidLength: pathAcrossVoid ? pathAcrossVoid.length : null,
                playerTerrainName,
            };
        });
        expect(result.scenarioType).toBe('void_bridge');
        expect(result.bridgeTerrainName).not.toBe('Void');
        expect(result.bridgeImpassable).toBe(false);
        expect(result.voidTerrainName).toBe('Void');
        expect(result.voidImpassable).toBe(true);
        expect(result.losAcrossVoid).toBe(true); // sees/shoots straight through the gap
        // A direct path can't cross impassable void — either null, or forced
        // to detour via the bridge (much longer than the ~10-hex direct line).
        if (result.pathAcrossVoidLength !== null) {
            expect(result.pathAcrossVoidLength).toBeGreaterThan(15);
        }
        expect(result.playerTerrainName).not.toBe('Void'); // never spawned into the gap
    });

    test('the void-bridge scenario skips the ruin structures (a wall ring would sever the bridge)', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const originalRandom = Math.random;
            Math.random = () => 0.05;
            window.startArenaFight();
            Math.random = originalRandom;
            // The bridge is a straight line at r in [-1,1]; if a ruin wall
            // ring had been carved on top of it, some bridge-row hex near
            // the center would now be Wall instead of Cave Floor.
            let wallOnBridge = 0;
            for (let q = -20; q <= 20; q++) {
                for (let r = -1; r <= 1; r++) {
                    if (window.getTerrainAt(q, r).name === 'Wall') wallOnBridge++;
                }
            }
            return { wallOnBridge };
        });
        expect(result.wallOnBridge).toBe(0);
    });
});
