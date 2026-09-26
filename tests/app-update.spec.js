const { test, expect } = require('@playwright/test');

test.describe('Home Screen build refresh', () => {
    test('exposes the deployed build and detects a newer no-cache build source', async ({ page }) => {
        await page.goto('/');
        const current = await page.evaluate(() => ({
            meta:document.querySelector('meta[name="app-build"]')?.content,
            runtime:window.PRESENTATION_BUILD,
            hasCheck:typeof window.checkForAppUpdate === 'function',
        }));
        expect(current.hasCheck).toBe(true);
        expect(current.meta).toBe(current.runtime);
        expect(current.runtime).toMatch(/^\d{8}-[a-z0-9-]+$/);

        await page.route('**/name.js?app-update-check=*', route => route.fulfill({
            status:200,
            contentType:'application/javascript',
            body:"const PRESENTATION_BUILD = 'future-build';",
        }));
        expect(await page.evaluate(() => window.checkForAppUpdate({ reload:false }))).toBe(true);
    });

    test('loads the rig and directional presentation modules with the current build token', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => window.PRESENTATION_BUILD && document.querySelector('script[data-directional-equipment-tuning]'));

        const result = await page.evaluate(() => {
            const build = window.PRESENTATION_BUILD;
            const selectors = [
                'script[data-character-rig]',
                'script[data-facing-system]',
                'script[data-directional-hair-tuning]',
                'script[data-directional-weapon-tuning]',
                'script[data-directional-equipment-tuning]',
                'script[data-directional-character-ui]',
            ];
            return {
                build,
                scripts:selectors.map(selector => {
                    const el = document.querySelector(selector);
                    const url = el ? new URL(el.src, document.baseURI) : null;
                    return {
                        selector,
                        present:!!el,
                        build:url?.searchParams.get('build') || null,
                    };
                }),
            };
        });

        for (const script of result.scripts) {
            expect(script.present, `${script.selector} should be loaded`).toBe(true);
            expect(script.build, `${script.selector} should use the current build token`).toBe(result.build);
        }
    });
});