// tests/performance-monitor.spec.js
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('in-game performance monitor', () => {
    test('is off by default, can profile ticks, report timings, and restore wrappers', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.performanceMonitor);

        const initial = await page.evaluate(() => ({
            enabled: window.performanceMonitor.enabled,
            hasSettings: !!document.getElementById('performance-monitor-settings')
        }));
        expect(initial.enabled).toBe(false);
        expect(initial.hasSettings).toBe(true);

        const profiled = await page.evaluate(() => {
            const before = window.runTickInternal;
            window.performanceMonitor.enable();
            const wrapped = window.runTickInternal;
            for (let i = 0; i < 30; i++) window.runTickInternal(false, true, 1.0);
            const report = window.performanceMonitor.getReport();
            const tickCount = window.performanceMonitor.tickCount;
            window.performanceMonitor.disable();
            return {
                wrappedChanged: wrapped !== before,
                restored: window.runTickInternal === before,
                tickCount,
                report,
                enabledAfter: window.performanceMonitor.enabled,
                overlayAfter: !!document.getElementById('performance-monitor-overlay')
            };
        });

        expect(profiled.wrappedChanged).toBe(true);
        expect(profiled.restored).toBe(true);
        expect(profiled.tickCount).toBeGreaterThan(0);
        expect(profiled.report).toContain('HEX-CRPG PERFORMANCE REPORT');
        expect(profiled.report).toContain('Render breakdown:');
        expect(profiled.report).toContain('TICK WALL TIME');
        expect(profiled.report).toContain('runTickInternal (simulation)');
        expect(profiled.report).toContain('SLOWEST TICK SNAPSHOTS');
        expect(profiled.enabledAfter).toBe(false);
        expect(profiled.overlayAfter).toBe(false);
    });

    test('Settings controls enable the profiler and expose copy/report controls', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.performanceMonitor && !!document.getElementById('performance-monitor-enabled'));

        await page.locator('#performance-monitor-toggle').dispatchEvent('touchend', {
            changedTouches: [{ identifier: 1, clientX: 10, clientY: 10 }]
        });
        await expect(page.locator('#performance-monitor-overlay')).toBeVisible();
        await expect(page.locator('#performance-monitor-copy')).toBeVisible();
        await expect(page.locator('#performance-monitor-show')).toBeVisible();
        await expect(page.locator('#performance-monitor-toggle')).toHaveText('Stop Profiling');
        expect(await page.evaluate(() => window.performanceMonitor.enabled)).toBe(true);

        await page.locator('#performance-monitor-toggle').dispatchEvent('touchend', {
            changedTouches: [{ identifier: 1, clientX: 10, clientY: 10 }]
        });
        await expect(page.locator('#performance-monitor-overlay')).toHaveCount(0);
        await expect(page.locator('#performance-monitor-toggle')).toHaveText('Start Profiling');
        expect(await page.evaluate(() => window.performanceMonitor.enabled)).toBe(false);
    });

    test('overlay actions work through explicit touchend without a synthetic click', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.performanceMonitor);
        await page.evaluate(() => window.performanceMonitor.enable());
        await expect(page.locator('#performance-monitor-overlay')).toBeVisible();

        await page.locator('#performance-monitor-show').dispatchEvent('touchend', {
            changedTouches: [{ identifier: 1, clientX: 10, clientY: 10 }]
        });
        await expect(page.locator('#performance-monitor-report-modal')).toBeVisible();

        await page.locator('#performance-monitor-report-modal button', { hasText: 'Close' }).dispatchEvent('touchend', {
            changedTouches: [{ identifier: 1, clientX: 10, clientY: 10 }]
        });
        await expect(page.locator('#performance-monitor-report-modal')).toHaveCount(0);

        await page.locator('#performance-monitor-disable').dispatchEvent('touchend', {
            changedTouches: [{ identifier: 1, clientX: 10, clientY: 10 }]
        });
        await expect(page.locator('#performance-monitor-overlay')).toHaveCount(0);
        expect(await page.evaluate(() => window.performanceMonitor.enabled)).toBe(false);
    });

    test('reuses final player visibility while visibility inputs are unchanged', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.performanceVisibilityCacheStats && typeof window.isVisibleToPlayer === 'function');

        const result = await page.evaluate(() => {
            const stats = window.performanceVisibilityCacheStats;
            const before = { hits: stats.hits, misses: stats.misses };
            const hex = { q: window.player.hex.q, r: window.player.hex.r };
            const first = window.isVisibleToPlayer(hex);
            const afterFirst = { hits: stats.hits, misses: stats.misses };
            const second = window.isVisibleToPlayer(hex);
            const afterSecond = { hits: stats.hits, misses: stats.misses };
            return { before, afterFirst, afterSecond, first, second };
        });

        expect(result.first).toBe(result.second);
        expect(result.afterFirst.misses).toBeGreaterThan(result.before.misses);
        expect(result.afterSecond.hits).toBeGreaterThan(result.afterFirst.hits);
        expect(result.afterSecond.misses).toBe(result.afterFirst.misses);
    });
});