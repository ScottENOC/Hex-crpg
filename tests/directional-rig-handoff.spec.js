// Regression for the live directional body/equipment coordinate handoff.
const { test, expect } = require('@playwright/test');

test('human female live rig publishes the actual directional body rectangle', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.computeHumanFemaleDirectionalBodyBounds === 'function');

    const result = await page.evaluate(() => {
        const bounds = window.computeHumanFemaleDirectionalBodyBounds(100, 200, 160, 192);
        const fakeEntity = { race:'human', gender:'female', facing:'down' };
        const record = window.publishHumanFemaleDirectionalBodyBounds(fakeEntity, 'down', bounds);
        return {
            bounds,
            record: {
                left:record.left,
                top:record.top,
                width:record.width,
                height:record.height,
                view:record.view,
                source:record.source,
            },
            global: {
                left:window.__humanFemaleLastBodyDraw.left,
                width:window.__humanFemaleLastBodyDraw.width,
                source:window.__humanFemaleLastBodyDraw.source,
            },
            installed:window.__directionalRigHandoffInstalled,
        };
    });

    expect(result.bounds.width).toBeCloseTo(92.16, 5); // 192 * 0.48
    expect(result.bounds.height).toBe(192);
    expect(result.bounds.left).toBeCloseTo(133.92, 5); // centred inside 100..260
    expect(result.bounds.top).toBe(200);
    expect(result.record).toMatchObject({
        left:result.bounds.left,
        top:200,
        width:result.bounds.width,
        height:192,
        view:'front',
        source:'directional-rig-handoff',
    });
    expect(result.global.source).toBe('directional-rig-handoff');
    expect(result.global.left).toBeCloseTo(133.92, 5);
    expect(result.global.width).toBeCloseTo(92.16, 5);
});

test('live rig facing maps to the same authored view names as equipment fitting', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.publishHumanFemaleDirectionalBodyBounds === 'function');

    const views = await page.evaluate(() => {
        const entity = { race:'human', gender:'female' };
        const bounds = { left:10, top:20, width:48, height:100 };
        return Object.fromEntries(['down','up','left','right'].map(facing => [
            facing,
            window.publishHumanFemaleDirectionalBodyBounds(entity, facing, bounds).view,
        ]));
    });

    expect(views).toEqual({ down:'front', up:'back', left:'side', right:'side' });
});
