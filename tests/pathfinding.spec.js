// tests/pathfinding.spec.js
// Out-of-combat movement optimizations: per-move path caching (solve once,
// follow the cached route, re-path only on a block) and the townsfolk road
// preference (prefersRoads biases A* to hug roads out of combat).

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('out-of-combat pathfinding: caching + road preference', () => {
    test('a straight run solves the path once and follows the cache, not re-solving every step', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const mover = window.entities.find(e => e.side === 'player');
            window.entities = [mover];
            mover.hex = { q: 500, r: 500 };
            mover.timePoints = 100000;
            mover.destination = { q: 510, r: 500 };
            mover._pathCache = null;

            let findPathCalls = 0;
            const orig = window.findPath;
            window.findPath = (...a) => { findPathCalls++; return orig(...a); };
            for (let i = 0; i < 12 && mover.destination; i++) { mover.moveCooldown = 0; window.processRealTimeStep(mover, 0); }
            window.findPath = orig;

            return { reached: mover.hex.q === 510 && mover.hex.r === 500, findPathCalls };
        });
        expect(result.reached).toBe(true);
        expect(result.findPathCalls).toBeLessThanOrEqual(3); // ~1 solve reused, not one per step
    });

    test('a hostile dropped onto the cached next hex forces a fresh solve that routes around it', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const mover = window.entities.find(e => e.side === 'player');
            window.entities = [mover];
            mover.hex = { q: 520, r: 520 };
            mover.timePoints = 100000;
            mover.destination = { q: 530, r: 520 };
            mover._pathCache = null;
            window.processRealTimeStep(mover, 0); // build cache + step once
            const cachedNext = mover._pathCache ? { ...mover._pathCache[1] } : null;

            let findPathCalls = 0;
            const orig = window.findPath;
            window.findPath = (...a) => { findPathCalls++; return orig(...a); };
            const blocker = window.createMonster('wolf', cachedNext, null, null, 'enemy');
            window.entities.push(blocker);
            mover.moveCooldown = 0;
            window.processRealTimeStep(mover, 0);
            window.findPath = orig;

            return {
                reSolved: findPathCalls >= 1,
                didNotStepOntoBlocker: !(mover.hex.q === cachedNext.q && mover.hex.r === cachedNext.r),
            };
        });
        expect(result.reSolved).toBe(true);
        expect(result.didNotStepOntoBlocker).toBe(true);
    });

    test('prefersRoads biases the route to hug a road out of combat, but is ignored in combat', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInCombat = false;
            const mover = window.entities.find(e => e.side === 'player');
            window.entities = [mover];
            // Straight grass line vs a longer rectangular road bump (up 3, across, down 3).
            for (let r = 597; r <= 600; r++) { window.setTerrainAt(600, r, 'Path'); window.setTerrainAt(608, r, 'Path'); }
            for (let q = 600; q <= 608; q++) window.setTerrainAt(q, 597, 'Path');
            const start = { q: 600, r: 600 }, dest = { q: 608, r: 600 };
            const roadHexes = p => (p || []).filter(h => window.getTerrainAt(h.q, h.r).name === 'Path').length;

            mover.prefersRoads = false;
            const plain = roadHexes(window.findPath(start, dest, undefined, mover, true));
            mover.prefersRoads = true;
            const biased = roadHexes(window.findPath(start, dest, undefined, mover, true));
            window.isInCombat = true;
            const inCombat = roadHexes(window.findPath(start, dest, undefined, mover, true));
            window.isInCombat = false;

            return { plain, biased, inCombat };
        });
        expect(result.biased).toBeGreaterThan(result.plain);   // hugs the road out of combat
        expect(result.inCombat).toBe(result.plain);            // bias off in combat
    });
});
