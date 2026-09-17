const { test, expect } = require('@playwright/test');

test.describe('Home Screen build refresh', () => {
    test('exposes the deployed build and detects a newer no-cache index', async ({ page }) => {
        await page.goto('/');
        const current = await page.evaluate(() => ({
            meta:document.querySelector('meta[name="app-build"]')?.content,
            runtime:window.PRESENTATION_BUILD,
            hasCheck:typeof window.checkForAppUpdate === 'function',
        }));
        expect(current.hasCheck).toBe(true);
        expect(current.meta).toBe(current.runtime);
        expect(current.runtime).toMatch(/^\d{8}-[a-z0-9-]+$/);

        await page.route('**/index.html?app-update-check=*', route => route.fulfill({
            status:200,
            contentType:'text/html',
            body:'<!doctype html><meta name="app-build" content="future-build">',
        }));
        expect(await page.evaluate(() => window.checkForAppUpdate({ reload:false }))).toBe(true);
    });
});
