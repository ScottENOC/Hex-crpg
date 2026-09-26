// tests/armour-anchor-lab.spec.js
// Campaign 5 is intentionally isolated from the normal map/equipment renderer.
const { test, expect } = require('@playwright/test');

function expectNear(actual, expected, tolerance = 0.0005) {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test('campaign 5 renders raw armour anchors in the live body coordinate space', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#campaign-select', { state: 'visible' });
    await page.waitForFunction(() => !!document.querySelector('#campaign-select option[value="5"]'));
    await page.selectOption('#campaign-select', '5');
    await page.click('#createCharacterButton');

    await expect(page.locator('#scenario5-armour-lab')).toBeVisible();
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.rendered === true);

    let state = await page.evaluate(() => ({
        active: window.__scenario5ArmourLabActive,
        gameVisible: getComputedStyle(document.getElementById('gameContainer')).display !== 'none',
        armour: window.SCENARIO5_ARMOUR_DEBUG_STATE.armour,
        view: window.SCENARIO5_ARMOUR_DEBUG_STATE.view,
        sourceNames: Object.keys(window.SCENARIO5_ARMOUR_DEBUG_STATE.sourceAnchors).sort(),
        mapping: window.SCENARIO5_ARMOUR_DEBUG_STATE.mapping,
        bounds: window.SCENARIO5_ARMOUR_DEBUG_STATE.bounds,
        coordinateSpace: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyCoordinateSpace,
        bodyCrop: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyCrop,
        bodyDest: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyDest,
        logical: window.SCENARIO5_ARMOUR_DEBUG_STATE.logicalBodyRect,
        rendered: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyRenderRect,
        points: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyCanvasPoints,
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

    // This is the regression that matters: reference-rig anchors are normalised
    // to the live directional body destination, never to the padded source PNG.
    expect(state.coordinateSpace).toBe('live-directional-destination');
    expectNear(state.bodyCrop.x, 0.350);
    expectNear(state.bodyCrop.y, 0.088);
    expectNear(state.bodyCrop.w, 0.297);
    expectNear(state.bodyCrop.h, 0.823);
    expect(state.bodyDest).toEqual({ x:0, y:0, w:1, h:1 });
    expectNear(state.logical.width / state.logical.height, 0.48, 0.001);
    expectNear(state.rendered.x, state.logical.x, 0.01);
    expectNear(state.rendered.y, state.logical.y, 0.01);
    expectNear(state.rendered.width, state.logical.width, 0.01);
    expectNear(state.rendered.height, state.logical.height, 0.01);

    for (const name of ['armourShoulderTopLeft','armourShoulderTopRight','leftFootSole','rightFootSole']) {
        const p = state.points[name];
        expect(p.x).toBeGreaterThanOrEqual(state.rendered.x);
        expect(p.x).toBeLessThanOrEqual(state.rendered.x + state.rendered.width);
        expect(p.y).toBeGreaterThanOrEqual(state.rendered.y);
        expect(p.y).toBeLessThanOrEqual(state.rendered.y + state.rendered.height);
    }
    expect(state.mappingText).toContain('LIVE BODY RENDER SPACE');
    expect(state.mappingText).toContain('bodyCrop: x 0.350');

    // Side view is deliberately only the centre half of the logical body box.
    await page.selectOption('#scenario5-facing-select', 'side');
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.view === 'side' && window.SCENARIO5_ARMOUR_DEBUG_STATE?.rendered === true);
    state = await page.evaluate(() => ({
        bodyCrop: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyCrop,
        bodyDest: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyDest,
        logical: window.SCENARIO5_ARMOUR_DEBUG_STATE.logicalBodyRect,
        rendered: window.SCENARIO5_ARMOUR_DEBUG_STATE.bodyRenderRect,
    }));
    expectNear(state.bodyCrop.x, 0.431);
    expectNear(state.bodyCrop.y, 0.092);
    expect(state.bodyDest).toEqual({ x:0.25, y:0, w:0.5, h:1 });
    expectNear(state.rendered.width, state.logical.width * 0.5, 0.01);
    expectNear(state.rendered.x, state.logical.x + state.logical.width * 0.25, 0.01);

    await page.selectOption('#scenario5-armour-select', 'light');
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.armour === 'light');
    await page.selectOption('#scenario5-facing-select', 'back');
    await page.waitForFunction(() => window.SCENARIO5_ARMOUR_DEBUG_STATE?.view === 'back');
});
