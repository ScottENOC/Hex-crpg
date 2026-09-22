const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Hollowmere social fabric', () => {
  test.beforeEach(async ({ page }) => {
    await createCharacter(page, { campaign: '2' });
    await page.waitForFunction(() =>
      !!window.HollowmereSocialFabric?.stats?.installed &&
      !!window.HollowmereSettlementRegistry &&
      window.GeneratedCivilianPopulation?.records?.size === 80
    );
  });

  test('the starting village stays village-sized with enough housing and work capacity', async ({ page }) => {
    const result = await page.evaluate(() => {
      const social = window.HollowmereSocialFabric;
      const stats = social.stats;
      const builtResidences = social.residences.filter(r => r.region).length;
      const registeredRegions = (window.interiorRegions || []).filter(r => r.hollowmereResidenceId).length;
      const workplaceRegions = (window.interiorRegions || []).filter(r => r.hollowmereWorkplaceId).length;
      return { ...stats, builtResidences, registeredRegions, workplaceRegions };
    });

    expect(result.population).toBe(80);
    expect(result.targetDwellings).toBe(20);
    expect(result.residences).toBeGreaterThanOrEqual(18);
    expect(result.residences).toBeLessThanOrEqual(20);
    expect(result.builtResidences).toBeGreaterThanOrEqual(14);
    expect(result.registeredRegions).toBe(result.builtResidences);
    expect(result.housingCapacity).toBeGreaterThanOrEqual(result.population);
    expect(result.workplaces).toBeGreaterThanOrEqual(9);
    expect(result.workplaceCapacity).toBeGreaterThanOrEqual(result.adults);
    expect(result.workplaceRegions).toBeGreaterThanOrEqual(2);
    expect(result.dependants).toBeGreaterThan(5);
    expect(result.dependants).toBeLessThan(35);
  });

  test('the Hollow Tankard has a real upstairs lodging floor', async ({ page }) => {
    const result = await page.evaluate(() => {
      const building = window.campaign2HollowTankardBuilding;
      const stair = window.campaign2HollowTankardStairHex;
      const upper = building?.floors?.[1];
      const beds = Object.values(upper?.tileObjects || {}).filter(o => o?.type === 'bed').length;
      return {
        building: !!building,
        floor: window.campaign2HollowTankardLodgingFloor,
        stair,
        groundStair: stair ? window.tileObjects?.[`${stair.q},${stair.r}`] : null,
        upperStair: stair ? upper?.tileObjects?.[`${stair.q},${stair.r}`] : null,
        beds,
        registered: (window.multiStoryBuildings || []).includes(building),
      };
    });
    expect(result.building).toBe(true);
    expect(result.floor).toBe(1);
    expect(result.registered).toBe(true);
    expect(result.groundStair?.type).toBe('stair_up');
    expect(result.upperStair?.type).toBe('stair_down');
    expect(result.beds).toBeGreaterThanOrEqual(5);
  });

  test('every adult has a household and real workplace while dependants remain household-based', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const social = window.HollowmereSocialFabric;
      const workplaceIds = new Set(social.workplaces.map(w => w.id));
      const residenceIds = new Set(social.residences.map(r => r.id));
      const records = [...pop.records.values()];
      const adults = records.filter(r => !r.isDependent);
      const dependants = records.filter(r => r.isDependent);
      return {
        total: records.length,
        withHousehold: records.filter(r => !!r.householdId).length,
        adultsWithWorkplace: adults.filter(r => workplaceIds.has(r.workplaceId)).length,
        adults: adults.length,
        dependants: dependants.length,
        dependantsWithoutJobs: dependants.filter(r => !r.workplaceId).length,
        realHomes: records.filter(r => residenceIds.has(String(r.nodes.home.key).replace(/^home:/,''))).length,
        distinctHomes: new Set(records.map(r => r.householdId)).size,
        distinctWorkplaces: new Set(adults.map(r => r.workplaceId)).size,
      };
    });

    expect(result.withHousehold).toBe(result.total);
    expect(result.adultsWithWorkplace).toBe(result.adults);
    expect(result.dependantsWithoutJobs).toBe(result.dependants);
    expect(result.realHomes).toBe(result.total);
    expect(result.distinctHomes).toBeGreaterThanOrEqual(15);
    expect(result.distinctWorkplaces).toBeGreaterThanOrEqual(6);
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
    expect(result.spouses).toBeGreaterThan(20);
    expect(result.parentLinks).toBeGreaterThan(10);
  });

  test('friend networks point social visits at actual friends homes', async ({ page }) => {
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

    expect(result.withFriends).toBeGreaterThan(result.total * 0.7);
    expect(result.valid).toBe(result.withFriends);
    expect(result.socialAtFriendHome).toBe(result.withFriends);
  });

  test('scheduler uses assigned addresses without increasing the live-entity cap', async ({ page }) => {
    const result = await page.evaluate(() => {
      const pop = window.GeneratedCivilianPopulation;
      const sched = window.NPCRoutineScheduler;
      const records = [...pop.records.values()];
      const record = records.find(r => sched.getState(r.id) && !sched.getState(r.id).travel);
      const state = sched.getState(record.id);
      const validNode = [record.nodes.home.key, record.nodes.work.key, record.nodes.social.key].includes(state.currentNode);
      return { validNode, currentHex:state.currentHex, materialised:pop.materialised.size, max:pop.MAX_MATERIALISED };
    });

    expect(result.validNode).toBe(true);
    expect(result.currentHex).toBeTruthy();
    expect(result.materialised).toBeLessThanOrEqual(result.max);
  });
});
