const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Silverhart Palace: hexagonal curtain wall, gate, towers, wall guards', () => {
    test('the wall forms a true hex-distance ring (hexagon) around the whole complex', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const RADIUS = 23;
            // Sample several points around the ring at that exact distance.
            const samples = [
                { q: center.q + RADIUS, r: center.r },
                { q: center.q - RADIUS, r: center.r },
                { q: center.q, r: center.r - RADIUS },
                { q: center.q + 10, r: center.r - RADIUS },
                { q: center.q - 15, r: center.r + 8 },
            ].filter(h => window.distance(center, h) === RADIUS);
            return samples.map(h => window.getTerrainAt(h.q, h.r).name);
        });
        expect(result.length).toBeGreaterThan(3);
        result.forEach(name => expect(['Palisade Wall', 'Path']).toContain(name));
    });

    test('the gate is a real gap (Path) in the wall, connected to the entrance road', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const gateHex = { q: center.q - 1, r: center.r + 23 };
            const roadHex = { q: center.q, r: center.r + 15 };
            return {
                gateTerrain: window.getTerrainAt(gateHex.q, gateHex.r).name,
                roadTerrain: window.getTerrainAt(roadHex.q, roadHex.r).name,
            };
        });
        expect(result.gateTerrain).toBe('Path');
        expect(result.roadTerrain).toBe('Path');
    });

    test('watchtowers sit on the wall at the gate and at hexagon corners', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const corners = [
                { q: center.q + 23, r: center.r },
                { q: center.q - 23, r: center.r },
                { q: center.q, r: center.r - 23 },
            ];
            return corners.map(h => window.tileObjects[`${h.q},${h.r}`]?.type);
        });
        result.forEach(t => expect(t).toBe('watchtower'));
    });

    test('Palisade Wall is nearly impassable without aid, but a ladder or agile_climber skill makes it climbable', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const plainWallHex = { q: center.q + 5, r: center.r - 23 };
            const ladderHex = Object.keys(window.tileObjects).map(k => {
                const [q, r] = k.split(',').map(Number);
                return { q, r, obj: window.tileObjects[k] };
            }).find(h => h.obj.type === 'ladder');
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            const baseline = window.getMoveCostMult(plainWallHex.q, plainWallHex.r, p);
            p.skills = p.skills || {};
            p.skills.agile_climber = 1;
            const withSkill = window.getMoveCostMult(plainWallHex.q, plainWallHex.r, p);
            delete p.skills.agile_climber;
            // A ladder only bridges the specific edge it's propped across —
            // stepping onto its wall hex from its own interior-side neighbor.
            const originalHex = { ...p.hex };
            p.hex = { ...ladderHex.obj.interiorHex };
            const withLadder = window.getMoveCostMult(ladderHex.q, ladderHex.r, p);
            const fromWrongSide = window.getMoveCostMult(ladderHex.q, ladderHex.r, { ...p, hex: { q: ladderHex.q - 5, r: ladderHex.r - 5 } });
            p.hex = originalHex;
            return { baseline, withSkill, withLadder, fromWrongSide };
        });
        expect(result.baseline).toBeGreaterThan(10);
        expect(result.withSkill).toBeLessThan(3);
        expect(result.withLadder).toBeLessThan(3);
        expect(result.fromWrongSide).toBeGreaterThan(10);
    });

    test('Palisade Wall is not the fully-impassable "Wall" terrain, so it does not hit the hardcoded impassable-terrain checks', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const wallHex = { q: center.q + 5, r: center.r - 23 };
            return window.getTerrainAt(wallHex.q, wallHex.r).name;
        });
        expect(result).toBe('Palisade Wall');
        expect(result).not.toBe('Wall');
    });

    test('at least 6 additional Royal Guards are posted on the wall/towers, on top of the interior guards', async ({ page }) => {
        await createCharacter(page);
        const guardCount = await page.evaluate(() => window.entities.filter(e => e.title === 'Royal Guard').length);
        expect(guardCount).toBeGreaterThanOrEqual(12); // 6 interior + 6 wall guards
    });
});
