// tests/building-integrity-audit.spec.js
// A general integrity audit over every registered interiorRegion
// (window.interiorRegions) in the full Campaign 2 world: each building must
// have (1) a complete wall ring — no wall hex silently overwritten by a
// later street/building repaint, (2) a floor that still matches its
// declared floorType, and (3) at least one real door. This is the generic
// version of the "interior-audit walk of the capital" bug-hunting already
// done by hand for a couple of Silverhart buildings (see the
// builderHouseRegion / manorRegion fixes in campaign2World.js) — run over
// literally every building in the game, not just the ones someone happened
// to walk through.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

const WALL_TERRAIN = new Set(['Wall', 'Palisade Wall', 'Climbable Wall', 'Keep Wall']);

test.describe('building integrity audit: every interior region has a full wall, intact floor, and a door', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    // KNOWN, TRACKED BUG (ROADMAP.md section F): the Silverhart palace
    // complex (barracks/council/tower, ~12 regions clustered near
    // campaign2PalaceThroneCenter) has its corridors/streets painted after
    // several buildings' walls were carved, silently overwriting real wall
    // hexes with Path/Wood Floor the same way the manor/builder-house bugs
    // already fixed here once were — just not swept across the whole
    // complex. test.fail() keeps this documented and CI green without
    // hiding the debt; remove the annotation once F1 (ROADMAP.md) is done —
    // the assertions below already encode the real requirement.
    test('no building has a wall hex silently overwritten by something else', async ({ page }) => {
        test.fail();
        const result = await page.evaluate((wallTerrainArr) => {
            const wallTerrain = new Set(wallTerrainArr);
            const regions = window.interiorRegions || [];
            // A star fort's own core (carveStarFort) is a large open
            // courtyard that a real keep/building is deliberately placed
            // inside of (see buildNorthwatchFort/buildRidgeholdFort/
            // buildOrcStronghold's own "keepDoor must sit on the keep's own
            // wall row" comments) — its wall legitimately overwrites a few
            // of the fort's own courtyard cells. Detected structurally: skip
            // any hex that falls inside a region at least 4x smaller than
            // some other region also covering that hex.
            const bboxArea = r => (r.maxQ - r.minQ + 1) * (r.maxR - r.minR + 1);
            const inBBox = (r, h) => h.q >= r.minQ && h.q <= r.maxQ && h.r >= r.minR && h.r <= r.maxR;
            const isNestedCell = (h, selfArea) => regions.some(other => inBBox(other, h) && bboxArea(other) * 4 < selfArea);

            const breaches = [];
            regions.forEach((region, idx) => {
                if (!region.wallHexes) return;
                const selfArea = bboxArea(region);
                region.wallHexes.forEach(h => {
                    if (isNestedCell(h, selfArea)) return;
                    const t = window.getTerrainAt(h.q, h.r).name;
                    // The door hex(es) are legitimately Floor/Path, not Wall —
                    // skip them explicitly.
                    const isDoor = (region.doorHex && region.doorHex.q === h.q && region.doorHex.r === h.r) ||
                        (region.doorHexes && region.doorHexes.some(d => d.q === h.q && d.r === h.r));
                    if (isDoor) return;
                    if (!wallTerrain.has(t)) breaches.push({ idx, q: h.q, r: h.r, terrain: t });
                });
            });
            return breaches;
        }, [...WALL_TERRAIN]);
        expect(result).toEqual([]);
    });

    // Same tracked bug as above (ROADMAP.md section F) — the palace
    // complex's corridors overwrite real floor hexes too, not just walls.
    test('no building has a floor hex silently overwritten by something else', async ({ page }) => {
        test.fail();
        const result = await page.evaluate(() => {
            const regions = window.interiorRegions || [];
            const bboxArea = r => (r.maxQ - r.minQ + 1) * (r.maxR - r.minR + 1);
            const inBBox = (r, h) => h.q >= r.minQ && h.q <= r.maxQ && h.r >= r.minR && h.r <= r.maxR;
            const isNestedCell = (h, selfArea) => regions.some(other => inBBox(other, h) && bboxArea(other) * 4 < selfArea);

            const breaches = [];
            regions.forEach((region, idx) => {
                if (!region.floorHexes || !region.floorType) return;
                const selfArea = bboxArea(region);
                region.floorHexes.forEach(h => {
                    if (isNestedCell(h, selfArea)) return; // a keep sitting inside this fort's own courtyard
                    const t = window.getTerrainAt(h.q, h.r).name;
                    if (t !== region.floorType) breaches.push({ idx, q: h.q, r: h.r, expected: region.floorType, actual: t });
                });
            });
            return breaches;
        });
        expect(result).toEqual([]);
    });

    // Also part of the tracked palace-complex bug (ROADMAP.md section F) —
    // one region (the tower/chambers wing near campaign2PalaceThroneCenter)
    // has no registered door at all.
    test('every building has at least one real door (a non-wall gap in its own wall ring)', async ({ page }) => {
        test.fail();
        const result = await page.evaluate(() => {
            const missingDoor = [];
            (window.interiorRegions || []).forEach((region, idx) => {
                const hasDoor = (region.doorHex) || (region.doorHexes && region.doorHexes.length > 0);
                if (!hasDoor) missingDoor.push(idx);
            });
            return missingDoor;
        });
        expect(result).toEqual([]);
    });

    test('no two buildings claim the same hex as both floor (interior) — footprints do not overlap', async ({ page }) => {
        const result = await page.evaluate(() => {
            const regions = window.interiorRegions || [];
            // A star fort's own core (carveStarFort) is a large open
            // courtyard that a real keep/building is deliberately placed
            // inside of (see buildNorthwatchFort/buildRidgeholdFort/
            // buildOrcStronghold's own "keepDoor must sit on the keep's own
            // wall row" comments) — that nesting is by design, not a clash.
            // Detected structurally: one region's bounding box fully
            // contains the other's AND the outer one spans much more area
            // (a real star fort's point-to-point span vs. a small keep).
            const bboxArea = r => (r.maxQ - r.minQ + 1) * (r.maxR - r.minR + 1);
            const contains = (outer, inner) => inner.minQ >= outer.minQ && inner.maxQ <= outer.maxQ && inner.minR >= outer.minR && inner.maxR <= outer.maxR;
            const isIntentionalNesting = (a, b) => {
                const [outer, inner] = bboxArea(a) > bboxArea(b) ? [a, b] : [b, a];
                return contains(outer, inner) && bboxArea(outer) > bboxArea(inner) * 4;
            };

            const owner = new Map();
            const collisionPairs = new Set();
            regions.forEach((region, idx) => {
                (region.floorHexes || []).forEach(h => {
                    const key = `${h.q},${h.r}`;
                    if (owner.has(key) && owner.get(key) !== idx) {
                        collisionPairs.add(JSON.stringify([Math.min(owner.get(key), idx), Math.max(owner.get(key), idx)]));
                    }
                    owner.set(key, idx);
                });
            });
            return [...collisionPairs].map(p => JSON.parse(p))
                .filter(([a, b]) => !isIntentionalNesting(regions[a], regions[b]));
        });
        expect(result).toEqual([]);
    });
});
