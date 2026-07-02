// tests/sprite-recolor.spec.js
// Clothing recolor (spriteRecolor.js): cheap character variety by hue-
// shifting clothing pixels (identified by lightness, not hue — skin and
// clothing share nearly the same hue in this pixel art) without touching
// skin/hair/face, and without needing new art per variant.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('sprite clothing recolor', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('hashStringToHue is deterministic for the same name and varies across names', async ({ page }) => {
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

    test('getRecoloredSprite changes clothing pixels but leaves skin/face pixels alone', async ({ page }) => {
        const result = await page.evaluate(() => {
            const img = window.gameVisuals.humanMaleBase;
            const canvas = window.getRecoloredSprite(img, 200); // arbitrary target hue
            const ctx = canvas.getContext('2d');

            // Sample a clothing-region pixel (mid-torso, well below the head
            // cutoff) and a face-region pixel (near the top, well within skin).
            const torso = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.45), 1, 1).data;
            const face = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.12), 1, 1).data;

            const origCtx = document.createElement('canvas').getContext('2d');
            origCtx.canvas.width = img.naturalWidth;
            origCtx.canvas.height = img.naturalHeight;
            origCtx.drawImage(img, 0, 0);
            const origTorso = origCtx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.45), 1, 1).data;
            const origFace = origCtx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.12), 1, 1).data;

            return {
                torso: Array.from(torso), origTorso: Array.from(origTorso),
                face: Array.from(face), origFace: Array.from(origFace),
            };
        });
        // Torso (clothing) pixel should have changed color.
        expect(result.torso[0] !== result.origTorso[0] || result.torso[1] !== result.origTorso[1] || result.torso[2] !== result.origTorso[2]).toBe(true);
        // Face pixel should be untouched (within a tiny tolerance for JPEG-less PNG exactness).
        expect(result.face[0]).toBe(result.origFace[0]);
        expect(result.face[1]).toBe(result.origFace[1]);
        expect(result.face[2]).toBe(result.origFace[2]);
    });

    test('results are cached — calling getRecoloredSprite twice with the same hue returns the same canvas instance', async ({ page }) => {
        const same = await page.evaluate(() => {
            const img = window.gameVisuals.humanMaleBase;
            const a = window.getRecoloredSprite(img, 150);
            const b = window.getRecoloredSprite(img, 150);
            return a === b;
        });
        expect(same).toBe(true);
    });

    test('drawPlayerCharacter assigns a stable tintHue derived from the entity name', async ({ page }) => {
        const result = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 200;
            const ctx = canvas.getContext('2d');
            window.hexSize = 40;
            const ent = { name: 'Testcharacter', race: 'human', gender: 'male', equipped: {} };
            window.drawPlayerCharacter(ctx, ent, 100, 100, 1, 0);
            return { tintHue: ent.tintHue, expectedHue: window.hashStringToHue('Testcharacter') };
        });
        expect(result.tintHue).toBe(result.expectedHue);
    });

    test('two different party members render with visibly different tunic colors', async ({ page }) => {
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
