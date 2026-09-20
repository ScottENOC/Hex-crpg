const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('directional standard goblin artwork', () => {
    test('ordinary goblins switch authored art for all four facings', async ({ page }) => {
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            window.__goblinMapDraws = [];
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) window.__goblinMapDraws.push(String(image?.currentSrc || image?.src || ''));
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.gameVisuals?.npcGoblinFront?.naturalWidth > 0
            && window.gameVisuals?.npcGoblinBack?.naturalWidth > 0
            && window.gameVisuals?.npcGoblinRight?.naturalWidth > 0
            && window.gameVisuals?.npcGoblinLeft?.naturalWidth > 0);

        const result = await page.evaluate(async () => {
            const goblin = window.createMonster('goblin', { q:window.player.hex.q + 1, r:window.player.hex.r }, null, [], 'enemy');
            window.entities.push(goblin);
            await new Promise(resolve => setTimeout(resolve, 130));

            const seen = {};
            const customImages = {};
            for (const facing of ['down','right','left','up']) {
                goblin.facing = facing;
                window.syncDirectionalNpcArt(goblin);
                customImages[facing] = goblin.customImage;
                window.__goblinMapDraws.length = 0;
                window.drawMap();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                seen[facing] = window.__goblinMapDraws.filter(src => src.includes('/images/characters/npc_goblin/body_'));
            }
            return { seen, customImages, artKey:goblin.directionalArtKey, name:goblin.name };
        });

        expect(result.name).toBe('Goblin');
        expect(result.artKey).toBe('npc_goblin');
        expect(result.customImages).toEqual({
            down:'npcGoblinFront', right:'npcGoblinRight', left:'npcGoblinLeft', up:'npcGoblinBack'
        });
        expect(result.seen.down.some(src => src.includes('body_front.svg'))).toBe(true);
        expect(result.seen.right.some(src => src.includes('body_side.svg'))).toBe(true);
        expect(result.seen.left.some(src => src.includes('body_side_left.svg'))).toBe(true);
        expect(result.seen.up.some(src => src.includes('body_back.svg'))).toBe(true);
    });

    test('elite goblins keep their existing distinct sprite', async ({ page }) => {
        await createCharacter(page, { race:'human', gender:'female' });
        const result = await page.evaluate(async () => {
            const elite = window.createMonster('elite_goblin', { q:window.player.hex.q + 1, r:window.player.hex.r }, null, [], 'enemy');
            window.entities.push(elite);
            await new Promise(resolve => setTimeout(resolve, 130));
            return { artKey:elite.directionalArtKey || null, customImage:elite.customImage };
        });
        expect(result.artKey).toBeNull();
        expect(result.customImage).toBe('elite_goblin');
    });
});
