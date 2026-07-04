const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('combat feedback FX: floating text, hit-flash, screen shake', () => {
    test('spawnFloatingText pushes and prunes entries over time', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.floatingTexts = [];
            window.spawnFloatingText({ q: 1, r: 1 }, '-5', '#f00');
            const countAfterSpawn = window.floatingTexts.length;
            // Force the entry to look 1000ms old (past the 900ms lifespan) and re-render to prune it.
            window.floatingTexts[0].start = performance.now() - 1000;
            window.renderFloatingTexts(window.mapCtx, window.hexToPixel, window.cameraZoom);
            const countAfterPrune = window.floatingTexts.length;
            return { countAfterSpawn, countAfterPrune };
        });
        expect(result.countAfterSpawn).toBe(1);
        expect(result.countAfterPrune).toBe(0);
    });

    test('flashEntity sets a color and expiry that clears after the duration', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const ent = window.entities.find(e => e.side === 'player' && !e.rider);
            window.flashEntity(ent, '#f00', 50);
            const flashedNow = ent._fxFlashUntil > performance.now();
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve({ flashedNow, expiredLater: ent._fxFlashUntil <= performance.now() });
                }, 120);
            });
        });
        expect(result.flashedNow).toBe(true);
        expect(result.expiredLater).toBe(true);
    });

    test('triggerScreenShake decays to zero offset after its duration', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.triggerScreenShake(10, 50);
            window.applyScreenShake();
            const shakingNow = Math.abs(window.shakeOffsetX) <= 10 && window._screenShakeUntil > performance.now();
            return new Promise(resolve => {
                setTimeout(() => {
                    window.applyScreenShake();
                    resolve({ shakingNow, shakeX: window.shakeOffsetX, shakeY: window.shakeOffsetY });
                }, 120);
            });
        });
        expect(result.shakingNow).toBe(true);
        expect(result.shakeX).toBe(0);
        expect(result.shakeY).toBe(0);
    });

    test('a landed melee hit spawns floating damage text and flashes the target', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.floatingTexts = [];
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            const target = new window.Enemy('Test Dummy', '#f00', { q: attacker.hex.q + 1, r: attacker.hex.r }, 0, 100, 0);
            target.side = 'enemy';
            window.entities.push(target);
            // Force a guaranteed hit by stubbing Math.random to 0 (roll 0 always beats hitChance).
            const origRandom = Math.random;
            Math.random = () => 0;
            window.tryAttack(attacker, target, false, false, 0);
            Math.random = origRandom;
            return { textCount: window.floatingTexts.length, flashed: !!target._fxFlashUntil };
        });
        expect(result.textCount).toBeGreaterThan(0);
        expect(result.flashed).toBe(true);
    });
});
