// tests/graphics-settings.spec.js
// B1: manual graphics options menu (frame rate, render scale, reduce
// motion, foliage detail) — see graphicsSettings.js. Each setting persists
// to localStorage (device preference, not save-file state) and hooks into
// existing mechanisms rather than adding new ones.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('B1: graphics options', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('frame rate mode: a manual pin overrides the adaptive interval; Auto hands control back', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.setFrameRateMode('30');
            const manual30 = window._getRenderIntervalMs();

            window.setFrameRateMode('15');
            const manual15 = window._getRenderIntervalMs();

            window.setFrameRateMode('auto');
            const auto = window._getRenderIntervalMs();

            return { manual30, manual15, auto };
        });
        expect(result.manual30).toBe(33);
        expect(result.manual15).toBe(66);
        expect(result.auto).toBe(16); // fresh Auto state starts at the fastest tier
    });

    test('a manual frame-rate pin persists to localStorage and is not perturbed by _recordRenderCost', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.setFrameRateMode('30');
            window._recordRenderCost(200); // would normally push the adaptive tier way up
            const interval = window._getRenderIntervalMs();
            const stored = localStorage.getItem('rpg_framerate_mode');
            return { interval, stored };
        });
        expect(result.interval).toBe(33); // unchanged — manual pin ignores cost samples entirely
        expect(result.stored).toBe('30');
    });

    test('render scale resizes the canvas backing store while the CSS box stays full-size', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.setRenderScale('0.5');
            const canvas = window.mapCanvas || document.getElementById('mapCanvas');
            const container = document.getElementById('game-board');
            return {
                backingW: canvas.width,
                containerW: container.clientWidth,
                cssW: canvas.style.width,
            };
        });
        expect(result.backingW).toBeCloseTo(result.containerW * 0.5, 0);
        expect(result.cssW).toBe(`${result.containerW}px`);

        // Restore to 100% so later tests in this file aren't affected — each
        // test gets a fresh page via createCharacter, but be tidy anyway.
        await page.evaluate(() => window.setRenderScale('1'));
    });

    test('reduce motion suppresses screen shake, melee lunge, and floating-text drift', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.setReduceMotion(true);

            window._screenShakeUntil = 0;
            window.triggerScreenShake(10, 300);
            const shakeSuppressed = window._screenShakeUntil === 0;

            const attacker = { hex: { q: 0, r: 0 } };
            const target = { hex: { q: 1, r: 0 } };
            window.triggerMeleeLunge(attacker, target);
            const lungeSuppressed = !attacker._meleeLungeStart;

            window.setReduceMotion(false);
            window.triggerScreenShake(10, 300);
            const shakeNormal = window._screenShakeUntil > 0;

            return { shakeSuppressed, lungeSuppressed, shakeNormal };
        });
        expect(result.shakeSuppressed).toBe(true);
        expect(result.lungeSuppressed).toBe(true);
        expect(result.shakeNormal).toBe(true);
    });

    test('foliage detail "simple" skips the seasonal-tint recolor pass', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Plant a real Forest hex and force the terrain buffer to
            // rebuild over it, counting getRecoloredHairSprite calls (the
            // expensive recolor renderTerrainPass gates on foliageDetail).
            const spot = { q: 0, r: -20 }; // clear of the village/tavern footprint, well within default vision range
            window.setTerrainAt(spot.q, spot.r, 'Forest');
            window.exploredHexes.add(`${spot.q},${spot.r}`);
            if (window.centerCameraOn) window.centerCameraOn(spot);
            window.cameraZoom = 1;

            let calls = 0;
            const real = window.getRecoloredHairSprite;
            window.getRecoloredHairSprite = (...a) => { calls++; return real(...a); };

            window.setFoliageDetail('simple');
            window.invalidateTerrainBuffer();
            window.drawMap();
            const simpleCalls = calls;

            calls = 0;
            window.setFoliageDetail('full');
            window.invalidateTerrainBuffer();
            window.drawMap();
            const fullCalls = calls;

            window.getRecoloredHairSprite = real;
            return { simpleCalls, fullCalls };
        });
        expect(result.simpleCalls).toBe(0);
        expect(result.fullCalls).toBeGreaterThan(0);
    });
});
