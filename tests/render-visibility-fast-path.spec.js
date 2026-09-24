const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('render visibility fast path', () => {
    test('precomputes render visibility while gameplay visibility stays camera-independent', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__renderVisibilityFastPathInstalled && window.performanceRenderVisibilityStats);

        // Force a real map frame so the graphics coalescer calls the wrapped
        // refresh hook immediately before its synchronous drawMap pass.
        await page.evaluate(() => window.drawMap());
        await page.waitForFunction(() => (window.performanceRenderVisibilityStats?.rebuilds || 0) > 0 &&
            (window.performanceRenderVisibilityStats?.renderQueries || 0) > 0);

        const renderStats = await page.evaluate(() => ({ ...window.performanceRenderVisibilityStats }));
        expect(renderStats.candidates).toBeGreaterThan(0);
        expect(renderStats.visible).toBeGreaterThan(0);
        expect(renderStats.renderQueries).toBeGreaterThan(0);

        const offscreen = await page.evaluate(() => {
            const fast = window.isVisibleToPlayer;
            const normal = fast.__original;
            const player = window.entities.find(e => e.alive && e.side === 'player');
            if (!player || typeof normal !== 'function') return { ok: false };

            // Move only the camera, not the character. Camera position must not
            // alter what the character can perceive in gameplay systems.
            window.cameraX += 100000;
            window.cameraY += 100000;
            const target = { q: player.hex.q, r: player.hex.r };
            const beforeFallbacks = window.performanceRenderVisibilityStats.gameplayFallbacks;
            const expected = normal(target);
            const actual = fast(target);
            const afterFallbacks = window.performanceRenderVisibilityStats.gameplayFallbacks;
            return { ok: true, expected, actual, beforeFallbacks, afterFallbacks };
        });

        expect(offscreen.ok).toBe(true);
        expect(offscreen.actual).toBe(offscreen.expected);
        expect(offscreen.afterFallbacks).toBeGreaterThan(offscreen.beforeFallbacks);
    });
});