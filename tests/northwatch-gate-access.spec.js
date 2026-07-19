// tests/northwatch-gate-access.spec.js
// Two live-playthrough blockers, fixed together: (1) the fort's gate was
// just an always-open gap in the wall — now a real closable/lockable door
// (campaign2World.js, reuses the existing toggleDoor system) gated on
// standing with the crown rather than a hard puzzle lock, so a non-hostile
// player can still open it; (2) the player's own step-by-step movement
// used to be blocked by ANY non-same-side entity, including neutral
// garrison soldiers standing in a single-tile chokepoint like the gate —
// now only a genuine 'enemy' blocks the player's walk.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Northwatch gate: a real door, and neutral NPCs no longer block the player', () => {
    test('the gate starts as a closed, unlocked-for-non-hostiles door', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const gate = window.campaign2NorthwatchGateHex;
            const door = window.tileObjects[`${gate.q},${gate.r}`];
            const terrain = window.getTerrainAt(gate.q, gate.r);
            return {
                doorType: door?.type,
                terrainName: terrain.name,
                hasAccessThreshold: !!door?.accessThreshold,
            };
        });
        expect(result.doorType).toBe('door_closed');
        expect(result.terrainName).toBe('Climbable Wall');
        expect(result.hasAccessThreshold).toBe(true);
    });

    test('a non-hostile player can open the gate via toggleDoor', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const gate = window.campaign2NorthwatchGateHex;
            window.toggleDoor(gate.q, gate.r, window.player);
            const terrain = window.getTerrainAt(gate.q, gate.r);
            const door = window.tileObjects[`${gate.q},${gate.r}`];
            return { terrainName: terrain.name, doorType: door?.type, isOpenGate: window.isOpenGateAt(gate.q, gate.r) };
        });
        // The gate hex stays 'Climbable Wall' terrain permanently, open or
        // closed — it's simultaneously part of the wall ring and a door,
        // and swapping to Wood Floor when opened would puncture the wall's
        // elevation continuity right at the gate. Ground-level passability
        // comes from the door_open/door_closed tileObject state instead
        // (isOpenGateAt), not a terrain swap.
        expect(result.terrainName).toBe('Climbable Wall');
        expect(result.doorType).toBe('door_open');
        expect(result.isOpenGate).toBe(true);
    });

    test('the player can walk through a neutral NPC standing in their path', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const player = window.player;
            const startHex = { ...player.hex };
            const blockerHex = { q: startHex.q + 1, r: startHex.r };
            const neutral = window.createMonster('orc', blockerHex, null, null, 'neutral');
            neutral.side = 'neutral';
            window.entities.push(neutral);
            window.isInCombat = false;
            window.playerMoveProcess(player, [blockerHex]);
            await new Promise(r => setTimeout(r, 300));
            return { playerHex: { ...player.hex }, blockerHex };
        });
        expect(result.playerHex.q).toBe(result.blockerHex.q);
        expect(result.playerHex.r).toBe(result.blockerHex.r);
    });

    test('an enemy still blocks the player\'s path', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const player = window.player;
            const startHex = { ...player.hex };
            const blockerHex = { q: startHex.q + 1, r: startHex.r };
            // Companions (e.g. Wren) can already occupy a hex adjacent to a
            // freshly-created character — clear it first so the enemy below
            // is unambiguously the only occupant getEntityAtHex will find.
            window.entities = window.entities.filter(e => !(e.hex.q === blockerHex.q && e.hex.r === blockerHex.r));
            const enemy = window.createMonster('orc', blockerHex, null, null, 'enemy');
            window.entities.push(enemy);
            window.isInCombat = false;
            window.invalidateVisibilityCache && window.invalidateVisibilityCache();
            window.playerMoveProcess(player, [blockerHex]);
            await new Promise(r => setTimeout(r, 300));
            return { playerHex: { ...player.hex }, startHex, blockerHex };
        });
        expect(result.playerHex.q).toBe(result.startHex.q);
        expect(result.playerHex.r).toBe(result.startHex.r);
    });
});
