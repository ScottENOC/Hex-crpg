const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Silverhart Palace: throne room rear door to the queen\'s chambers', () => {
    test('the rear door starts closed and locked behind a high reputation threshold, not a free-standing door graphic', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const throneCenter = window.campaign2PalaceThroneCenter;
            const rearDoor = { q: throneCenter.q, r: throneCenter.r - 5 };
            const door = window.tileObjects[`${rearDoor.q},${rearDoor.r}`];
            return {
                terrain: window.getTerrainAt(rearDoor.q, rearDoor.r).name,
                tileObj: door?.type,
                accessThreshold: door?.accessThreshold,
            };
        });
        expect(result.terrain).toBe('Wall');
        expect(result.tileObj).toBe('door_closed');
        expect(result.accessThreshold).toEqual({ faction: 'silverhart_kingdom', standing: 40 });
    });

    test('the rear door refuses to open below the threshold, and opens once standing clears it', async ({ page }) => {
        await createCharacter(page);
        const below = await page.evaluate(() => {
            const throneCenter = window.campaign2PalaceThroneCenter;
            const rearDoor = { q: throneCenter.q, r: throneCenter.r - 5 };
            window.toggleDoor(rearDoor.q, rearDoor.r, window.party[0]);
            return window.getTerrainAt(rearDoor.q, rearDoor.r).name;
        });
        expect(below).toBe('Wall'); // still locked — default standing is nowhere near 40

        const after = await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 40;
            const throneCenter = window.campaign2PalaceThroneCenter;
            const rearDoor = { q: throneCenter.q, r: throneCenter.r - 5 };
            window.toggleDoor(rearDoor.q, rearDoor.r, window.party[0]);
            return {
                terrain: window.getTerrainAt(rearDoor.q, rearDoor.r).name,
                tileObj: window.tileObjects[`${rearDoor.q},${rearDoor.r}`]?.type,
            };
        });
        expect(after.terrain).toBe('Wood Floor');
        expect(after.tileObj).toBe('door_open');
    });

    test('once opened, the corridor between the throne room and the bedroom is fully walkable (no gap of impassable Wall)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 40;
            const throneCenter = window.campaign2PalaceThroneCenter;
            const bedroomCenter = window.campaign2PalaceBedroomCenter;
            const rearDoor = { q: throneCenter.q, r: throneCenter.r - 5 };
            window.toggleDoor(rearDoor.q, rearDoor.r, window.party[0]);
            const rows = [];
            for (let r = bedroomCenter.r + 2; r <= throneCenter.r - 5; r++) rows.push(r);
            return rows.map(r => window.getTerrainAt(throneCenter.q, r).name);
        });
        result.forEach(name => expect(name).not.toBe('Wall'));
    });
});

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

    test('the gate is a real checkpoint (closed Palisade Wall + a locked, threshold-gated door), not an open gap', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const gateHex = { q: center.q - 1, r: center.r + 23 };
            const roadHex = { q: center.q, r: center.r + 15 };
            const door = window.tileObjects[`${gateHex.q},${gateHex.r}`];
            return {
                gateTerrain: window.getTerrainAt(gateHex.q, gateHex.r).name,
                roadTerrain: window.getTerrainAt(roadHex.q, roadHex.r).name,
                doorType: door?.type,
                accessThreshold: door?.accessThreshold,
            };
        });
        expect(result.gateTerrain).toBe('Palisade Wall');
        expect(result.roadTerrain).toBe('Path');
        expect(result.doorType).toBe('door_closed');
        expect(result.accessThreshold).toEqual({ faction: 'silverhart_kingdom', standing: -10 });
    });

    test('the gate opens for a player who clears its (low) standing bar', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 0; // clears the -10 bar
            const center = window.campaign2PalaceThroneCenter;
            const gateHex = { q: center.q - 1, r: center.r + 23 };
            window.toggleDoor(gateHex.q, gateHex.r, window.party[0]);
            return window.getTerrainAt(gateHex.q, gateHex.r).name;
        });
        expect(result).toBe('Path');
    });

    test('the three checkpoints require rising thresholds: gate < great hall < private chambers', async ({ page }) => {
        await createCharacter(page);
        const thresholds = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const gateHex = { q: center.q - 1, r: center.r + 23 };
            const throneDoorHex = { q: center.q, r: center.r + 4 };
            const rearDoorHex = { q: center.q, r: center.r - 5 };
            return {
                gate: window.tileObjects[`${gateHex.q},${gateHex.r}`]?.accessThreshold?.standing,
                throne: window.tileObjects[`${throneDoorHex.q},${throneDoorHex.r}`]?.accessThreshold?.standing,
                bedroom: window.tileObjects[`${rearDoorHex.q},${rearDoorHex.r}`]?.accessThreshold?.standing,
            };
        });
        expect(thresholds.gate).toBeLessThan(thresholds.throne);
        expect(thresholds.throne).toBeLessThan(thresholds.bedroom);
    });

    test('the great hall door refuses a middling-standing player but opens once they clear its bar', async ({ page }) => {
        await createCharacter(page);
        const below = await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 5; // typical fresh-human seed, below the 15 bar
            const center = window.campaign2PalaceThroneCenter;
            const throneDoorHex = { q: center.q, r: center.r + 4 };
            window.toggleDoor(throneDoorHex.q, throneDoorHex.r, window.party[0]);
            return window.getTerrainAt(throneDoorHex.q, throneDoorHex.r).name;
        });
        expect(below).toBe('Wall');

        const after = await page.evaluate(() => {
            window.factions.silverhart_kingdom.standing = 15;
            const center = window.campaign2PalaceThroneCenter;
            const throneDoorHex = { q: center.q, r: center.r + 4 };
            window.toggleDoor(throneDoorHex.q, throneDoorHex.r, window.party[0]);
            return window.getTerrainAt(throneDoorHex.q, throneDoorHex.r).name;
        });
        expect(after).toBe('Wood Floor');
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
