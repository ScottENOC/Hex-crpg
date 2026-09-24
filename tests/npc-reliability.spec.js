const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('NPC reliability and fallback dialogue', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() => !!window.NPCReliability && !!window.GeneratedCivilianPopulation && !!window.SilverhartPopulation);
    await page.evaluate(() => window.NPCReliability.maintenance());
  });

  test('generated civilians are never allowed to occupy a doorway or its immediate circulation hexes', async ({ page }) => {
    const result = await page.evaluate(() => {
      const doorEntry = Object.entries(window.tileObjects).find(([, obj]) => obj?.type === 'door_open' || obj?.type === 'door_closed');
      if (!doorEntry) return { noDoor: true };
      const [coord] = doorEntry;
      const [q, r] = coord.split(',').map(Number);
      const dummy = new window.Entity('Doorway Test Civilian', 'white', { q, r }, 10);
      dummy.alive = true;
      dummy.side = 'neutral';
      dummy.isNPC = true;
      dummy.isGeneratedCivilian = true;
      window.entities.push(dummy);
      const moved = window.NPCReliability.clearGeneratedDoorways();
      const distance = window.distance(dummy.hex, { q, r });
      window.entities.splice(window.entities.indexOf(dummy), 1);
      return { noDoor: false, moved, distance, hex: dummy.hex };
    });
    expect(result.noDoor).toBe(false);
    expect(result.moved).toBeGreaterThan(0);
    expect(result.distance).toBeGreaterThan(1);
  });

  test('Silverhart residents including Dain Gable and Jessa Nettle receive complete styled identities before portrait use', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.SilverhartPopulation;
      pop.ensurePopulation(500);
      const names = ['Dain Gable', 'Jessa Nettle'];
      return names.map(name => {
        const record = [...pop.records.values()].find(r => r.name === name);
        if (!record) return { name, found: false };
        const fake = new window.Entity(record.name, record.colour, { q: 9000, r: 9000 }, 10);
        fake.id = record.id;
        fake.alive = true;
        fake.side = 'neutral';
        fake.isNPC = true;
        fake.isGeneratedCivilian = true;
        fake.isSilverhartCivilian = true;
        fake.race = record.race;
        fake.gender = record.gender;
        fake.occupation = record.occupation;
        fake.appearance = { ...record.appearance };
        window.NPCReliability.styleEntityNow(fake, record);
        return {
          name, found: true, race: fake.race, gender: fake.gender,
          equipped: !!fake.equipped,
          styled: !!fake.__civilianVisualStyled,
          shirtHue: fake.shirtHue,
          pantsHue: fake.pantsHue,
          skinHue: fake.skinHue,
          hairStyle: fake.hairStyle,
          appearanceKey: fake.civilianAppearanceKey,
        };
      });
    });
    for (const npc of result) {
      expect(npc.found, `${npc.name} should exist in deterministic Silverhart population`).toBe(true);
      expect(npc.equipped).toBe(true);
      expect(npc.styled).toBe(true);
      expect(Number.isFinite(npc.shirtHue)).toBe(true);
      expect(Number.isFinite(npc.pantsHue)).toBe(true);
      expect(Number.isFinite(npc.skinHue)).toBe(true);
      expect(['brown_1', 'braid', 'curly', 'bald']).toContain(npc.hairStyle);
      expect(npc.appearanceKey).toBeTruthy();
    }
  });

  test('bald is player-selectable and rare for adult male generated NPCs rather than equally weighted', async ({ page }) => {
    const result = await page.evaluate(() => {
      const select = document.getElementById('hair-style-select');
      const pop = window.SilverhartPopulation;
      pop.ensurePopulation(500);
      window.NPCReliability.normalisePopulationHair();
      const records = [...pop.records.values()];
      const adultMales = records.filter(r => r.gender === 'male' && r.appearance.ageBand !== 'child');
      const women = records.filter(r => r.gender === 'female');
      const children = records.filter(r => r.appearance.ageBand === 'child');
      return {
        hasBaldOption: !!select?.querySelector('option[value="bald"]'),
        adultMaleCount: adultMales.length,
        baldAdultMales: adultMales.filter(r => r.appearance.hair === 'bald').length,
        baldWomen: women.filter(r => r.appearance.hair === 'bald').length,
        baldChildren: children.filter(r => r.appearance.hair === 'bald').length,
        directionalBaldReady: Object.values(window.DIRECTIONAL_CHARACTER_ASSETS || {}).every(set => !set?.hair || !!set.hair.bald),
      };
    });
    expect(result.hasBaldOption).toBe(true);
    expect(result.adultMaleCount).toBeGreaterThan(100);
    expect(result.baldAdultMales).toBeGreaterThan(0);
    expect(result.baldAdultMales / result.adultMaleCount).toBeLessThan(0.12);
    expect(result.baldWomen).toBe(0);
    expect(result.baldChildren).toBe(0);
    expect(result.directionalBaldReady).toBe(true);
  });

  test('NPCs without authored dialogue get varied occupation-aware small talk instead of a dead response', async ({ page }) => {
    const result = await page.evaluate(() => {
      const npc = new window.Entity('Quiet Test Smith', 'white', { q: 0, r: 0 }, 10);
      npc.alive = true;
      npc.side = 'neutral';
      npc.isNPC = true;
      npc.occupation = 'smith';
      npc.race = 'human';
      npc.gender = 'male';
      npc.equipped = {};
      const lines = [
        window.NPCReliability.smallTalkLine(npc),
        window.NPCReliability.smallTalkLine(npc),
        window.NPCReliability.smallTalkLine(npc),
        window.NPCReliability.smallTalkLine(npc),
      ];
      window.talkToNPC(npc);
      return {
        lines,
        unique: new Set(lines).size,
        text: document.getElementById('dialogue-message')?.innerText || '',
      };
    });
    expect(result.unique).toBeGreaterThan(1);
    expect(result.text).not.toContain('nothing to say');
    expect(result.text.length).toBeGreaterThan(10);
  });

  test('hidden character creator does not overwrite a loaded/saved hairstyle during maintenance', async ({ page }) => {
    const result = await page.evaluate(() => {
      const creator = document.getElementById('characterCreator');
      creator.style.display = 'none';
      const select = document.getElementById('hair-style-select');
      select.value = 'brown_1';
      window.party[0].hairStyle = 'bald';
      const entity = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
      if (entity) entity.hairStyle = 'bald';
      window.NPCReliability.maintenance();
      return { partyHair: window.party[0].hairStyle, entityHair: entity?.hairStyle };
    });
    expect(result.partyHair).toBe('bald');
    expect(result.entityHair).toBe('bald');
  });
});
