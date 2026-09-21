const { test, expect } = require('@playwright/test');

test.describe('playable greenskin directional art', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.DIRECTIONAL_CHARACTER_PATHS && window.PLAYABLE_GREEN_SKIN_DIRECTIONAL_PATHS);
  });

  test('registers orc female and goblin male front side back assets', async ({ page }) => {
    const result = await page.evaluate(() => ({
      orc: window.DIRECTIONAL_CHARACTER_PATHS.orc_female?.body?.average,
      goblin: window.DIRECTIONAL_CHARACTER_PATHS.goblin_male?.body?.average,
      mapping: {
        down: window.facingToSpriteView?.('down'),
        up: window.facingToSpriteView?.('up'),
        left: window.facingToSpriteView?.('left'),
        right: window.facingToSpriteView?.('right'),
      },
    }));

    expect(result.orc).toEqual({
      front: 'images/characters/orc_female/body_front.png',
      side: 'images/characters/orc_female/body_side.png',
      back: 'images/characters/orc_female/body_back.png',
    });
    expect(result.goblin).toEqual({
      front: 'images/characters/goblin_male/body_front.png',
      side: 'images/characters/goblin_male/body_side.png',
      back: 'images/characters/goblin_male/body_back.png',
    });
    expect(result.mapping).toEqual({ down:'front', up:'back', left:'side', right:'side' });
  });

  test('directional PNGs retain real alpha transparency', async ({ page }) => {
    const paths = [
      'images/characters/orc_female/body_front.png',
      'images/characters/orc_female/body_side.png',
      'images/characters/orc_female/body_back.png',
      'images/characters/goblin_male/body_front.png',
      'images/characters/goblin_male/body_side.png',
      'images/characters/goblin_male/body_back.png',
    ];

    const checks = await page.evaluate(async (sources) => {
      const inspect = src => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently:true });
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
          let transparent = 0;
          let opaque = 0;
          for (let i=3; i<data.length; i+=4) {
            if (data[i] === 0) transparent++;
            if (data[i] > 0) opaque++;
          }
          resolve({ src, transparent, opaque, cornerAlpha:data[3] });
        };
        img.onerror = reject;
        img.src = src;
      });
      return Promise.all(sources.map(inspect));
    }, paths);

    for (const check of checks) {
      expect(check.cornerAlpha, `${check.src} top-left should be transparent`).toBe(0);
      expect(check.transparent, `${check.src} should contain transparent pixels`).toBeGreaterThan(0);
      expect(check.opaque, `${check.src} should contain visible character pixels`).toBeGreaterThan(0);
    }
  });

  test('runtime packing loads the authored transparent bodies into the live renderer', async ({ page }) => {
    await page.waitForFunction(() => {
      const assets = window.DIRECTIONAL_CHARACTER_ASSETS;
      return assets?.orc_female?.body?.average?.front?.__directionalReady
        && assets?.goblin_male?.body?.average?.front?.__directionalReady;
    });

    const result = await page.evaluate(() => ({
      registered: window.__playableGreenskinDirectionalArtRegistered === true,
      orcFrontSrc: window.DIRECTIONAL_CHARACTER_ASSETS.orc_female.body.average.front.src,
      goblinFrontSrc: window.DIRECTIONAL_CHARACTER_ASSETS.goblin_male.body.average.front.src,
      orcSize: [window.DIRECTIONAL_CHARACTER_ASSETS.orc_female.body.average.front.width, window.DIRECTIONAL_CHARACTER_ASSETS.orc_female.body.average.front.height],
      goblinSize: [window.DIRECTIONAL_CHARACTER_ASSETS.goblin_male.body.average.front.width, window.DIRECTIONAL_CHARACTER_ASSETS.goblin_male.body.average.front.height],
    }));

    expect(result.registered).toBe(true);
    expect(result.orcFrontSrc).toContain('/characters/orc_female/body_front.png');
    expect(result.goblinFrontSrc).toContain('/characters/goblin_male/body_front.png');
    expect(result.orcSize).toEqual([256,256]);
    expect(result.goblinSize).toEqual([256,256]);
  });
});
