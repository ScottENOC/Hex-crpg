const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

function isDirectionalBody(src) {
    return src.includes('/images/characters/human_female/body_');
}

function isDirectionalHair(src) {
    return src.includes('/images/characters/human_female/hair_');
}

test.describe('human female tactical-map render path', () => {
    test('draws one directional body and no legacy body/hair in a fresh browser', async ({ page }) => {
        // Instrument the canvas prototype before any app code loads so drawImage
        // functions captured/bound by renderer wrappers remain observable here.
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            window.__tacticalDrawImageCalls = [];
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) {
                    const src = String(image?.currentSrc || image?.src || '');
                    window.__tacticalDrawImageCalls.push({ src, argCount: args.length + 1 });
                }
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => {
            const assets = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
            return window.__facingRendererInstalled === true
                && typeof window.renderEntities === 'function'
                && assets?.body?.front?.complete
                && assets.body.front.naturalWidth > 0
                && assets?.hair?.brown_1?.front?.complete
                && assets.hair.brown_1.front.naturalWidth > 0;
        });

        const calls = await page.evaluate(() => {
            const player = (window.entities || []).find(e => e?.isPlayer) || (window.entities || [])[0];
            if (!player) throw new Error('No player entity available for tactical render test');

            player.race = 'human';
            player.gender = 'female';
            player.facing = 'down';
            player.hairStyle = 'brown_1';
            player.equipped = player.equipped || {};
            player.equipped.helmet = null;

            const entities = window.entities;
            const aliveStates = entities.map(e => e?.alive);
            // Keep the player as the only live drawable entity for this synchronous render.
            for (const e of entities) if (e && e !== player) e.alive = false;

            window.__tacticalDrawImageCalls.length = 0;
            try {
                window.renderEntities();
                return window.__tacticalDrawImageCalls.slice();
            } finally {
                entities.forEach((e, i) => { if (e) e.alive = aliveStates[i]; });
            }
        });

        const sources = calls.map(call => call.src).filter(Boolean);
        const directionalBodies = sources.filter(isDirectionalBody);
        const directionalHair = sources.filter(isDirectionalHair);
        const legacyBody = sources.filter(src => /\/images\/humanfemale\.png(?:[?#]|$)/.test(src));
        const legacyHair = sources.filter(src => /\/images\/humanfemalehair\.png(?:[?#]|$)/.test(src));

        expect(directionalBodies, `directional body draws: ${JSON.stringify(directionalBodies)}`).toHaveLength(1);
        expect(directionalBodies[0]).toContain('/images/characters/human_female/body_front.png');
        expect(directionalHair, `directional hair draws: ${JSON.stringify(directionalHair)}`).toHaveLength(1);
        expect(directionalHair[0]).toContain('/images/characters/human_female/hair_brown_1_front.png');
        expect(legacyBody, `legacy body draws: ${JSON.stringify(legacyBody)}`).toHaveLength(0);
        expect(legacyHair, `legacy hair draws: ${JSON.stringify(legacyHair)}`).toHaveLength(0);
    });
});
