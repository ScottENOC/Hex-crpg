// tests/performance-monitor.spec.js
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('in-game performance monitor', () => {
    test('is off by default, can profile ticks, report timings, and restore wrappers', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.performanceMonitor);

        const initial = await page.evaluate(() => ({
            enabled: window.performanceMonitor.enabled,
            hasSettings: !!document.getElementById('performance-monitor-settings'),
            originalTick: window.runTickInternal
        }));
        expect(initial.enabled).toBe(false);
        expect(initial.hasSettings).toBe(true);

        const profiled = await page.evaluate(() => {
            const before = window.runTickInternal;
            window.performanceMonitor.enable();
            const wrapped = window.runTickInternal;

            // Drive deterministic logical ticks directly so this test does not
            // depend on wall-clock setInterval timing or device speed.
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
        expect(profiled.report).toContain('TICK WALL TIME');
        expect(profiled.report).toContain('runTickInternal (simulation)');
        expect(profiled.report).toContain('SLOWEST TICK SNAPSHOTS');
        expect(profiled.enabledAfter).toBe(false);
        expect(profiled.overlayAfter).toBe(false);
    });

    test('Settings toggle enables the profiler and exposes copy/report controls', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.performanceMonitor && !!document.getElementById('performance-monitor-enabled'));

        await page.check('#performance-monitor-enabled');
        await expect(page.locator('#performance-monitor-overlay')).toBeVisible();
        await expect(page.locator('#performance-monitor-copy')).toBeVisible();
        await expect(page.locator('#performance-monitor-show')).toBeVisible();

        const enabled = await page.evaluate(() => window.performanceMonitor.enabled);
        expect(enabled).toBe(true);

        await page.uncheck('#performance-monitor-enabled');
        await expect(page.locator('#performance-monitor-overlay')).toHaveCount(0);
        const disabled = await page.evaluate(() => window.performanceMonitor.enabled);
        expect(disabled).toBe(false);
    });
});
