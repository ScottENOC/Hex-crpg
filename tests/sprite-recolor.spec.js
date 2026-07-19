// tests/sprite-recolor.spec.js
// Body sprite recolor (spriteRecolor.js): cheap character variety by hue-
// shifting shirt/pants/skin independently (identified by lightness bands,
// not hue — skin and clothing share nearly the same hue in this pixel art)
// plus a separate full-image recolor for the hair overlay, all without
// needing new art per variant.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('sprite recolor', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('hashStringToHue is deterministic for the same string and varies across strings', async ({ page }) => {
        const result = await page.evaluate(() => ({
            sameTwice: window.hashStringToHue('Alice') === window.hashStringToHue('Alice'),
            differsAcrossNames: new Set(['Alice', 'Bob', 'Carol', 'Dave'].map(n => window.hashStringToHue(n))).size,
            inRange: [0, 90, 180, 270, 'Zzz'].every(n => {
                const h = window.hashStringToHue(String(n));
                return h >= 0 && h < 360;
            }),
        }));
        expect(result.sameTwice).toBe(true);
        expect(result.differsAcrossNames).toBeGreaterThan(1); // not all four collide to the same hue
        expect(result.inRange).toBe(true);
    });

    test('getRecoloredSprite changes shirt and pants independently, and skin separately, without touching the face when shirt/pants only', async ({ page }) => {
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.humanMaleBase;
            const canvas = window.getRecoloredSprite(img, { shirtHue: 200, pantsHue: 90 });
            const ctx = canvas.getContext('2d');

            // Torso (shirt band, ~L 0.43-0.45) and legs (pants band, ~L 0.17-0.18),
            // sampled down the center column; face near the top.
            const torso = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.45), 1, 1).data;
            const legs = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.63), 1, 1).data;
            const face = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.12), 1, 1).data;

            const origCtx = document.createElement('canvas').getContext('2d');
            origCtx.canvas.width = img.naturalWidth;
            origCtx.canvas.height = img.naturalHeight;
            origCtx.drawImage(img, 0, 0);
            const origTorso = origCtx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.45), 1, 1).data;
            const origLegs = origCtx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.63), 1, 1).data;
            const origFace = origCtx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.12), 1, 1).data;

            return {
                torso: Array.from(torso), origTorso: Array.from(origTorso),
                legs: Array.from(legs), origLegs: Array.from(origLegs),
                face: Array.from(face), origFace: Array.from(origFace),
            };
        });
        expect(result.torso[0] !== result.origTorso[0] || result.torso[1] !== result.origTorso[1] || result.torso[2] !== result.origTorso[2]).toBe(true);
        expect(result.legs[0] !== result.origLegs[0] || result.legs[1] !== result.origLegs[1] || result.legs[2] !== result.origLegs[2]).toBe(true);
        // Shirt and pants should end up as visibly different colors from each other.
        expect(result.torso.slice(0, 3).join(',')).not.toBe(result.legs.slice(0, 3).join(','));
        // Face untouched when only shirtHue/pantsHue are given (no skinHue).
        expect(result.face[0]).toBe(result.origFace[0]);
        expect(result.face[1]).toBe(result.origFace[1]);
        expect(result.face[2]).toBe(result.origFace[2]);
    });

    test('skinHue recolors the face too (unlike shirt/pants, skin is not head-cutoff-excluded)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.humanMaleBase;
            const canvas = window.getRecoloredSprite(img, { skinHue: 250 });
            const ctx = canvas.getContext('2d');
            const face = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.12), 1, 1).data;

            const origCtx = document.createElement('canvas').getContext('2d');
            origCtx.canvas.width = img.naturalWidth;
            origCtx.canvas.height = img.naturalHeight;
            origCtx.drawImage(img, 0, 0);
            const origFace = origCtx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.12), 1, 1).data;

            return { face: Array.from(face), origFace: Array.from(origFace) };
        });
        expect(result.face[0] !== result.origFace[0] || result.face[1] !== result.origFace[1] || result.face[2] !== result.origFace[2]).toBe(true);
    });

    test('results are cached — calling getRecoloredSprite twice with the same hues returns the same canvas instance', async ({ page }) => {
        const same = await page.evaluate(() => {
            const img = window.gameVisuals.humanMaleBase;
            const a = window.getRecoloredSprite(img, { shirtHue: 150, pantsHue: 60 });
            const b = window.getRecoloredSprite(img, { shirtHue: 150, pantsHue: 60 });
            return a === b;
        });
        expect(same).toBe(true);
    });

    test('getRecoloredHairSprite recolors opaque hair pixels and caches by hue', async ({ page }) => {
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.humanMaleHair;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const origCtx = canvas.getContext('2d');
            origCtx.drawImage(img, 0, 0);
            const orig = origCtx.getImageData(0, 0, canvas.width, canvas.height).data;

            // Find the first opaque pixel to compare before/after.
            let idx = -1;
            for (let i = 0; i < orig.length; i += 4) { if (orig[i + 3] >= 50) { idx = i; break; } }

            const tinted = window.getRecoloredHairSprite(img, 300);
            const tintedCtx = tinted.getContext('2d');
            const tintedData = tintedCtx.getImageData(0, 0, canvas.width, canvas.height).data;

            const again = window.getRecoloredHairSprite(img, 300);

            return {
                foundOpaquePixel: idx >= 0,
                changed: idx >= 0 && (orig[idx] !== tintedData[idx] || orig[idx + 1] !== tintedData[idx + 1] || orig[idx + 2] !== tintedData[idx + 2]),
                cached: tinted === again,
            };
        });
        expect(result.foundOpaquePixel).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.cached).toBe(true);
    });

    test('drawPlayerCharacter assigns stable, independently-salted hues per entity name, drawn from the natural palettes', async ({ page }) => {
        const result = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 200;
            const ctx = canvas.getContext('2d');
            window.hexSize = 40;
            const ent = { name: 'Testcharacter', race: 'human', gender: 'male', equipped: {} };
            window.drawPlayerCharacter(ctx, ent, 100, 100, 1, 0);
            const expectedHairPreset = window.pickHairPreset('Testcharacter_hair');
            return {
                shirtHue: ent.shirtHue, pantsHue: ent.pantsHue, hairHue: ent.hairHue, skinHue: ent.skinHue,
                clothingSatMult: ent.clothingSatMult, hairLightMult: ent.hairLightMult, hairSatMult: ent.hairSatMult,
                expectedShirt: window.pickClothingHue('Testcharacter_shirt'),
                expectedPants: window.pickClothingHue('Testcharacter_pants'),
                expectedHairHue: expectedHairPreset.hue,
                expectedHairLightMult: expectedHairPreset.lightMult,
                expectedSkin: 5 + window.hashStringToHue('Testcharacter_skin') % 40,
            };
        });
        expect(result.shirtHue).toBe(result.expectedShirt);
        expect(result.pantsHue).toBe(result.expectedPants);
        expect(result.hairHue).toBe(result.expectedHairHue);
        expect(result.hairLightMult).toBe(result.expectedHairLightMult);
        expect(result.skinHue).toBe(result.expectedSkin);
        // Defaults are muted (natural palette), unlike an explicit player choice.
        expect(result.clothingSatMult).toBeLessThan(1);
        // Salting per band means shirt/pants/hair shouldn't all collapse to the same hue.
        expect(new Set([result.shirtHue, result.pantsHue, result.hairHue]).size).toBeGreaterThan(1);
    });

    test('pickHairPreset and pickClothingHue are deterministic and only draw from the natural palettes', async ({ page }) => {
        const result = await page.evaluate(() => {
            const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi'];
            const hairHues = names.map(n => window.pickHairPreset(n + '_hair').hue);
            const clothingHues = names.map(n => window.pickClothingHue(n + '_shirt'));
            return {
                hairSame: window.pickHairPreset('Alice_hair').hue === window.pickHairPreset('Alice_hair').hue,
                hairAllValid: hairHues.every(h => [25, 45, 30, 12].includes(h)),
                clothingAllValid: clothingHues.every(h => [25, 40, 95, 150, 210, 350, 45].includes(h)),
            };
        });
        expect(result.hairSame).toBe(true);
        expect(result.hairAllValid).toBe(true);
        expect(result.clothingAllValid).toBe(true);
    });

    test('two different party members render with visibly different shirt colors', async ({ page }) => {
        const differs = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 400; canvas.height = 200;
            const ctx = canvas.getContext('2d');
            window.hexSize = 40;
            window.drawPlayerCharacter(ctx, { name: 'PartyMemberOne', race: 'human', gender: 'male', equipped: {} }, 100, 100, 1.2, 0);
            window.drawPlayerCharacter(ctx, { name: 'PartyMemberTwo', race: 'human', gender: 'male', equipped: {} }, 300, 100, 1.2, 0);
            const p1 = ctx.getImageData(100, 130, 1, 1).data; // roughly torso height
            const p2 = ctx.getImageData(300, 130, 1, 1).data;
            return Array.from(p1).join(',') !== Array.from(p2).join(',');
        });
        expect(differs).toBe(true);
    });
});
