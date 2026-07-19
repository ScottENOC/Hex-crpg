const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('arena lobby: redesigned layout, waiting combatants, gated beast pen', () => {
    test('the two rooms are true hex-distance circles, not q/r rectangles', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const spawnCenter = window.arenaSpawnRoomCenter;
            const npcCenter = window.arenaNpcRoomCenter;
            // A hex just outside the circle radius (but that would have been
            // inside the old rectangular room) must now be Wall.
            const outsideCircle = window.getTerrainAt(spawnCenter.q - 5, spawnCenter.r - 5).name;
            const insideCircle = window.getTerrainAt(spawnCenter.q, spawnCenter.r).name;
            const npcRoomCenterFloor = window.getTerrainAt(npcCenter.q, npcCenter.r).name;
            return { outsideCircle, insideCircle, npcRoomCenterFloor };
        });
        expect(result.outsideCircle).toBe('Wall');
        expect(result.insideCircle).toBe('Cave Floor');
        expect(result.npcRoomCenterFloor).toBe('Cave Floor');
    });

    test('the lobby spawns waiting-combatant NPCs that are dialogue-only and cannot be attacked', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const combatants = window.entities.filter(e => e.arenaFlavorLine);
            return {
                count: combatants.length,
                allNoAttack: combatants.every(e => e.noAttack === true),
                allNeutral: combatants.every(e => e.side === 'neutral'),
                allNPC: combatants.every(e => e.isNPC === true),
            };
        });
        expect(result.count).toBeGreaterThan(0);
        expect(result.allNoAttack).toBe(true);
        expect(result.allNeutral).toBe(true);
        expect(result.allNPC).toBe(true);
    });

    test('tryAttack refuses to damage a noAttack entity even when ignoreNeutralCheck (Force-Attack) is passed', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            const combatant = window.entities.find(e => e.arenaFlavorLine);
            if (!combatant) return { skipped: true };
            combatant.hex = { q: attacker.hex.q + 1, r: attacker.hex.r };
            const hpBefore = combatant.hp;
            window.tryAttack(attacker, combatant, false, false, 0, true); // Force-Attack path
            return { skipped: false, hpBefore, hpAfter: combatant.hp };
        });
        if (!result.skipped) {
            expect(result.hpAfter).toBe(result.hpBefore);
        }
    });

    test('any beast-type preview NPC is placed inside the gated, fenced pen', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const beastTypes = ['wolf', 'boar', 'tiger', 'dragon_young', 'dragon_adult', 'dragon_ancient'];
            const beasts = window.entities.filter(e => e.arenaFlavorLine && beastTypes.some(t => window.monsterTemplates[t].name === e.name));
            if (beasts.length === 0) return { hasBeast: false };
            const beast = beasts[0];
            const neighborKeys = window.getNeighbors(beast.hex.q, beast.hex.r).map(h => `${h.q},${h.r}`);
            const nearFence = neighborKeys.some(k => window.tileObjects[k] && (window.tileObjects[k].type === 'fence_h' || window.tileObjects[k].type === 'fence_v'));
            return { hasBeast: true, nearFence };
        });
        if (result.hasBeast) {
            expect(result.nearFence).toBe(true);
        }
    });

    test('the beast pen has a real, roomy walkable interior (not the old 3x1) and sits near the spawn room', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const spawnCenter = window.arenaSpawnRoomCenter;
            const npcCenter = window.arenaNpcRoomCenter;
            // Interior hexes are exactly the ones surrounded by the pen's fence tileObjects.
            const fenceKeys = Object.keys(window.tileObjects).filter(k => {
                const t = window.tileObjects[k].type;
                return t === 'fence_h' || t === 'fence_v';
            });
            const qs = fenceKeys.map(k => parseInt(k.split(',')[0], 10));
            const rs = fenceKeys.map(k => parseInt(k.split(',')[1], 10));
            const minQ = Math.min(...qs), maxQ = Math.max(...qs);
            const minR = Math.min(...rs), maxR = Math.max(...rs);
            let interiorCount = 0;
            for (let q = minQ + 1; q < maxQ; q++) {
                for (let r = minR + 1; r < maxR; r++) {
                    if (window.getTerrainAt(q, r).name === 'Cave Floor' && !window.tileObjects[`${q},${r}`]) {
                        interiorCount++;
                    }
                }
            }
            const penCenter = { q: (minQ + maxQ) / 2, r: (minR + maxR) / 2 };
            return {
                interiorCount,
                distToSpawn: window.distance(penCenter, spawnCenter),
                distToNpcRoom: window.distance(penCenter, npcCenter),
            };
        });
        expect(result.interiorCount).toBeGreaterThanOrEqual(15);
        expect(result.distToSpawn).toBeLessThan(result.distToNpcRoom);
    });

    test('the pen cannot be walked through into unset terrain beyond the lobby (three sides are real Wall, not just fence)', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const fenceKeys = Object.keys(window.tileObjects).filter(k => {
                const t = window.tileObjects[k].type;
                return t === 'fence_h' || t === 'fence_v';
            });
            // Every fence-dressed hex must actually be Wall terrain UNLESS it's
            // on the single room-facing gate column (the side with the max Q,
            // since the pen sits to the room's left/outer side) — that side is
            // the intentional passable-but-slow approach.
            const qs = fenceKeys.map(k => parseInt(k.split(',')[0], 10));
            const maxQ = Math.max(...qs);
            let leaks = 0;
            fenceKeys.forEach(k => {
                const [q, r] = k.split(',').map(Number);
                if (q === maxQ) return; // the gate side, intentionally passable
                if (window.getTerrainAt(q, r).name !== 'Wall') leaks++;
            });
            return { leaks, fenceCount: fenceKeys.length };
        });
        expect(result.fenceCount).toBeGreaterThan(0);
        expect(result.leaks).toBe(0);
    });
});
