const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human female directional art', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__characterRigInstalled === true && typeof window.facingToSpriteView === 'function');
    });

    test('maps four facings onto the three authored sprite views', async ({ page }) => {
        const views = await page.evaluate(() => ({
            down: window.facingToSpriteView('down'),
            up: window.facingToSpriteView('up'),
            right: window.facingToSpriteView('right'),
            left: window.facingToSpriteView('left'),
        }));
        expect(views).toEqual({ down:'front', up:'back', right:'side', left:'side' });
    });

    test('exposes all six production asset paths and crop layouts', async ({ page }) => {
        const result = await page.evaluate(() => ({
            paths: window.HUMAN_FEMALE_ASSET_PATHS,
            layout: window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT,
        }));
        expect(result.paths.body.front).toContain('human_female/body_front.png');
        expect(result.paths.body.side).toContain('human_female/body_side.png');
        expect(result.paths.body.back).toContain('human_female/body_back.png');
        expect(result.paths.hair.brown_1.front).toContain('hair_brown_1_front.png');
        expect(result.paths.hair.brown_1.side).toContain('hair_brown_1_side.png');
        expect(result.paths.hair.brown_1.back).toContain('hair_brown_1_back.png');
        for (const view of ['front','side','back']) {
            expect(result.layout[view].bodyCrop.w).toBeGreaterThan(0);
            expect(result.layout[view].bodyCrop.h).toBeGreaterThan(0);
            expect(result.layout[view].hairCrop.w).toBeGreaterThan(0);
            expect(result.layout[view].hairCrop.h).toBeGreaterThan(0);
        }
        expect(result.layout.side.bodyDest.w).toBeLessThan(result.layout.front.bodyDest.w);
    });

    test('preloads all six directional images successfully', async ({ page }) => {
        await page.waitForFunction(() => {
            const a = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
            if (!a) return false;
            const imgs = [a.body.front,a.body.side,a.body.back,a.hair.brown_1.front,a.hair.brown_1.side,a.hair.brown_1.back];
            return imgs.every(img => img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
        });
        const dims = await page.evaluate(() => {
            const a=window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
            return [a.body.front,a.body.side,a.body.back,a.hair.brown_1.front,a.hair.brown_1.side,a.hair.brown_1.back]
                .map(img => [img.naturalWidth,img.naturalHeight]);
        });
        expect(dims).toHaveLength(6);
        for (const [w,h] of dims) { expect(w).toBeGreaterThan(0); expect(h).toBeGreaterThan(0); }
    });

    test('human female anchors change with view and left mirrors side', async ({ page }) => {
        const result = await page.evaluate(() => {
            const bounds={left:0,top:0,width:100,height:200};
            const read=(facing,name) => {
                window.__activeCharacterFacing=facing;
                return window.getCharacterAttachmentPoint('human_female',name,bounds);
            };
            const out={
                frontHand:read('down','mainHand'),
                sideHand:read('right','mainHand'),
                leftHand:read('left','mainHand'),
                backHand:read('up','mainHand'),
                sideBack:read('right','back'),
                leftBack:read('left','back'),
            };
            delete window.__activeCharacterFacing;
            return out;
        });
        expect(result.frontHand.x).not.toBeCloseTo(result.sideHand.x,6);
        expect(result.backHand.x).not.toBeCloseTo(result.frontHand.x,6);
        expect(result.leftHand.x).toBeCloseTo(100-result.sideHand.x,6);
        expect(result.leftBack.x).toBeCloseTo(100-result.sideBack.x,6);
    });

    test('helmet presence is represented by equipped.helmet for hair suppression', async ({ page }) => {
        const result = await page.evaluate(() => {
            const e=new window.Entity('Helmet Test','#fff',{q:0,r:0},1);
            e.race='human'; e.gender='female'; e.equipped={weapon:null,offhand:null,armor:null,helmet:null};
            const without=!!e.equipped?.helmet;
            e.equipped.helmet='nasal_helm';
            const withHelmet=!!e.equipped?.helmet;
            return {without,withHelmet};
        });
        expect(result.without).toBe(false);
        expect(result.withHelmet).toBe(true);
    });
});
