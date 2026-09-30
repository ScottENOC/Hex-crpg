const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function exerciseTacticalFacings(page, gender, key) {
  await createCharacter(page, { race:'human', gender });
  await page.waitForFunction((characterKey) => {
    const assets = window.DIRECTIONAL_CHARACTER_ASSETS?.[characterKey]?.body?.average;
    return window.__humanoidRendererInstalled === true
      && typeof window.drawHumanoidCharacter === 'function'
      && assets?.front?.naturalWidth > 0
      && assets?.side?.naturalWidth > 0
      && assets?.back?.naturalWidth > 0;
  }, key);

  return page.evaluate(({ gender, key }) => {
    const player = (window.entities || []).find(e => e?.alive && e.side === 'player' && e.race === 'human' && e.gender === gender);
    if (!player) return { error:`No human ${gender} player found` };

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const results = {};
    for (const facing of ['down','right','left','up']) {
      player.facing = facing;
      window.__humanoidRendererDrawCount = 0;
      window.__humanoidRendererLastDraw = null;
      const rendered = window.drawHumanoidCharacter(ctx, player, 128, 128, 1, 0);
      const draw = window.__humanoidRendererLastDraw;
      results[facing] = {
        rendered,
        count:window.__humanoidRendererDrawCount || 0,
        key:draw?.key || null,
        view:draw?.view || null,
        facing:draw?.facing || null,
      };
    }
    return { key, results };
  }, { gender, key });
}

for (const [gender,key] of [['female','human_female'],['male','human_male']]) {
  test(`human ${gender} tactical rendering uses one direct-compositor body per entity`, async ({ page }) => {
    const result = await exerciseTacticalFacings(page, gender, key);
    expect(result.error).toBeUndefined();

    const expectedViews = {down:'front',right:'side',left:'side',up:'back'};
    for (const [facing,view] of Object.entries(expectedViews)) {
      expect(result.results[facing]).toEqual({rendered:true,count:1,key,view,facing});
    }
  });
}
