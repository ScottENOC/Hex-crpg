const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human female directional armour transform', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__directionalEquipmentFitTuningApplied === true);
    });

    test('uses distinct, gently deformed front side and back armour rigs', async ({ page }) => {
        const result = await page.evaluate(() => {
            const facings = { front:'down', side:'right', back:'up' };
            const out = {};

            for (const [view, facing] of Object.entries(facings)) {
                const rig = window.getArmourRigForFacing('human_female', facing);
                const transforms = [];
                const ctx = {
                    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
                    closePath() {}, clip() {},
                    transform(a, b, c, d, e, f) { transforms.push({ a, b, c, d, e, f }); },
                };
                const image = { width:100, height:200 };
                window.drawWarpedArmour(ctx, () => {}, image, rig, 10, 20, 120, 240);
                out[view] = { rig:{ ...rig }, transforms };
            }
            return out;
        });

        expect(result.front.rig).not.toEqual(result.side.rig);
        expect(result.front.rig).not.toEqual(result.back.rig);

        for (const view of ['front', 'side', 'back']) {
            const { rig, transforms } = result[view];

            // Stay close to a rectangle: enough taper/lean to fit the authored
            // body view, not enough to visibly twist plates or invert triangles.
            expect(rig.shoulderL).toBeGreaterThanOrEqual(0);
            expect(rig.shoulderR).toBeLessThanOrEqual(1);
            expect(rig.waistL).toBeLessThan(0.20);
            expect(rig.waistR).toBeGreaterThan(0.80);
            expect(rig.hemL).toBeLessThan(0.16);
            expect(rig.hemR).toBeGreaterThan(0.84);
            expect(rig.shoulderL).toBeLessThan(rig.shoulderR);
            expect(rig.waistL).toBeLessThan(rig.waistR);
            expect(rig.hemL).toBeLessThan(rig.hemR);

            expect(transforms).toHaveLength(4);
            for (const matrix of transforms) {
                // Horizontal mesh bands mean no vertical-on-X skew. Allow a
                // small X-on-Y component for taper/lean, but cap it tightly.
                expect(Math.abs(matrix.b)).toBeLessThan(1e-8);
                expect(Math.abs(matrix.c)).toBeLessThan(0.12);
                expect(matrix.a).toBeGreaterThan(0);
                expect(matrix.d).toBeGreaterThan(0);
                expect(matrix.a * matrix.d - matrix.b * matrix.c).toBeGreaterThan(0);
            }
        }
    });

    test('left and right share the authored side fit rather than mirroring the mesh twice', async ({ page }) => {
        const rigs = await page.evaluate(() => ({
            left: window.getArmourRigForFacing('human_female', 'left'),
            right: window.getArmourRigForFacing('human_female', 'right'),
        }));
        expect(rigs.left).toEqual(rigs.right);
    });
});
