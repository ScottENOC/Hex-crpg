const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human female directional armour transform', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__directionalEquipmentFitTuningApplied === true);
    });

    test('derives armour silhouette from canonical torso anchors', async ({ page }) => {
        const result = await page.evaluate(() => {
            const views = {};
            for (const view of ['front', 'side', 'back']) {
                const body = window.HUMAN_FEMALE_REFERENCE_RIGS[view];
                const derived = window.deriveHumanFemaleArmourRig(view);
                views[view] = { anchors: body.anchors, derived };
            }
            return {
                views,
                fit: window.HUMAN_FEMALE_EQUIPMENT_FIT,
            };
        });

        expect(result.fit.armourSource).toBe('body-torso-anchors');
        expect(result.fit.armourClearanceX).toBeCloseTo(0.32, 8);
        expect(result.fit.armour.wMult).toBeCloseTo(1.58, 8);

        // Vertical coverage is independent at the two ends: topShift raises
        // the start substantially versus the previous 0.28 value, while
        // bottomDrop extends only the lower edge.
        expect(result.fit.armour.topShift).toBeCloseTo(0.10, 8);
        expect(result.fit.armour.bottomDrop).toBeCloseTo(0.08, 8);
        expect(result.fit.armourVertical).toEqual({ topShift:0.10, bottomDrop:0.08 });

        for (const view of ['front', 'side', 'back']) {
            const { anchors, derived } = result.views[view];
            const clearance = result.fit.armourClearanceX;

            const shoulderLeft = Math.max(0, Math.min(anchors.torsoShoulderLeft.x, anchors.torsoShoulderRight.x) - clearance);
            const shoulderRight = Math.min(1, Math.max(anchors.torsoShoulderLeft.x, anchors.torsoShoulderRight.x) + clearance);
            const waistLeft = Math.max(0, Math.min(anchors.torsoWaistLeft.x, anchors.torsoWaistRight.x) - clearance);
            const waistRight = Math.min(1, Math.max(anchors.torsoWaistLeft.x, anchors.torsoWaistRight.x) + clearance);
            const hipLeft = Math.max(0, Math.min(anchors.torsoHipLeft.x, anchors.torsoHipRight.x) - clearance);
            const hipRight = Math.min(1, Math.max(anchors.torsoHipLeft.x, anchors.torsoHipRight.x) + clearance);

            expect(derived.shoulderL).toBeCloseTo(shoulderLeft, 8);
            expect(derived.shoulderR).toBeCloseTo(shoulderRight, 8);
            expect(derived.waistL).toBeCloseTo(waistLeft, 8);
            expect(derived.waistR).toBeCloseTo(waistRight, 8);
            expect(derived.hemL).toBeCloseTo(hipLeft, 8);
            expect(derived.hemR).toBeCloseTo(hipRight, 8);
            expect(derived.waistY).toBeCloseTo((anchors.torsoWaistLeft.y + anchors.torsoWaistRight.y) / 2, 8);
            expect(derived.source).toBe('body-torso-anchors');

            expect(result.fit.armourViews[view]).toEqual(derived);
        }
    });

    test('front and back torso geometry remain symmetric', async ({ page }) => {
        const rigs = await page.evaluate(() => ({
            front: window.HUMAN_FEMALE_REFERENCE_RIGS.front.anchors,
            back: window.HUMAN_FEMALE_REFERENCE_RIGS.back.anchors,
        }));

        for (const view of ['front', 'back']) {
            const a = rigs[view];
            expect(a.torsoShoulderLeft.x + a.torsoShoulderRight.x).toBeCloseTo(1, 8);
            expect(a.torsoWaistLeft.x + a.torsoWaistRight.x).toBeCloseTo(1, 8);
            expect(a.torsoHipLeft.x + a.torsoHipRight.x).toBeCloseTo(1, 8);
        }
    });

    test('keeps strip deformation axis-aligned for every facing', async ({ page }) => {
        const result = await page.evaluate(() => {
            const facings = { front:'down', side:'right', back:'up' };
            const out = {};

            for (const [view, facing] of Object.entries(facings)) {
                const rig = window.getArmourRigForFacing('human_female', facing);
                const transforms = [];
                const draws = [];
                const ctx = { transform(...args) { transforms.push(args); } };
                const image = { width:100, height:200 };
                window.drawStripDeformedArmour(ctx, (...args) => draws.push(args), image, rig, 10, 20, 120, 240);
                out[view] = { rig:{ ...rig }, transforms, draws };
            }
            return out;
        });

        for (const view of ['front', 'side', 'back']) {
            const { transforms, draws } = result[view];
            expect(transforms).toHaveLength(0);
            expect(draws).toHaveLength(12);
            for (const draw of draws) {
                expect(draw).toHaveLength(9);
                expect(draw[7]).toBeGreaterThan(0);
                expect(draw[8]).toBeGreaterThan(0);
            }
        }
    });

    test('left and right share the same authored side body fit', async ({ page }) => {
        const rigs = await page.evaluate(() => ({
            left: window.getArmourRigForFacing('human_female', 'left'),
            right: window.getArmourRigForFacing('human_female', 'right'),
        }));
        expect(rigs.left).toEqual(rigs.right);
    });
});
