const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

// Mira's house used to sit at center (6,9), halfW=2 — its wall ring reached
// q=8, exactly the column the north road runs down (setupVillageScene's
// paintRoad has no "don't overwrite Wall" guard, unlike carveBuilding's own
// paintPath), so the road punched through her east wall. Her west wall
// (starting at q=5) also sat flush against the tavern's own floor (maxQ=5),
// leaving no path gap between the two buildings. Relocated to sit clear on
// the far (east) side of the road instead.
test.describe("Mira's house: relocated clear of the north road and the tavern", () => {
    test("the house's interior no longer touches the tavern's own footprint", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            houseFloor: window.getTerrainAt(12, 9).name,
            gapBetweenTavernAndHouse: window.getTerrainAt(8, 9).name, // the north road, not a wall
        }));
        expect(result.houseFloor).toBe('Wood Floor');
        expect(result.gapBetweenTavernAndHouse).not.toBe('Wall');
    });

    test("the house's east wall is intact, not overwritten by the north road", async ({ page }) => {
        await createCharacter(page);
        // The house now sits entirely east of q=8 (floor q=11..13, wall
        // reaching q=10..14) — well clear of the road column at q=8.
        const eastWall = await page.evaluate(() => window.getTerrainAt(14, 9).name);
        expect(eastWall).toBe('Wall');
    });

    test("the door (10,9) connects to the north road via a short spur", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            spur: window.getTerrainAt(9, 9).name,
            road: window.getTerrainAt(8, 9).name,
        }));
        expect(result.spur).toBe('Path');
        expect(result.road).toBe('Path');
    });

    test("Mira Ashbrook's overnight schedule sends her to the relocated house", async ({ page }) => {
        await createCharacter(page);
        const schedule = await page.evaluate(() => window.getNpcSchedules()['Mira Ashbrook']);
        expect(schedule[0].hex).toEqual({ q: 12, r: 9 });
        expect(schedule[2].hex).toEqual({ q: 12, r: 9 });
    });
});
