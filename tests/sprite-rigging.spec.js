const { test, expect } = require('@playwright/test');

const REQUIRED_ANCHORS = [
    'scalpCenter','hairAnchor','helmetAnchor','leftHand','rightHand',
    'mainHandGrip','offHandGrip','waistCenter','leftFoot','rightFoot'
];
const TRIM_FIELDS = [
    'originalWidth','originalHeight','trimLeft','trimTop','trimWidth','trimHeight'
];

test.describe('trim-aware anchor sprite rigging', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/spriteRigPreview.html');
        await page.waitForFunction(() => window.HUMAN_FEMALE_REFERENCE_RIGS);
    });

    test('human female front, side and back are independent reference rigs with shared semantic anchors', async ({ page }) => {
        const result = await page.evaluate(({ anchors, trimFields }) => {
            const rigs = window.HUMAN_FEMALE_REFERENCE_RIGS;
            return {
                views: Object.keys(rigs),
                front: rigs.front,
                side: rigs.side,
                back: rigs.back,
                sameFrontSide: rigs.front === rigs.side,
                sameFrontBack: rigs.front === rigs.back,
                anchorNames: Object.fromEntries(Object.entries(rigs).map(([k,v]) => [k, Object.keys(v.anchors)])),
                trimShape: Object.fromEntries(Object.entries(rigs).map(([k,v]) => [k, trimFields.map(f => Object.prototype.hasOwnProperty.call(v.sprite, f))])),
                points: anchors.map(name => ({
                    name,
                    front: rigs.front.anchors[name],
                    side: rigs.side.anchors[name],
                    back: rigs.back.anchors[name],
                })),
            };
        }, { anchors:REQUIRED_ANCHORS, trimFields:TRIM_FIELDS });

        expect(result.views).toEqual(['front','side','back']);
        expect(result.sameFrontSide).toBe(false);
        expect(result.sameFrontBack).toBe(false);
        for (const view of result.views) {
            for (const name of REQUIRED_ANCHORS) expect(result.anchorNames[view]).toContain(name);
            expect(result.trimShape[view].every(Boolean)).toBe(true);
        }
        // Direction data is authored, not a single coordinate table reused for every view.
        const mainHand = result.points.find(p => p.name === 'mainHandGrip');
        expect(mainHand.front).not.toEqual(mainHand.side);
        expect(mainHand.front).not.toEqual(mainHand.back);
    });

    test('trim compensation preserves the original logical canvas placement', async ({ page }) => {
        const result = await page.evaluate(() => {
            const metadata = {
                originalWidth:100, originalHeight:100,
                trimLeft:25, trimTop:10, trimWidth:20, trimHeight:30,
            };
            const source = document.createElement('canvas');
            source.width = 20; source.height = 30;
            const sctx = source.getContext('2d');
            sctx.fillStyle = '#fff'; sctx.fillRect(0,0,20,30);
            const target = document.createElement('canvas');
            target.width = 120; target.height = 120;
            const ctx = target.getContext('2d');
            const dest = window.drawTrimAwareSprite(ctx, source, metadata, 0, 0, 100, 100);
            function alpha(x,y){ return ctx.getImageData(x,y,1,1).data[3]; }
            return {
                dest,
                before:alpha(24,10), inside:alpha(25,10),
                last:alpha(44,39), after:alpha(45,40),
            };
        });
        expect(result.dest).toEqual({ x:25, y:10, width:20, height:30 });
        expect(result.before).toBe(0);
        expect(result.inside).toBe(255);
        expect(result.last).toBe(255);
        expect(result.after).toBe(0);
    });

    test('production crop remapping preserves authored placement after a physical trim', async ({ page }) => {
        const args = await page.evaluate(() => {
            const image = document.createElement('canvas');
            image.width = 40; image.height = 50;
            const metadata = {
                originalWidth:100, originalHeight:100,
                trimLeft:20, trimTop:10, trimWidth:40, trimHeight:50,
            };
            let captured = null;
            const nativeDraw = (...drawArgs) => { captured = drawArgs.slice(1); };
            const handled = window.drawTrimAwareCroppedSprite(
                nativeDraw,
                image,
                { x:0.10, y:0.00, w:0.60, h:0.80 },
                { x:0.20, y:0.10, w:0.50, h:0.70 },
                { left:10, top:20, width:200, height:100 },
                metadata
            );
            return { handled, captured };
        });

        expect(args.handled).toBe(true);
        expect(args.captured[0]).toBeCloseTo(0, 6);
        expect(args.captured[1]).toBeCloseTo(0, 6);
        expect(args.captured[2]).toBeCloseTo(40, 6);
        expect(args.captured[3]).toBeCloseTo(50, 6);
        expect(args.captured[4]).toBeCloseTo(66.6666667, 5);
        expect(args.captured[5]).toBeCloseTo(38.75, 5);
        expect(args.captured[6]).toBeCloseTo(66.6666667, 5);
        expect(args.captured[7]).toBeCloseTo(43.75, 5);
    });

    test('registered untrimmed production asset keeps the legacy crop rectangle exactly', async ({ page }) => {
        const result = await page.evaluate(() => {
            const image = document.createElement('canvas');
            image.width = 200; image.height = 300;
            image.src = 'images/characters/human_female/body_front.png';
            let captured = null;
            const handled = window.drawTrimAwareCroppedSprite(
                (...drawArgs) => { captured = drawArgs.slice(1); },
                image,
                { x:0.350, y:0.088, w:0.297, h:0.823 },
                { x:0, y:0, w:1, h:1 },
                { left:7, top:9, width:50, height:75 }
            );
            return { handled, captured };
        });
        expect(result.handled).toBe(true);
        expect(result.captured[0]).toBeCloseTo(70, 6);
        expect(result.captured[1]).toBeCloseTo(26.4, 6);
        expect(result.captured[2]).toBeCloseTo(59.4, 6);
        expect(result.captured[3]).toBeCloseTo(246.9, 6);
        expect(result.captured[4]).toBeCloseTo(7, 6);
        expect(result.captured[5]).toBeCloseTo(9, 6);
        expect(result.captured[6]).toBeCloseTo(50, 6);
        expect(result.captured[7]).toBeCloseTo(75, 6);
    });

    test('untrimmed metadata resolves from the current image without changing destination', async ({ page }) => {
        const result = await page.evaluate(() => {
            const img = document.createElement('canvas'); img.width=200; img.height=300;
            const meta = {
                originalWidth:null, originalHeight:null,
                trimLeft:0, trimTop:0, trimWidth:null, trimHeight:null,
            };
            return {
                resolved: window.resolveSpriteTrimMetadata(meta, img),
                dest: window.computeTrimAwareDestination(meta, {x:7,y:9,width:50,height:75}, img),
            };
        });
        expect(result.resolved).toEqual({ originalWidth:200, originalHeight:300, trimLeft:0, trimTop:0, trimWidth:200, trimHeight:300 });
        expect(result.dest).toEqual({ x:7, y:9, width:50, height:75 });
    });

    test('preview renders all four validation combinations for all three authored views', async ({ page }) => {
        await page.waitForFunction(() => document.body.dataset.previewReady === 'true');
        const cells = await page.locator('canvas[data-mode][data-view]').evaluateAll(nodes =>
            nodes.map(n => ({ mode:n.dataset.mode, view:n.dataset.view }))
        );
        expect(cells).toHaveLength(12);
        for (const mode of ['base','hair','helmet','gear']) {
            for (const view of ['front','side','back']) expect(cells).toContainEqual({mode,view});
        }
    });
});

test('live directional renderer loads trim-aware runtime support', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.facingToSpriteView && window.drawTrimAwareCroppedSprite);
    const state = await page.evaluate(() => ({
        facing: typeof window.facingToSpriteView,
        trimCrop: typeof window.drawTrimAwareCroppedSprite,
        rig: !!window.getSpriteReferenceRig?.('human_female', 'front'),
        registeredBody: Object.prototype.hasOwnProperty.call(
            window.SPRITE_TRIM_METADATA_BY_PATH || {},
            'images/characters/human_female/body_front.png'
        ),
    }));
    expect(state).toEqual({ facing:'function', trimCrop:'function', rig:true, registeredBody:true });
});