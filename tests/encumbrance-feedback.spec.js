const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Encumbrance feedback', () => {
    test('labels burden severity and shows the movement slowdown in the inventory and HUD', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.expeditionSystem && window.getPartyCarryState && window.getEncumbranceState);

        const result = await page.evaluate(() => {
            window.partyInventory.length = 0;
            for (let i = 0; i < 20; i++) window.partyInventory.push('stone');
            window.showInventoryScreen();
            const state = window.getPartyCarryState();
            const worst = state.carriers.reduce((a, b) => !a || b.burden > a.burden ? b : a, null);
            return {
                playerName: window.player.name,
                burden: worst?.burden || 0,
                severity: window.getEncumbranceState(worst?.burden || 0),
            };
        });

        expect(result.burden).toBeGreaterThan(1);
        expect(result.severity.label).not.toBe('Unencumbered');
        expect(result.severity.slowerPct).toBeGreaterThan(0);

        const panel = page.locator('#expedition-inventory-panel');
        await expect(panel).toContainText('ENCUMBERED');
        await expect(panel).toContainText(result.playerName);
        await expect(panel).toContainText('slower');

        const hud = page.locator('#expedition-status');
        await expect(hud).toContainText(/ENCUMBERED|Encumbered|encumbered/);
        await expect(hud).toContainText('slower');
    });

    test('clearly reports when the load is back within capacity', async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.expeditionSystem && window.getEncumbranceState);

        const labels = await page.evaluate(() => ({
            clear: window.getEncumbranceState(1).label,
            encumbered: window.getEncumbranceState(1.10).label,
            heavy: window.getEncumbranceState(1.20).label,
            severe: window.getEncumbranceState(1.40).label,
            overloaded: window.getEncumbranceState(1.70).label,
        }));

        expect(labels).toEqual({
            clear: 'Unencumbered',
            encumbered: 'Encumbered',
            heavy: 'Heavily encumbered',
            severe: 'Severely encumbered',
            overloaded: 'Overloaded',
        });
    });
});
