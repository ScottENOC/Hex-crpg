// tests/mobile-safe-area-save-code.spec.js
// B2 (safe-area insets for notched iPhones) and B3 (save export/import
// code) — see style.css / persistence.js.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('B2: safe-area insets', () => {
    test('viewport meta declares viewport-fit=cover', async ({ page }) => {
        await page.goto('/');
        const content = await page.locator('meta[name="viewport"]').getAttribute('content');
        expect(content).toContain('viewport-fit=cover');
    });

    test('the fixed top bars pad for env(safe-area-inset-*)', () => {
        const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
        expect(css).toMatch(/#turn-indicator-bar\s*{[^}]*env\(safe-area-inset-top\)/s);
        expect(css).toMatch(/#gameContainer\s*{[^}]*env\(safe-area-inset-bottom\)/s);
    });
});

test.describe('B3: save export/import code', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('export produces a base64 string that decodes back to the current save state', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.party[0].gold = 12345;
            const code = window.exportSaveCode();
            const decoded = JSON.parse(decodeURIComponent(escape(atob(code))));
            return { isString: typeof code === 'string', gold: decoded.party[0].gold, hasEntities: Array.isArray(decoded.entities) };
        });
        expect(result.isString).toBe(true);
        expect(result.gold).toBe(12345);
        expect(result.hasEntities).toBe(true);
    });

    test('importing a previously exported code restores state (round trip)', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.party[0].gold = 777;
            window.party[0].name = 'ExportRoundTripHero';
            const code = window.exportSaveCode();

            window.party[0].gold = 0;
            window.party[0].name = 'Overwritten';

            const ok = window.importSaveCode(code);
            return { ok, gold: window.party[0].gold, name: window.party[0].name };
        });
        expect(result.ok).toBe(true);
        expect(result.gold).toBe(777);
        expect(result.name).toBe('ExportRoundTripHero');
    });

    test('an invalid code is rejected without touching existing state', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.party[0].gold = 42;
            const ok = window.importSaveCode('not-a-valid-base64-save-code!!!');
            return { ok, goldUnchanged: window.party[0].gold === 42 };
        });
        expect(result.ok).toBe(false);
        expect(result.goldUnchanged).toBe(true);
    });

    test('the import scratch localStorage key is cleaned up after import', async ({ page }) => {
        const result = await page.evaluate(() => {
            const code = window.exportSaveCode();
            window.importSaveCode(code);
            return localStorage.getItem('rpg_save_imported_temp');
        });
        expect(result).toBeNull();
    });
});
