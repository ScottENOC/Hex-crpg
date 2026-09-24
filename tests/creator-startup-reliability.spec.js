const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('creator startup reliability', () => {
  test('fresh creator has valid visible defaults and repairs blank native selects', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#characterCreator', { state:'visible' });
    await page.waitForFunction(() => !!window.NPCReliability?.ensureCreatorDefaults);

    const initial = await page.evaluate(() => ({
      race:document.getElementById('race-select').value,
      gender:document.getElementById('gender-select').value,
      cls:document.getElementById('class-select').value,
      voice:document.getElementById('voice-select').value,
      campaign:document.getElementById('campaign-select').value,
      difficulty:document.getElementById('difficulty-select').value,
    }));
    expect(initial).toEqual({ race:'human', gender:'female', cls:'fighter', voice:'pc_1', campaign:'1', difficulty:'normal' });

    const repaired = await page.evaluate(() => {
      for (const id of ['race-select','gender-select','class-select','voice-select','campaign-select','difficulty-select']) {
        document.getElementById(id).selectedIndex = -1;
      }
      const count = window.NPCReliability.ensureCreatorDefaults();
      return {
        count,
        race:document.getElementById('race-select').value,
        gender:document.getElementById('gender-select').value,
        cls:document.getElementById('class-select').value,
        voice:document.getElementById('voice-select').value,
        campaign:document.getElementById('campaign-select').value,
        difficulty:document.getElementById('difficulty-select').value,
      };
    });
    expect(repaired.count).toBeGreaterThanOrEqual(6);
    expect(repaired).toMatchObject({ race:'human', gender:'female', cls:'fighter', voice:'pc_1', campaign:'1', difficulty:'normal' });
  });

  test('a real new human-female game preserves directional-player identity', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female', cls:'fighter', campaign:'2' });
    await page.waitForFunction(() => !!window.NPCReliability?.ensureDirectionalPlayerPresentation);

    const state = await page.evaluate(() => {
      window.NPCReliability.ensureDirectionalPlayerPresentation();
      const c = window.party[0];
      const e = window.entities.find(x => x.side === 'player' && x.name === c.name);
      const customSrc = typeof e?.customImage === 'string' ? e.customImage : String(e?.customImage?.currentSrc || e?.customImage?.src || '');
      return {
        charRace:c.race, charGender:c.gender,
        entityRace:e?.race, entityGender:e?.gender,
        facing:e?.facing,
        customSrc,
        rendererInstalled:window.__facingRendererInstalled === true,
        hasSideAsset:!!window.DIRECTIONAL_CHARACTER_ASSETS?.human_female?.body?.average?.side,
        hasBackAsset:!!window.DIRECTIONAL_CHARACTER_ASSETS?.human_female?.body?.average?.back,
      };
    });

    expect(state).toMatchObject({
      charRace:'human', charGender:'female', entityRace:'human', entityGender:'female', facing:'down',
      rendererInstalled:true, hasSideAsset:true, hasBackAsset:true,
    });
    expect(state.customSrc).not.toMatch(/(?:^|\/)images\/humanfemale\.png(?:[?#]|$)/);
  });
});
