const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('human female base clothing recolour masks', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page);
    await page.waitForFunction(() => window.__femaleBaseClothingRecolorInstalled === true);
  });

  test('upper and lower sliders colour only their own garment on all directional body sprites', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const paths = [
        'images/characters/human_female/body_front.png',
        'images/characters/human_female/body_side.png',
        'images/characters/human_female/body_back.png',
      ];

      const load = async (src) => {
        const img = new Image();
        img.src = `${src}?test=female-base-clothing-mask`;
        await img.decode();
        return img;
      };
      const pixels = (source) => {
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth || source.width;
        canvas.height = source.naturalHeight || source.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, 0, 0);
        return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const boundsFor = ({ width, height, data }) => {
        let left = width, right = -1, top = height, bottom = -1;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue;
          const px = i / 4, x = px % width, y = Math.floor(px / width);
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 };
      };
      const diffStats = (original, recoloured, expectedBand) => {
        const after = pixels(recoloured);
        const b = boundsFor(original);
        let changed = 0, inExpectedBand = 0, outsideCentralBody = 0;
        let sumR = 0, sumG = 0, sumB = 0;
        for (let i = 0; i < original.data.length; i += 4) {
          if (original.data[i + 3] < 40) continue;
          if (original.data[i] === after.data[i] && original.data[i + 1] === after.data[i + 1] && original.data[i + 2] === after.data[i + 2]) continue;
          changed++;
          sumR += after.data[i]; sumG += after.data[i + 1]; sumB += after.data[i + 2];
          const px = i / 4, x = px % original.width, y = Math.floor(px / original.width);
          const rx = (x - b.left) / Math.max(1, b.width - 1);
          const ry = (y - b.top) / Math.max(1, b.height - 1);
          const inUpper = rx >= 0.23 && rx <= 0.77 && ry >= 0.17 && ry <= 0.385;
          const inLower = rx >= 0.23 && rx <= 0.77 && ry >= 0.405 && ry <= 0.585;
          if ((expectedBand === 'upper' && inUpper) || (expectedBand === 'lower' && inLower)) inExpectedBand++;
          if (rx < 0.23 || rx > 0.77 || ry > 0.585) outsideCentralBody++;
        }
        return {
          changed,
          allInExpectedBand: changed > 0 && inExpectedBand === changed,
          outsideCentralBody,
          avg: changed ? [sumR / changed, sumG / changed, sumB / changed] : [0, 0, 0],
        };
      };

      const output = [];
      for (const path of paths) {
        const img = await load(path);
        const original = pixels(img);
        const upper = window.getRecoloredSprite(img, { shirtHue: 120 });
        const lower = window.getRecoloredSprite(img, { pantsHue: 240 });
        output.push({
          path,
          upper: diffStats(original, upper, 'upper'),
          lower: diffStats(original, lower, 'lower'),
        });
      }
      return output;
    });

    for (const view of results) {
      expect(view.upper.changed, `${view.path}: upper garment should recolour`).toBeGreaterThan(20);
      expect(view.lower.changed, `${view.path}: lower garment should recolour`).toBeGreaterThan(20);
      expect(view.upper.allInExpectedBand, `${view.path}: upper must not leak into lower/body`).toBe(true);
      expect(view.lower.allInExpectedBand, `${view.path}: lower must not leak into upper/body`).toBe(true);
      expect(view.upper.outsideCentralBody, `${view.path}: upper must not hit fingers/knees/toes`).toBe(0);
      expect(view.lower.outsideCentralBody, `${view.path}: lower must not hit fingers/knees/toes`).toBe(0);
      expect(view.upper.avg[1], `${view.path}: hue 120 should visibly read green`).toBeGreaterThan(view.upper.avg[0]);
      expect(view.upper.avg[1], `${view.path}: hue 120 should visibly read green`).toBeGreaterThan(view.upper.avg[2]);
      expect(view.lower.avg[2], `${view.path}: hue 240 should visibly read blue`).toBeGreaterThan(view.lower.avg[0]);
      expect(view.lower.avg[2], `${view.path}: hue 240 should visibly read blue`).toBeGreaterThan(view.lower.avg[1]);
    }
  });
});
