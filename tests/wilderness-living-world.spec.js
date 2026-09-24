const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function waitForLivingWorld(page) {
  await page.waitForFunction(() => !!window.WildernessLivingWorld && !!window.WildernessFactionBeliefs && !!window.WildernessConsequences);
}

test.describe('living wilderness people and information', () => {
  test('a witnessed rescue only becomes faction evidence after the witness report travels', async ({ page }) => {
    await createCharacter(page, { campaign:'2', race:'human', gender:'female' });
    await waitForLivingWorld(page);

    const result = await page.evaluate(() => {
      const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
      const start = Number(window.worldSeconds || 0);
      const incident = window.WildernessIncidents.spawnIncident('injured_traveller', { q:player.hex.q + 1, r:player.hex.r }, {
        force:true,
        provenance:{ person:'Test Traveller', origin:'Hollowmere', destination:'Hollowmere' },
      });
      const actor = window.WildernessLivingWorld.ensureActorForIncident(incident);
      window.WildernessLivingWorld.reconcileActors();
      const liveBefore = window.entities.some(e => e.wildernessActorId === actor.id);
      const evidenceBefore = window.WildernessFactionBeliefs.factionView('silverhart_kingdom').belief.evidence.player_helped_injured_traveller || 0;

      window.WildernessIncidents.resolveIncident(incident.id, 'help');
      const state = window.WildernessLivingWorld.ensureState();
      const report = state.reports.find(r => r.incidentId === incident.id && r.fact === 'player_helped_injured_traveller');
      const evidenceImmediately = window.WildernessFactionBeliefs.factionView('silverhart_kingdom').belief.evidence.player_helped_injured_traveller || 0;
      const actorAfterResolve = { ...state.actors[actor.id] };

      window.worldSeconds = report.deliverAt;
      const delivered = window.WildernessLivingWorld.processReports(window.worldSeconds);
      const evidenceAfter = window.WildernessFactionBeliefs.factionView('silverhart_kingdom').belief.evidence.player_helped_injured_traveller || 0;
      const actorAfterDelivery = { ...state.actors[actor.id] };
      window.WildernessLivingWorld.reconcileActors();
      const liveAfterArrival = window.entities.some(e => e.wildernessActorId === actor.id);

      window.worldSeconds = start;
      return {
        liveBefore,
        evidenceBefore,
        evidenceImmediately,
        evidenceAfter,
        delivered,
        reportState:report.state,
        actorStateAfterResolve:actorAfterResolve.state,
        actorStateAfterDelivery:actorAfterDelivery.state,
        liveAfterArrival,
      };
    });

    expect(result.liveBefore).toBe(true);
    expect(result.evidenceBefore).toBe(0);
    expect(result.evidenceImmediately).toBe(0);
    expect(result.actorStateAfterResolve).toBe('travelling_to_destination');
    expect(result.delivered).toBe(1);
    expect(result.reportState).toBe('delivered');
    expect(result.evidenceAfter).toBeGreaterThan(0);
    expect(result.actorStateAfterDelivery).toBe('arrived');
    expect(result.liveAfterArrival).toBe(true);
  });

  test('contradictory faction relationships survive unrelated witness reports', async ({ page }) => {
    await createCharacter(page, { campaign:'2' });
    await waitForLivingWorld(page);

    const result = await page.evaluate(() => {
      window.WildernessFactionBeliefs.recordClaim('goblin_tribe', 'working_for_us', 2, 'player_statement');
      const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
      const incident = window.WildernessIncidents.spawnIncident('stranded_merchant', { q:player.hex.q + 1, r:player.hex.r }, {
        force:true,
        provenance:{ person:'Mara Test', origin:'Hollowmere', destination:'Hollowmere' },
      });
      window.WildernessIncidents.resolveIncident(incident.id, 'escort');
      const report = window.WildernessLivingWorld.ensureState().reports.find(r => r.incidentId === incident.id);
      window.worldSeconds = report.deliverAt;
      window.WildernessLivingWorld.processReports(window.worldSeconds);

      const goblin = window.WildernessFactionBeliefs.factionView('goblin_tribe').belief;
      const silverhart = window.WildernessFactionBeliefs.factionView('silverhart_kingdom').belief;
      return {
        goblinClaim:goblin.claims.working_for_us || 0,
        goblinExposed:goblin.exposed,
        silverhartEvidence:silverhart.evidence.player_helped_stranded_merchant || 0,
      };
    });

    expect(result.goblinClaim).toBe(2);
    expect(result.goblinExposed).toBe(false);
    expect(result.silverhartEvidence).toBeGreaterThan(0);
  });

  test('off-screen wilderness people are records rather than permanently live entities', async ({ page }) => {
    await createCharacter(page, { campaign:'2' });
    await waitForLivingWorld(page);

    const result = await page.evaluate(() => {
      const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
      const incident = window.WildernessIncidents.spawnIncident('lost_child', { q:player.hex.q + 1, r:player.hex.r }, {
        force:true,
        provenance:{ origin:'Hollowmere', destination:'Hollowmere' },
      });
      const actor = window.WildernessLivingWorld.ensureActorForIncident(incident);
      window.WildernessLivingWorld.reconcileActors();
      const materialised = window.entities.find(e => e.wildernessActorId === actor.id);
      const nearCount = window.entities.filter(e => e.isWildernessActor).length;

      player.hex = { q:player.hex.q + 100, r:player.hex.r + 100 };
      window.WildernessLivingWorld.reconcileActors();
      const farCount = window.entities.filter(e => e.isWildernessActor).length;
      const persisted = !!window.WildernessLivingWorld.ensureState().actors[actor.id];
      return { hadEntity:!!materialised, nearCount, farCount, persisted, actorId:actor.id };
    });

    expect(result.hadEntity).toBe(true);
    expect(result.nearCount).toBeGreaterThan(0);
    expect(result.farCount).toBe(0);
    expect(result.persisted).toBe(true);
    expect(result.actorId).toMatch(/^wild-actor-/);
  });
});
