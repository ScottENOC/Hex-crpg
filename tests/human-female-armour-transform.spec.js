const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human female directional armour transform', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__directionalEquipmentFitTuningApplied === true);
    });

    test('keeps deformation symmetric and axis-aligned for every facing', async ({ page }) => {
        const result = await page.evaluate(() => {
            const facings = { front:'down', side:'right', back:'up' };
            const out = {};

            for (const [view, facing] of Object.entries(facings)) {
                const rig = window.getArmourRigForFacing('human_female', facing);
                const transforms = [];
                const draws = [];
                const ctx = {
                    transform(...args) { transforms.push(args); },
                };
                const image = { width:100, height:200 };
                window.drawStripDeformedArmour(ctx, (...args) => draws.push(args), image, rig, 10, 20, 120, 240);
                out[view] = { rig:{ ...rig }, transforms, draws };
            }
            return {
                views: out,
                fit: window.HUMAN_FEMALE_EQUIPMENT_FIT.armour,
            };
        });

        expect(result.fit.wMult).toBeGreaterThanOrEqual(1.5);
        expect(result.fit.topShift).toBeLessThanOrEqual(0.30);

        for (const view of ['front', 'side', 'back']) {
            const { rig, transforms, draws } = result.views[view];

            // The armour art and body fit are symmetric around their centreline.
            expect(rig.shoulderL + rig.shoulderR).toBeCloseTo(1, 8);
            expect(rig.waistL + rig.waistR).toBeCloseTo(1, 8);
            expect(rig.hemL + rig.hemR).toBeCloseTo(1, 8);

            // Strip deformation must never invoke a canvas affine transform.
            expect(transforms).toHaveLength(0);
            expect(draws).toHaveLength(12);

            // Every strip is drawn with the 9-argument drawImage crop form and
            // remains a positive-width, positive-height axis-aligned rectangle.
            for (const draw of draws) {
                expect(draw).toHaveLength(9);
                expect(draw[7]).toBeGreaterThan(0);
                expect(draw[8]).toBeGreaterThan(0);
            }
        }
    });

    test('left and right share the same centred side fit', async ({ page }) => {
        const rigs = await page.evaluate(() => ({
            left: window.getArmourRigForFacing('human_female', 'left'),
            right: window.getArmourRigForFacing('human_female', 'right'),
        }));
        expect(rigs.left).toEqual(rigs.right);
        expect(rigs.left.shoulderL + rigs.left.shoulderR).toBeCloseTo(1, 8);
        expect(rigs.left.waistL + rigs.left.waistR).toBeCloseTo(1, 8);
        expect(rigs.left.hemL + rigs.left.hemR).toBeCloseTo(1, 8);
    });
});
