// tests/world-and-vision.spec.js
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('village map and vision', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('unpainted campaign-2 hexes default to grass, not water', async ({ page }) => {
        const terrain = await page.evaluate(() => window.getTerrainAt(25, 25).name);
        expect(terrain).toBe('Grass');
    });

    test('village buildings are carved and enterable (wood floor interiors)', async ({ page }) => {
        const check = await page.evaluate(() => ({
            tavernFloor: window.getTerrainAt(0, 0).name,
            storeInterior: window.getTerrainAt(14, 0).name,
            chapelInterior: window.getTerrainAt(-14, 0).name,
            houseInterior: window.getTerrainAt(0, -12).name,
            generalStoreInterior: window.getTerrainAt(0, 18).name,
            interiorRegionCount: window.interiorRegions.length,
        }));
        expect(check.tavernFloor).toBe('Wood Floor');
        expect(check.storeInterior).toBe('Wood Floor');
        expect(check.chapelInterior).toBe('Wood Floor');
        expect(check.houseInterior).toBe('Wood Floor');
        expect(check.generalStoreInterior).toBe('Wood Floor');
        expect(check.interiorRegionCount).toBe(16); // tavern, store, chapel, house, general store, Mira's house, Oskar's house, Old Mac's farmhouse, abandoned house, Millbrook, Emberlode hall/bunkhouse/mine, Reddale guardhouse/Reeve's house/inn
    });

    test('outdoor paths connect every building door to a ring around the tavern', async ({ page }) => {
        const check = await page.evaluate(() => ({
            tavernSpur: window.getTerrainAt(0, 5).name,
            houseSpur: window.getTerrainAt(0, -8).name,
            storeSpur: window.getTerrainAt(9, 0).name,
            chapelSpur: window.getTerrainAt(-9, 0).name,
            generalStoreSpur: window.getTerrainAt(0, 9).name,
            ringNorth: window.getTerrainAt(0, -6).name,
            ringSouth: window.getTerrainAt(0, 6).name,
            ringEast: window.getTerrainAt(8, 0).name,
            ringWest: window.getTerrainAt(-8, 0).name,
        }));
        Object.values(check).forEach(name => expect(name).toBe('Path'));
    });

    test('the tavern door starts closed (blocks terrain/LOS) and toggleDoor opens it', async ({ page }) => {
        const before = await page.evaluate(() => window.getTerrainAt(0, 4).name);
        expect(before).toBe('Wall');

        const after = await page.evaluate(() => {
            window.toggleDoor(0, 4);
            return {
                terrain: window.getTerrainAt(0, 4).name,
                tileObj: window.tileObjects['0,4'].type,
            };
        });
        expect(after.terrain).toBe('Wood Floor');
        expect(after.tileObj).toBe('door_open');

        const closedAgain = await page.evaluate(() => {
            window.toggleDoor(0, 4);
            return window.getTerrainAt(0, 4).name;
        });
        expect(closedAgain).toBe('Wall');
    });

    test('a closed door blocks line of sight; an open one does not', async ({ page }) => {
        // Force the door closed and check LOS across it between two known hexes
        // straddling the doorway at (0,4).
        const result = await page.evaluate(() => {
            window.setTerrainAt(0, 4, 'Wall');
            const blockedLOS = window.hasLineOfSight({ q: 0, r: 2 }, { q: 0, r: 6 });
            window.setTerrainAt(0, 4, 'Wood Floor');
            const openLOS = window.hasLineOfSight({ q: 0, r: 2 }, { q: 0, r: 6 });
            return { blockedLOS, openLOS };
        });
        expect(result.blockedLOS).toBe(false);
        expect(result.openLOS).toBe(true);
    });

    test('regression: the camera follows the player during real-time movement (not frozen)', async ({ page }) => {
        const before = await page.evaluate(() => ({ x: window.cameraX, y: window.cameraY }));
        await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            window.toggleDoor(0, 4);
            p.destination = { q: 0, r: 10 };
        });
        await page.waitForFunction(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            return p.hex.q === 0 && p.hex.r === 10;
        }, { timeout: 8000 });
        await page.waitForTimeout(200); // let smoothFollowPlayer's lerp catch up
        const after = await page.evaluate(() => ({ x: window.cameraX, y: window.cameraY }));
        expect(after.y).not.toBeCloseTo(before.y, 0); // camera must have moved south with the player
    });

    test('regression: Campaign 2 starts at full daylight, not at the seasonal-night floor', async ({ page }) => {
        // getLightLevel() is the pure time-of-day component (this is what the
        // 11:00 start-time fix targets); window.lightLevel also folds in indoor
        // dimming, and the player starts seated inside the tavern, so that
        // combined value is expected to read dim here — check the raw one.
        const timeOfDayLight = await page.evaluate(() => window.getLightLevel());
        expect(timeOfDayLight).toBe(1);
    });

    test('regression: an open door lets daytime light spill into an indoor room', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.worldSeconds = 12 * 3600; // noon, full daylight
            window.setTerrainAt(0, 4, 'Wall'); // start closed
            window.updateTime(0);
            const closedMult = window.indoorLightMult;
            window.toggleDoor(0, 4); // open it
            window.updateTime(0);
            const openMult = window.indoorLightMult;
            return { closedMult, openMult };
        });
        expect(result.openMult).toBeGreaterThan(result.closedMult);
    });
});
