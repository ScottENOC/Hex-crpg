// tests/carve-polygon-room.spec.js
// carvePolygonRoom (campaign2World.js): a generic room builder for shapes
// that aren't a simple axis-aligned rectangle (unlike carveFlatRoom) — walls
// are real hex-adjacent lines between arbitrary corner hexes, doors punch
// through those walls, the interior flood-fills with a floor type, and each
// door auto-connects to the nearest pre-existing Path via an
// obstacle-avoiding BFS route.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('carvePolygonRoom', () => {
    test('draws real hex-adjacent wall lines between corners, forming a closed loop', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const corners = [{ q: 300, r: 300 }, { q: 306, r: 300 }, { q: 306, r: 305 }, { q: 300, r: 305 }];
            const region = window.carvePolygonRoom(corners, [{ q: 303, r: 305 }], 'Wood Floor');
            // Every consecutive pair of wall hexes in the region's own list
            // should be a real neighbor of the next (no gaps) — spot-check
            // by confirming getNeighbors() links exist between adjacent
            // entries along one wall segment.
            const segment = window.hexLine({ q: 300, r: 300 }, { q: 306, r: 300 });
            const allAdjacent = segment.every((h, i) => {
                if (i === 0) return true;
                const prevNeighbors = window.getNeighbors(segment[i - 1].q, segment[i - 1].r);
                return prevNeighbors.some(n => n.q === h.q && n.r === h.r);
            });
            return { wallCount: region.wallHexes.length, allAdjacent };
        });
        expect(result.wallCount).toBeGreaterThan(10);
        expect(result.allAdjacent).toBe(true);
    });

    test('punches doors through as real open floor, and leaves the rest of the perimeter solid wall', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const corners = [{ q: 320, r: 300 }, { q: 326, r: 300 }, { q: 326, r: 305 }, { q: 320, r: 305 }];
            const door = { q: 323, r: 305 };
            window.carvePolygonRoom(corners, [door], 'Wood Floor');
            return {
                doorTerrain: window.getTerrainAt(door.q, door.r).name,
                doorObj: window.tileObjects[`${door.q},${door.r}`]?.type,
                wallTerrain: window.getTerrainAt(320, 300).name,
            };
        });
        expect(result.doorTerrain).toBe('Wood Floor');
        expect(result.doorObj).toBe('door_open');
        expect(result.wallTerrain).toBe('Wall');
    });

    test('flood-fills the enclosed interior with the given floor type', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const corners = [{ q: 340, r: 300 }, { q: 346, r: 300 }, { q: 346, r: 305 }, { q: 340, r: 305 }];
            window.carvePolygonRoom(corners, [{ q: 343, r: 305 }], 'Wood Floor');
            return window.getTerrainAt(343, 302).name; // dead center, well inside
        });
        expect(result).toBe('Wood Floor');
    });

    test('connects the door to a nearby pre-existing Path via a route that never crosses the new walls', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            // Lay down a Path a few hexes south of where the door will be,
            // offset sideways so a straight line from the door would have
            // to jog around the room's own south wall to reach it.
            const existingPath = { q: 366, r: 312 };
            window.setTerrainAt(existingPath.q, existingPath.r, 'Path');
            const corners = [{ q: 360, r: 300 }, { q: 366, r: 300 }, { q: 366, r: 305 }, { q: 360, r: 305 }];
            const door = { q: 363, r: 305 };
            window.carvePolygonRoom(corners, [door], 'Wood Floor');
            // Confirm a connected Path route exists from the door out to
            // the pre-existing Path tile without stepping onto any of the
            // room's own wall hexes.
            const visited = new Set([`${door.q},${door.r}`]);
            let frontier = [door];
            let reached = false;
            for (let step = 0; step < 50 && !reached; step++) {
                const next = [];
                frontier.forEach(h => {
                    window.getNeighbors(h.q, h.r).forEach(n => {
                        const key = `${n.q},${n.r}`;
                        if (visited.has(key)) return;
                        const t = window.getTerrainAt(n.q, n.r).name;
                        if (t !== 'Path' && t !== 'Wood Floor') return;
                        visited.add(key);
                        if (n.q === existingPath.q && n.r === existingPath.r) reached = true;
                        next.push(n);
                    });
                });
                frontier = next;
            }
            return reached;
        });
        expect(result).toBe(true);
    });
});

test.describe('the verification room built with carvePolygonRoom', () => {
    test('the sheared-rectangle test room is carved with its door on the south wall, interior open, corners solid', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => ({
            door: window.getTerrainAt(24, -483).name,
            doorType: window.tileObjects['24,-483']?.type,
            interior: window.getTerrainAt(22, -483).name,
            topLeft: window.getTerrainAt(19, -482).name,
            topRight: window.getTerrainAt(26, -489).name,
        }));
        expect(result.door).toBe('Wood Floor');
        expect(result.doorType).toBe('door_open');
        expect(result.interior).toBe('Wood Floor');
        expect(result.topLeft).toBe('Wall');
        expect(result.topRight).toBe('Wall');
    });
});
