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
