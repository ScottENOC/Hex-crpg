const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

function isDirectionalBody(src) {
    return src.includes('/images/characters/human_female/body_');
}

function isDirectionalHair(src) {
    return src.includes('/images/characters/human_female/hair_');
}

function isLegacyBody(src) {
    return /\/images\/humanfemale\.png(?:[?#]|$)/.test(src);
}

function isLegacyHair(src) {
    return /\/images\/humanfemalehair\.png(?:[?#]|$)/.test(src);
}

function nearDuplicateBodies(bodies) {
    const duplicates = [];
    for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
            const a = bodies[i].dest;
            const b = bodies[j].dest;
            if (!a || !b || !Number.isFinite(a.w) || !Number.isFinite(a.h) || !Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
            const sizeMatch = Math.abs(a.w - b.w) <= Math.max(1, a.w * 0.05)
                && Math.abs(a.h - b.h) <= Math.max(1, a.h * 0.05);
            const closeX = Math.abs(a.x - b.x) <= Math.max(3, a.w * 0.20);
            const closeY = Math.abs(a.y - b.y) <= Math.max(4, a.h * 0.12);
            if (sizeMatch && closeX && closeY) duplicates.push([bodies[i], bodies[j]]);
        }
    }
    return duplicates;
}

test.describe('human female tactical-map render path', () => {
    test('does not double-draw a directional body and never draws legacy female art', async ({ page }) => {
        // Instrument before app code so all final canvas draws remain observable,
        // including drawImage functions captured/bound by renderer wrappers.
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            const nativeClearRect = CanvasRenderingContext2D.prototype.clearRect;
            window.__tacticalFrameId = 0;
            window.__tacticalDrawImageCalls = [];

            CanvasRenderingContext2D.prototype.clearRect = function(...args) {
                if (this === window.mapCtx) window.__tacticalFrameId += 1;
                return nativeClearRect.apply(this, args);
            };

            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) {
                    const src = String(image?.currentSrc || image?.src || '');
                    let dest = null;
                    if (args.length === 8) dest = { x:args[4], y:args[5], w:args[6], h:args[7] };
                    else if (args.length === 4) dest = { x:args[0], y:args[1], w:args[2], h:args[3] };
                    else if (args.length === 2) dest = { x:args[0], y:args[1], w:null, h:null };
                    window.__tacticalDrawImageCalls.push({
                        src,
                        tintedDirectionalHair: image?.__testDirectionalHair === true,
                        dest,
                        frame:window.__tacticalFrameId
                    });
                }
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => {
            const assets = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
            return window.__facingRendererInstalled === true
                && assets?.body?.front?.complete
                && assets.body.front.naturalWidth > 0;
        });

        // Directional hair is now recoloured into an offscreen canvas before
        // the final map draw. Mark canvases returned by the real tint function
        // so this regression test observes the rendered hair layer rather than
        // incorrectly assuming every final draw remains an HTMLImageElement.
        await page.evaluate(() => {
            const tint = window.getRecoloredHairSprite;
            if (typeof tint === 'function' && !tint.__tacticalHairTestMarker) {
                const markedTint = function(...args) {
                    const result = tint.apply(this, args);
                    if (result instanceof HTMLCanvasElement) result.__testDirectionalHair = true;
                    return result;
                };
                markedTint.__tacticalHairTestMarker = true;
                window.getRecoloredHairSprite = markedTint;
            }

            const ctx = window.mapCtx;
            const downstream = ctx.drawImage.bind(ctx);
            window.__outerMapDraws = [];
            ctx.drawImage = function(image, ...args) {
                const src = String(image?.currentSrc || image?.src || '');
                let dest = null;
                if (args.length === 8) dest = { x:args[4], y:args[5], w:args[6], h:args[7] };
                else if (args.length === 4) dest = { x:args[0], y:args[1], w:args[2], h:args[3] };
                if (/humanfemale(?:hair)?\.png(?:[?#]|$)/.test(src)) {
                    window.__outerMapDraws.push({ src, dest, stack:new Error('legacy female draw').stack });
                }
                return downstream(image, ...args);
            };
            window.__tacticalDrawImageCalls.length = 0;
        });

        await page.waitForFunction(() => (window.__tacticalDrawImageCalls || []).some(call =>
            (call.src || '').includes('/images/characters/human_female/body_')));

        const observed = await page.evaluate(() => ({
            calls: window.__tacticalDrawImageCalls.slice(),
            outer: window.__outerMapDraws.slice(),
        }));
        const directionalBodies = observed.calls.filter(call => isDirectionalBody(call.src || ''));
        const latestFrame = Math.max(...directionalBodies.map(call => call.frame));
        const frameCalls = observed.calls.filter(call => call.frame === latestFrame);
        const bodies = frameCalls.filter(call => isDirectionalBody(call.src || ''));
        const hair = frameCalls.filter(call => isDirectionalHair(call.src || '') || call.tintedDirectionalHair);
        const legacyBody = frameCalls.filter(call => isLegacyBody(call.src || ''));
        const legacyHair = frameCalls.filter(call => isLegacyHair(call.src || ''));
        const duplicates = nearDuplicateBodies(bodies);

        console.log('HUMAN_FEMALE_RENDER_INPUTS', JSON.stringify(observed.outer));
        console.log('HUMAN_FEMALE_TACTICAL_FRAME', JSON.stringify({
            latestFrame,
            bodies,
            hairCount:hair.length,
            legacyBodyCount:legacyBody.length,
            legacyHairCount:legacyHair.length,
            duplicatePairs:duplicates,
        }));

        expect(bodies.length).toBeGreaterThan(0);
        expect(hair.length).toBe(bodies.length);
        expect(legacyBody).toHaveLength(0);
        expect(legacyHair).toHaveLength(0);
        expect(duplicates, `near-duplicate body rectangles in frame ${latestFrame}: ${JSON.stringify(duplicates)}`).toHaveLength(0);
    });
});
