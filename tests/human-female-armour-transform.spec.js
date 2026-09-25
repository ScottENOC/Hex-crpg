const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human female directional armour transform', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__directionalEquipmentFitTuningApplied === true);
    });

    test('uses a rectangular rig so armour is translated/scaled without rotation or shear', async ({ page }) => {
        const result = await page.evaluate(() => {
            const rig = window.ARMOUR_RIGS.human_female;
            const transforms = [];
            const ctx = {
                save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
                closePath() {}, clip() {},
                transform(a, b, c, d, e, f) { transforms.push({ a, b, c, d, e, f }); },
            };
            const image = { width:100, height:200 };
            window.drawWarpedArmour(ctx, () => {}, image, rig, 10, 20, 120, 240);
            return { rig:{ ...rig }, transforms };
        });

        expect(result.rig).toMatchObject({
            shoulderL:0, shoulderR:1,
            waistL:0, waistR:1,
            hemL:0, hemR:1,
        });
        expect(result.transforms).toHaveLength(4);
        for (const matrix of result.transforms) {
            // Canvas affine b/c terms are the rotation/shear components.
            expect(matrix.b).toBeCloseTo(0, 8);
            expect(matrix.c).toBeCloseTo(0, 8);
            expect(matrix.a).toBeGreaterThan(0);
            expect(matrix.d).toBeGreaterThan(0);
        }
    });
});
