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

function isFemaleCharacterAsset(src) {
    return isDirectionalBody(src) || isDirectionalHair(src) || isLegacyBody(src) || isLegacyHair(src);
}

test.describe('human female tactical-map render path', () => {
    test('draws one directional body and no legacy body/hair per map frame', async ({ page }) => {
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
                    window.__tacticalDrawImageCalls.push({
                        src,
                        frame: window.__tacticalFrameId,
                        argCount: args.length + 1,
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
                && assets.body.front.naturalWidth > 0
                && assets?.hair?.brown_1?.front?.complete
                && assets.hair.brown_1.front.naturalWidth > 0;
        });

        await page.waitForFunction(() => (window.__tacticalDrawImageCalls || []).some(call => {
            const src = call.src || '';
            return src.includes('/images/characters/human_female/body_')
                || /\/images\/humanfemale\.png(?:[?#]|$)/.test(src);
        }));

        const calls = await page.evaluate(() => window.__tacticalDrawImageCalls.slice());
        const femaleCalls = calls.filter(call => {
            const src = call.src || '';
            return src.includes('/images/characters/human_female/body_')
                || src.includes('/images/characters/human_female/hair_')
                || /\/images\/humanfemale(?:hair)?\.png(?:[?#]|$)/.test(src);
        });
        const latestFrame = Math.max(...femaleCalls.map(call => call.frame));
        const frameSources = femaleCalls.filter(call => call.frame === latestFrame).map(call => call.src);

        const directionalBodies = frameSources.filter(isDirectionalBody);
        const directionalHair = frameSources.filter(isDirectionalHair);
        const legacyBody = frameSources.filter(isLegacyBody);
        const legacyHair = frameSources.filter(isLegacyHair);

        console.log('HUMAN_FEMALE_TACTICAL_FRAME', JSON.stringify({ latestFrame, frameSources }));

        expect(frameSources.some(isFemaleCharacterAsset)).toBe(true);
        expect(directionalBodies, `frame ${latestFrame} sources: ${JSON.stringify(frameSources)}`).toHaveLength(1);
        expect(directionalHair, `frame ${latestFrame} sources: ${JSON.stringify(frameSources)}`).toHaveLength(1);
        expect(legacyBody, `frame ${latestFrame} sources: ${JSON.stringify(frameSources)}`).toHaveLength(0);
        expect(legacyHair, `frame ${latestFrame} sources: ${JSON.stringify(frameSources)}`).toHaveLength(0);
    });
});
