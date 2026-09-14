const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('directional human female UI integration', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__directionalCharacterUIInstalled === true);
        await page.waitForFunction(() => window.HUMAN_FEMALE_DIRECTIONAL_ASSETS?.body?.front?.complete === true);
    });

    test('character creator uses the directional human female preview', async ({ page }) => {
        const result = await page.evaluate(() => {
            document.getElementById('race-select').value = 'human';
            document.getElementById('gender-select').value = 'female';
            window.updateAppearancePreview();
            const canvas = document.getElementById('appearance-preview-canvas');
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let alpha = 0;
            for (let i = 3; i < pixels.length; i += 4) alpha += pixels[i];
            return {
                marker: !!window.updateAppearancePreview.__directionalHumanFemalePreview,
                alpha,
            };
        });
        expect(result.marker).toBe(true);
        expect(result.alpha).toBeGreaterThan(0);
    });

    test('initiative portrait removes legacy female body and hair layers', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const female = window.entities.find(e => e.race === 'human' && e.gender === 'female' && e.side === 'player');
            if (!female) return { missing:true };
            window.updateTurnIndicator();
            await new Promise(resolve => setTimeout(resolve, 50));
            const items = [...document.querySelectorAll('#turn-indicator-bar .turn-indicator-item')];
            const entities = [...window.entities]
                .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
            if (window.isInCombat) entities.sort((a,b) => b.timePoints-a.timePoints);
            const index = entities.indexOf(female);
            const portrait = items[index]?.querySelector('.turn-indicator-portrait');
            if (!portrait) return { missingPortrait:true };
            const legacy = [...portrait.querySelectorAll('img')].map(img => img.getAttribute('src') || '')
                .filter(src => src.endsWith('images/humanfemale.png') || src.endsWith('images/humanfemalehair.png'));
            return {
                legacy,
                hasDirectionalCanvas: !!portrait.querySelector('canvas[data-directional-human-female="true"]'),
            };
        });
        expect(result.missing).not.toBe(true);
        expect(result.missingPortrait).not.toBe(true);
        expect(result.legacy).toEqual([]);
        expect(result.hasDirectionalCanvas).toBe(true);
    });

    test('map renderer suppresses obsolete legacy female hair layer', async ({ page }) => {
        const result = await page.evaluate(async () => {
            for (let i=0; i<100 && !window.mapCtx?.__directionalLegacyHumanFemaleHairSuppressed; i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return {
                facingInstalled: !!window.__facingRendererInstalled,
                suppressionInstalled: !!window.mapCtx?.__directionalLegacyHumanFemaleHairSuppressed,
            };
        });
        expect(result.facingInstalled).toBe(true);
        expect(result.suppressionInstalled).toBe(true);
    });

    test('external portrait renderer is wrapped for dialogue canvases', async ({ page }) => {
        const result = await page.evaluate(async () => {
            for (let i=0; i<100 && !window.drawPlayerCharacter?.__directionalHumanFemaleExternal; i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return !!window.drawPlayerCharacter?.__directionalHumanFemaleExternal;
        });
        expect(result).toBe(true);
    });

    test('directional registry includes human male plus all new female variants', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const all = window.DIRECTIONAL_CHARACTER_ASSETS;
            const images = [
                ...Object.values(all.human_male.body.average),
                ...Object.values(all.human_female.body.broad),
                ...Object.values(all.human_female.hair.braid),
                ...Object.values(all.human_female.hair.curly),
            ];
            await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
                img.addEventListener('load', resolve, { once:true });
                img.addEventListener('error', resolve, { once:true });
            })));
            return {
                count:images.length,
                allReady:images.every(img => img.naturalWidth === 1254 && img.naturalHeight === 1254),
                playerSkinRange:[document.getElementById('skin-tone-slider').min, document.getElementById('skin-tone-slider').max],
                fantasySkinRange:[document.getElementById('skin-hue-slider').min, document.getElementById('skin-hue-slider').max],
            };
        });
        expect(result.count).toBe(12);
        expect(result.allReady).toBe(true);
        expect(result.playerSkinRange).toEqual(['0','100']);
        expect(result.fantasySkinRange).toEqual(['0','359']);
    });
});
