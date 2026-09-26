// tests/armour-anchor-lab.spec.js
// Campaign 5 is intentionally isolated from the normal map/equipment renderer.
const { test, expect } = require('@playwright/test');

test('campaign 5 renders raw armour anchors and body target mapping', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#campaign-select', { state: 'visible' });
    await page.waitForFunction(() => !!document.querySelector('#campaign-select option[value="5"]'));
    await page.selectOption('#campaign-select', '5');
    await page.click('#createCharacterButton');

    await expect(page.locator('#scenario5-armour-lab')).toBeVisible();
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.rendered === true);

    const state = await page.evaluate(() => ({
        active: window.__scenario5ArmourLabActive,
        gameVisible: getComputedStyle(document.getElementById('gameContainer')).display !== 'none',
        armour: window.SCENARIO5_ARMOUR_DEBUG_STATE.armour,
        view: window.SCENARIO5_ARMOUR_DEBUG_STATE.view,
        sourceNames: Object.keys(window.SCENARIO5_ARMOUR_DEBUG_STATE.sourceAnchors).sort(),
        mapping: window.SCENARIO5_ARMOUR_DEBUG_STATE.mapping,
        bounds: window.SCENARIO5_ARMOUR_DEBUG_STATE.bounds,
        mappingText: document.getElementById('scenario5-mapping').textContent,
    }));

    expect(state.active).toBe(true);
    expect(state.gameVisible).toBe(false);
    expect(state.armour).toBe('heavy');
    expect(state.view).toBe('front');
    expect(state.sourceNames).toEqual(['bottomExtent', 'leftExtent', 'rightExtent', 'topExtent']);
    expect(state.mapping.topExtent).toEqual(['armourShoulderTopLeft', 'armourShoulderTopRight']);
    expect(state.mapping.bottomExtent).toEqual(['leftFootSole', 'rightFootSole']);
    expect(state.bounds.width).toBeGreaterThan(100);
    expect(state.bounds.height).toBeGreaterThan(100);
    expect(state.mappingText).toContain('armour.topExtent');
    expect(state.mappingText).toContain('body.armourShoulderTopLeft');

    await page.selectOption('#scenario5-armour-select', 'light');
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.armour === 'light');
    await page.selectOption('#scenario5-facing-select', 'back');
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.view === 'back');
});
