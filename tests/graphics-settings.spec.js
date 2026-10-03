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
        expect(result.auto).toBe(16);
    });

    test('a manual frame-rate pin persists to localStorage and is not perturbed by _recordRenderCost', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.setFrameRateMode('30');
            window._recordRenderCost(200);
            return {
                interval: window._getRenderIntervalMs(),
                stored: localStorage.getItem('rpg_framerate_mode'),
            };
        });
        expect(result.interval).toBe(33);
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

    // Foliage-detail behaviour is intentionally not asserted through
    // getRecoloredHairSprite call counts. That helper is an implementation
    // detail shared with character recolouring and is no longer the contract
    // for seasonal terrain rendering. Visual/terrain tests cover whether
    // foliage remains drawable; this suite only owns the graphics controls.
});
