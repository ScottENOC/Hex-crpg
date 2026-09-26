const { test, expect } = require('@playwright/test');

// Focused CI also exercises this without creating a character first.
test('calibrated anchor constants remain symmetric', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__rigDebugLoaded === true);
    await page.waitForFunction(() => window.__humanFemaleReferenceRigCalibrated === true, null, { timeout: 15000 });
    const a = await page.evaluate(() => window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors);
    expect(a.leftFoot.x + a.rightFoot.x).toBeCloseTo(1, 6);
    expect(a.leftHand.x + a.rightHand.x).toBeCloseTo(1, 6);
    expect(a.torsoShoulderLeft.x + a.torsoShoulderRight.x).toBeCloseTo(1, 6);
    expect(a.torsoWaistLeft.x + a.torsoWaistRight.x).toBeCloseTo(1, 6);
    expect(a.torsoHipLeft.x + a.torsoHipRight.x).toBeCloseTo(1, 6);
});