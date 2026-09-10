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

function destinationFromCall(args) {
    if (args.length === 8) return { x:args[4], y:args[5], w:args[6], h:args[7] };
    if (args.length === 4) return { x:args[0], y:args[1], w:args[2], h:args[3] };
    if (args.length === 2) return { x:args[0], y:args[1], w:null, h:null };
    return null;
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
        // Instrument before app code. Each map clear starts a new observable frame;
        // drawImage calls captured/bound by renderer wrappers still pass through here.
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
                    window.__tacticalDrawImageCalls.push({ src, dest, frame:window.__tacticalFrameId });
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

        await page.waitForFunction(() => (window.__tacticalDrawImageCalls || []).some(call =>
            (call.src || '').includes('/images/characters/human_female/body_')));

        const calls = await page.evaluate(() => window.__tacticalDrawImageCalls.slice());
        const directionalBodies = calls.filter(call => isDirectionalBody(call.src || ''));
        const latestFrame = Math.max(...directionalBodies.map(call => call.frame));
        const frameCalls = calls.filter(call => call.frame === latestFrame);
        const bodies = frameCalls.filter(call => isDirectionalBody(call.src || ''));
        const hair = frameCalls.filter(call => isDirectionalHair(call.src || ''));
        const legacyBody = frameCalls.filter(call => isLegacyBody(call.src || ''));
        const legacyHair = frameCalls.filter(call => isLegacyHair(call.src || ''));
        const duplicates = nearDuplicateBodies(bodies);

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
