const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Hollowmere social fabric', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() =>
      !!window.HollowmereSocialFabric?.stats?.installed &&
      !!window.HollowmereSettlementRegistry &&
      window.GeneratedCivilianPopulation?.records?.size >= 180
    );
  });

  test('the physical village has enough residential and work capacity for its population', async ({ page }) => {
    const result = await page.evaluate(() => {
      const social = window.HollowmereSocialFabric;
      const stats = social.stats;
      const builtResidences = social.residences.filter(r => r.region).length;
      const registeredRegions = (window.interiorRegions || []).filter(r => r.hollowmereResidenceId).length;
      const workplaceRegions = (window.interiorRegions || []).filter(r => r.hollowmereWorkplaceId).length;
      return { ...stats, builtResidences, registeredRegions, workplaceRegions };
    });

    expect(result.population).toBe(180);
    expect(result.residences).toBeGreaterThanOrEqual(24);
    expect(result.builtResidences).toBeGreaterThanOrEqual(20);
    expect(result.registeredRegions).toBe(result.builtResidences);
    expect(result.housingCapacity).toBeGreaterThanOrEqual(result.population);
    expect(result.workplaces).toBeGreaterThanOrEqual(9);
    expect(result.workplaceCapacity).toBeGreaterThanOrEqual(result.population);
    expect(result.workplaceRegions).toBeGreaterThanOrEqual(2);
  });

  test('every generated civilian belongs to a household and a real workplace', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const social = window.HollowmereSocialFabric;
      const workplaceIds = new Set(social.workplaces.map(w => w.id));
      const residenceIds = new Set(social.residences.map(r => r.id));
      const records = [...pop.records.values()];
      return {
        total: records.length,
        withHousehold: records.filter(r => !!r.householdId).length,
        withWorkplace: records.filter(r => workplaceIds.has(r.workplaceId)).length,
        realHomes: records.filter(r => residenceIds.has(String(r.nodes.home.key).replace(/^home:/,''))).length,
        distinctHomes: new Set(records.map(r => r.householdId)).size,
        distinctWorkplaces: new Set(records.map(r => r.workplaceId)).size,
      };
    });

    expect(result.withHousehold).toBe(result.total);
    expect(result.withWorkplace).toBe(result.total);
    expect(result.realHomes).toBe(result.total);
    expect(result.distinctHomes).toBeGreaterThanOrEqual(20);
    expect(result.distinctWorkplaces).toBeGreaterThanOrEqual(7);
  });

  test('households create reciprocal spouse and parent-child relationships', async ({ page }) => {
    const result = await page.evaluate(() => {
      const records = [...window.GeneratedCivilianPopulation.records.values()];
      const byId = new Map(records.map(r => [r.id, r]));
      let spouses = 0, parentLinks = 0, invalid = 0;
      for (const r of records) {
        if (r.spouseId) {
          spouses++;
          const spouse = byId.get(r.spouseId);
          if (!spouse || spouse.spouseId !== r.id || r.relationships?.[r.spouseId] !== 'spouse') invalid++;
        }
        for (const cid of r.childIds || []) {
          parentLinks++;
          const child = byId.get(cid);
          if (!child || !(child.parentIds || []).includes(r.id) || r.relationships?.[cid] !== 'child') invalid++;
        }
      }
      return { spouses, parentLinks, invalid };
    });

    expect(result.invalid).toBe(0);
    expect(result.spouses).toBeGreaterThan(30);
    expect(result.parentLinks).toBeGreaterThan(30);
  });

  test('friend networks are persistent IDs and social destinations point at actual friends homes', async ({ page }) => {
    const result = await page.evaluate(() => {
      const records = [...window.GeneratedCivilianPopulation.records.values()];
      const byId = new Map(records.map(r => [r.id, r]));
      let withFriends = 0, valid = 0, socialAtFriendHome = 0;
      for (const r of records) {
        if (!(r.friendIds || []).length) continue;
        withFriends++;
        const ids = r.friendIds.filter(id => byId.has(id) && id !== r.id);
        if (ids.length === r.friendIds.length) valid++;
        const first = byId.get(r.friendIds[0]);
        if (first && r.nodes.social?.hex?.q === first.nodes.home.hex.q && r.nodes.social?.hex?.r === first.nodes.home.hex.r) socialAtFriendHome++;
      }
      return { total:records.length, withFriends, valid, socialAtFriendHome };
    });

    expect(result.withFriends).toBeGreaterThan(result.total * 0.8);
    expect(result.valid).toBe(result.withFriends);
    expect(result.socialAtFriendHome).toBe(result.withFriends);
  });

  test('scheduler state is rebound to the assigned home/work nodes without increasing the live-entity cap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const sched = window.NPCRoutineScheduler;
      const records = [...pop.records.values()];
      const record = records.find(r => sched.getState(r.id) && !sched.getState(r.id).travel);
      const state = sched.getState(record.id);
      const validNode = [record.nodes.home.key, record.nodes.work.key, record.nodes.social.key].includes(state.currentNode);
      return {
        validNode,
        currentHex: state.currentHex,
        materialised: pop.materialised.size,
        max: pop.MAX_MATERIALISED,
      };
    });

    expect(result.validNode).toBe(true);
    expect(result.currentHex).toBeTruthy();
    expect(result.materialised).toBeLessThanOrEqual(result.max);
  });
});
