const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('initiative portraits, male hair fit and mobile render scaling', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.InitiativePortraitRenderer?.stats?.installed);
    });

    test('initiative tracker uses the shared character renderer and includes equipped gear in its signature', async ({ page }) => {
        await page.evaluate(() => {
            const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
            player.equipped = {
                ...(player.equipped || {}),
                weapon: 'sword',
                offhand: 'wooden_shield',
                armor: 'heavy_armor',
                helmet: 'nasal_helm',
            };
            window.updateTurnIndicator();
        });

        await page.waitForFunction(() => document.querySelector('.turn-indicator-item .initiative-shared-character-portrait'));
        const result = await page.evaluate(() => {
            const canvas = document.querySelector('.turn-indicator-item .initiative-shared-character-portrait');
            return {
                tag: canvas?.tagName,
                shared: canvas?.dataset.sharedCharacterPortrait,
                signature: canvas?.dataset.gearSignature || '',
                rendered: window.InitiativePortraitRenderer.stats.portraitsRendered,
            };
        });
        expect(result.tag).toBe('CANVAS');
        expect(result.shared).toBe('true');
        expect(result.signature).toContain('sword');
        expect(result.signature).toContain('wooden_shield');
        expect(result.signature).toContain('heavy_armor');
        expect(result.signature).toContain('nasal_helm');
        expect(result.rendered).toBeGreaterThan(0);
    });

    test('human male directional hair uses a materially smaller destination than female hair', async ({ page }) => {
        await page.waitForFunction(() => window.HUMAN_MALE_DIRECTIONAL_HAIR_DEST && window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT);
        const result = await page.evaluate(() => {
            const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT;
            const previous = window.__activeCharacterEntity;
            window.__activeCharacterEntity = { race:'human', gender:'female' };
            const femaleFront = { ...layout.front.hairDest };
            const femaleSide = { ...layout.side.hairDest };
            window.__activeCharacterEntity = { race:'human', gender:'male' };
            const maleFront = { ...layout.front.hairDest };
            const maleSide = { ...layout.side.hairDest };
            window.__activeCharacterEntity = previous;
            return { femaleFront, femaleSide, maleFront, maleSide };
        });
        expect(result.maleFront.w).toBeLessThan(result.femaleFront.w);
        expect(result.maleFront.h).toBeLessThan(result.femaleFront.h);
        expect(result.maleSide.w).toBeLessThan(result.femaleSide.w);
        expect(result.maleSide.h).toBeLessThan(result.femaleSide.h);
    });

    test('sustained slow frames reduce backing-canvas work in Auto mode', async ({ page }) => {
        await page.waitForFunction(() => window.AdaptiveMobileRenderScale && window.resizeCanvas);
        const result = await page.evaluate(() => {
            const adaptive = window.AdaptiveMobileRenderScale;
            adaptive.applyLevel(0, { force:true });
            window.resizeCanvas();
            const startWidth = window.mapCanvas.width;
            adaptive.evaluateSample(45, { force:true, now:100000 });
            adaptive.evaluateSample(45, { force:true, now:101000 });
            const reducedWidth = window.mapCanvas.width;
            const reducedScale = adaptive.scale;
            adaptive.applyLevel(0, { force:true });
            return { startWidth, reducedWidth, reducedScale };
        });
        expect(result.reducedScale).toBe(0.82);
        expect(result.reducedWidth).toBeLessThan(result.startWidth);
        expect(result.reducedWidth / result.startWidth).toBeCloseTo(0.82, 1);
    });
});
