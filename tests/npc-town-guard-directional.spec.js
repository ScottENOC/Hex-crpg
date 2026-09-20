const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('directional town guard artwork', () => {
    test('Reddale town guard uses authored front/side/back guard art', async ({ page }) => {
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            window.__guardMapDraws = [];
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) window.__guardMapDraws.push(String(image?.currentSrc || image?.src || ''));
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'male' });
        await page.waitForFunction(() => window.__facingRendererInstalled === true
            && window.DIRECTIONAL_CHARACTER_ASSETS?.npc_town_guard?.body?.average?.front?.naturalWidth > 0);

        const result = await page.evaluate(async () => {
            const guard = window.buildNPC({
                name:'Directional Guard Test', title:'Town Guard', race:'human', gender:'male',
                hex:{ q:window.player.hex.q + 1, r:window.player.hex.r }, classLevels:['fighter'],
                skillPicks:['health'], equipment:[], side:'neutral', factionId:'silverhart_kingdom',
                directionalArtKey:'npc_town_guard'
            });
            window.entities.push(guard);
            const seen = {};
            for (const facing of ['down','right','left','up']) {
                guard.facing = facing;
                window.__guardMapDraws.length = 0;
                window.drawMap();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                seen[facing] = window.__guardMapDraws.filter(src => src.includes('/images/characters/npc_town_guard/body_'));
            }
            return { seen, artKey:guard.directionalArtKey };
        });

        expect(result.artKey).toBe('npc_town_guard');
        expect(result.seen.down.some(src => src.includes('body_front.svg'))).toBe(true);
        expect(result.seen.right.some(src => src.includes('body_side.svg'))).toBe(true);
        expect(result.seen.left.some(src => src.includes('body_side.svg'))).toBe(true);
        expect(result.seen.up.some(src => src.includes('body_back.svg'))).toBe(true);
    });
});
