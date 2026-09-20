const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('directional standard orc artwork', () => {
    test('ordinary orcs switch authored art for all four facings', async ({ page }) => {
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            window.__orcMapDraws = [];
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) window.__orcMapDraws.push(String(image?.currentSrc || image?.src || ''));
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.gameVisuals?.npcOrcFront?.naturalWidth > 0
            && window.gameVisuals?.npcOrcBack?.naturalWidth > 0
            && window.gameVisuals?.npcOrcRight?.naturalWidth > 0
            && window.gameVisuals?.npcOrcLeft?.naturalWidth > 0);

        const result = await page.evaluate(async () => {
            const orc = window.createMonster('orc', { q:window.player.hex.q + 1, r:window.player.hex.r }, null, [], 'enemy');
            window.entities.push(orc);
            await new Promise(resolve => setTimeout(resolve, 130));

            const seen = {};
            const customImages = {};
            for (const facing of ['down','right','left','up']) {
                orc.facing = facing;
                window.syncDirectionalNpcArt(orc);
                customImages[facing] = orc.customImage;
                window.__orcMapDraws.length = 0;
                window.drawMap();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                seen[facing] = window.__orcMapDraws.filter(src => src.includes('/images/characters/npc_orc/body_'));
            }
            return { seen, customImages, artKey:orc.directionalArtKey, name:orc.name };
        });

        expect(result.name).toBe('Orc');
        expect(result.artKey).toBe('npc_orc');
        expect(result.customImages).toEqual({
            down:'npcOrcFront', right:'npcOrcRight', left:'npcOrcLeft', up:'npcOrcBack'
        });
        expect(result.seen.down.some(src => src.includes('body_front.svg'))).toBe(true);
        expect(result.seen.right.some(src => src.includes('body_side.svg'))).toBe(true);
        expect(result.seen.left.some(src => src.includes('body_side_left.svg'))).toBe(true);
        expect(result.seen.up.some(src => src.includes('body_back.svg'))).toBe(true);
    });

    test('renamed orc variants keep their existing distinct rendering path', async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        const result = await page.evaluate(async () => {
            const named = window.createMonster('orc', { q:window.player.hex.q + 1, r:window.player.hex.r }, null, [], 'enemy');
            named.name = 'Named Orc Test';
            named.spriteBase = 'orc';
            window.entities.push(named);
            await new Promise(resolve => setTimeout(resolve, 130));
            return { artKey:named.directionalArtKey || null, customImage:named.customImage || null };
        });
        expect(result.artKey).toBeNull();
        expect(result.customImage).toBeNull();
    });
});
