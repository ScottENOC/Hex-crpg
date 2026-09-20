const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('directional town guard artwork', () => {
    test('Reddale town guard uses authored art for all four facings', async ({ page }) => {
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            window.__guardMapDraws = [];
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) window.__guardMapDraws.push(String(image?.currentSrc || image?.src || ''));
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'male' });
        await page.waitForFunction(() => window.gameVisuals?.npcTownGuardFront?.naturalWidth > 0
            && window.gameVisuals?.npcTownGuardBack?.naturalWidth > 0
            && window.gameVisuals?.npcTownGuardRight?.naturalWidth > 0
            && window.gameVisuals?.npcTownGuardLeft?.naturalWidth > 0);

        const result = await page.evaluate(async () => {
            const guard = window.buildNPC({
                name:'Directional Guard Test', title:'Town Guard', race:'human', gender:'male',
                hex:{ q:window.player.hex.q + 1, r:window.player.hex.r }, classLevels:['fighter'],
                skillPicks:['health'], equipment:['spear', 'light_armor'], side:'neutral',
                factionId:'silverhart_kingdom'
            });
            window.entities.push(guard);
            const seen = {};
            const customImages = {};
            for (const facing of ['down','right','left','up']) {
                guard.facing = facing;
                window.syncDirectionalNpcArt(guard);
                customImages[facing] = guard.customImage;
                window.__guardMapDraws.length = 0;
                window.drawMap();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                seen[facing] = window.__guardMapDraws.filter(src => src.includes('/images/characters/npc_town_guard/body_'));
            }
            return { seen, customImages, artKey:guard.directionalArtKey, weapon:guard.equipped.weapon };
        });

        expect(result.artKey).toBe('npc_town_guard');
        expect(result.weapon).toBe('spear'); // gameplay gear remains equipped even though art is baked in
        expect(result.customImages).toEqual({
            down:'npcTownGuardFront', right:'npcTownGuardRight', left:'npcTownGuardLeft', up:'npcTownGuardBack'
        });
        expect(result.seen.down.some(src => src.includes('body_front.svg'))).toBe(true);
        expect(result.seen.right.some(src => src.includes('body_side.svg'))).toBe(true);
        expect(result.seen.left.some(src => src.includes('body_side_left.svg'))).toBe(true);
        expect(result.seen.up.some(src => src.includes('body_back.svg'))).toBe(true);
    });
});
