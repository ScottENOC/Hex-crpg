const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human male tactical-map render path', () => {
    test('replaces the legacy male body with the directional male artwork', async ({ page }) => {
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            window.__maleMapDraws = [];
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) {
                    window.__maleMapDraws.push(String(image?.currentSrc || image?.src || ''));
                }
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'male' });
        await page.waitForFunction(() => window.__facingRendererInstalled === true
            && window.DIRECTIONAL_CHARACTER_ASSETS?.human_male?.body?.average?.front?.naturalWidth > 0);
        await page.evaluate(() => { window.__maleMapDraws.length = 0; window.drawMap(); });
        await page.waitForFunction(() => window.__maleMapDraws.some(src => src.includes('/images/characters/human_male/body_')));

        const result = await page.evaluate(() => ({
            draws:window.__maleMapDraws.slice(),
            facingSrc:document.querySelector('script[data-facing-system]')?.src || '',
            runtimeBuild:window.PRESENTATION_BUILD,
        }));
        const draws = result.draws;
        expect(draws.some(src => src.includes('/images/characters/human_male/body_'))).toBe(true);
        expect(draws.some(src => /\/images\/humanmale\.png(?:[?#]|$)/.test(src))).toBe(false);
        expect(new URL(result.facingSrc).searchParams.get('build')).toBe(result.runtimeBuild);

        const views = await page.evaluate(async () => {
            const player = window.entities.find(e => e.side === 'player' && e.race === 'human' && e.gender === 'male');
            const seen = {};
            for (const facing of ['down', 'right', 'up']) {
                player.facing = facing;
                window.__maleMapDraws.length = 0;
                window.drawMap();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                seen[facing] = window.__maleMapDraws.filter(src => src.includes('/images/characters/human_male/body_'));
            }
            return seen;
        });
        expect(views.down.some(src => src.includes('body_front.png'))).toBe(true);
        expect(views.right.some(src => src.includes('body_side.png'))).toBe(true);
        expect(views.up.some(src => src.includes('body_back.png'))).toBe(true);
    });
});
