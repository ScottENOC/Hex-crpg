const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('four-direction facing', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => typeof window.facingFromHexDelta === 'function');
    });

    test('maps the six axial neighbour moves into four screen directions', async ({ page }) => {
        const result = await page.evaluate(() => ({
            east: window.facingFromHexDelta(1, 0),
            southEast: window.facingFromHexDelta(0, 1),
            southWest: window.facingFromHexDelta(-1, 1),
            west: window.facingFromHexDelta(-1, 0),
            northWest: window.facingFromHexDelta(0, -1),
            northEast: window.facingFromHexDelta(1, -1),
        }));
        expect(result.east).toBe('right');
        expect(result.southEast).toBe('down');
        expect(result.southWest).toBe('left');
        expect(result.west).toBe('left');
        expect(result.northWest).toBe('up');
        expect(result.northEast).toBe('right');
    });

    test('new entities start facing down and movement changes facing', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const e = new window.Entity('Facing Test', '#fff', { q: 0, r: 0 }, 1);
            window.entities.push(e);
            const initial = e.facing;
            window.updateFacingFromMovement();
            e.hex = { q: 0, r: -1 };
            window.updateFacingFromMovement();
            const up = e.facing;
            e.hex = { q: 1, r: -1 };
            window.updateFacingFromMovement();
            const right = e.facing;
            window.entities.splice(window.entities.indexOf(e), 1);
            return { initial, up, right };
        });
        expect(result.initial).toBe('down');
        expect(result.up).toBe('up');
        expect(result.right).toBe('right');
    });

    test('rider and mount share facing', async ({ page }) => {
        const result = await page.evaluate(() => {
            const rider = new window.Entity('Rider', '#fff', { q:0, r:0 }, 1);
            const mount = new window.Entity('Mount', '#fff', { q:0, r:0 }, 1);
            rider.riding = mount;
            mount.rider = rider;
            window.setEntityFacing(rider, 'left');
            return { rider:rider.facing, mount:mount.facing };
        });
        expect(result.rider).toBe('left');
        expect(result.mount).toBe('left');
    });

    test('side profile fallback compresses left and right equally', async ({ page }) => {
        const result = await page.evaluate(() => ({
            left: window.sideProfileScale('left'),
            right: window.sideProfileScale('right'),
            up: window.sideProfileScale('up'),
            down: window.sideProfileScale('down'),
        }));
        expect(result.left).toBeCloseTo(0.78, 6);
        expect(result.right).toBeCloseTo(0.78, 6);
        expect(result.up).toBe(1);
        expect(result.down).toBe(1);
    });
});
