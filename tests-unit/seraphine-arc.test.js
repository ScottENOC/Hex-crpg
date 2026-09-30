const test = require('node:test');
const assert = require('node:assert/strict');

const MODULE = '../seraphineArc.js';

function boot({ surfacePower = 40, influence = 40, kingdomStanding = 0, ironbondStanding = 0, goblinStanding = 0 } = {}) {
  delete require.cache[require.resolve(MODULE)];
  global.window = global;
  delete global.document;
  global.worldSeconds = 0;
  global.party = [{ name: 'Hero', gold: 100 }];
  global.player = global.party[0];
  global.questLog = [];
  global.factions = {
    silverhart_kingdom: { standing: kingdomStanding },
    ironbond_company: { standing: ironbondStanding, merchantInfluence: { silverhart_kingdom: influence } },
    goblin_tribe: { standing: goblinStanding },
  };
  global.ironbondArc = { surfacePower, playerSide: null };
  global.getSurfacePower = () => global.ironbondArc.surfacePower;
  global.adjustSurfacePower = d => { global.ironbondArc.surfacePower = Math.max(0, Math.min(100, global.ironbondArc.surfacePower + d)); };
  global.adjustReputation = (faction, d) => { faction.standing = Math.max(-100, Math.min(100, Number(faction.standing || 0) + d)); };
  global.adjustRegionStat = () => {};
  global.gainExp = () => {};
  global.showMessage = () => {};
  global.showDialogue = (npc, text, options) => { global.__lastDialogue = { npc, text, options }; return global.__lastDialogue; };
  global.adjustCompanionRelationship = () => {};
  global.setIronbondArcSide = side => {
    if (global.ironbondArc.playerSide) return false;
    global.ironbondArc.playerSide = side;
    return true;
  };
  global.npcDialogueTrees = {};
  delete global.chancellorTunnelReportedToQueen;
  delete global.phylacteryReturned;
  delete global.seraphineRoyalAgent;
  delete global.seraphineIronbondCounterweight;
  const api = require(MODULE);
  return { api, hero: global.party[0] };
}

function consultAll(api, q) {
  const map = {
    seraphine_crown_and_company: ['chancellor', 'petra'],
    seraphine_border_decree: ['hart', 'marta'],
    seraphine_what_crown_may_hide: ['thessaly', 'adelram'],
  };
  for (const key of map[q.id]) api.markConsultation(key, { name: key });
}

test('personal confidence is separate from kingdom standing', () => {
  const { api } = boot({ kingdomStanding: 65 });
  const state = api.ensureState();
  assert.equal(state.confidence, 0);
  api.record('private_trust', { confidence: 20 }, 'private trust');
  assert.equal(api.getState().confidence, 20);
  assert.equal(global.factions.silverhart_kingdom.standing, 65);
});

test('existing world consequences seed the arc once, not every refresh', () => {
  const { api } = boot();
  global.chancellorTunnelReportedToQueen = true;
  global.phylacteryReturned = true;
  api.syncExistingConsequences();
  const once = { ...api.getState() };
  api.syncExistingConsequences();
  const twice = api.getState();
  assert.equal(twice.confidence, once.confidence);
  assert.equal(twice.centralisation, once.centralisation);
  assert.equal(twice.history.length, once.history.length);
});

test('Crown and Company requires both outside perspectives before resolution', () => {
  const { api } = boot();
  const q = api.ensureQuest(api.questIds.company);
  assert.ok(q);
  assert.equal(api.readyToResolve(q), false);
  api.markConsultation('chancellor', { name: 'Chancellor Merric Vane' });
  assert.equal(api.readyToResolve(q), false);
  api.markConsultation('petra', { name: 'Petra Voss' });
  assert.equal(api.readyToResolve(q), true);
});

test('public audit restrains the Crown and weakens Ironbond without destroying it', () => {
  const { api } = boot({ surfacePower: 60, influence: 60 });
  const q = api.ensureQuest(api.questIds.company);
  consultAll(api, q);
  assert.equal(api.completeQuest('public_audit'), true);
  assert.equal(q.effectiveResolution, 'public_audit');
  assert.ok(api.getState().restraint > 10);
  assert.ok(global.ironbondArc.surfacePower > 0 && global.ironbondArc.surfacePower < 60);
});

test('emergency seizure strongly centralises the Crown and hits Ironbond harder', () => {
  const { api } = boot({ surfacePower: 70, influence: 70 });
  const q = api.ensureQuest(api.questIds.company);
  consultAll(api, q);
  api.completeQuest('emergency_seizure');
  const state = api.getState();
  assert.ok(state.centralisation >= 30);
  assert.ok(state.restraint < 0);
  assert.equal(global.ironbondArc.surfacePower, 45);
});

test('trusting Seraphine produces different autonomous choices after different development', () => {
  let b = boot({ surfacePower: 50 });
  b.api.record('seed_fair', { restraint: 35, centralisation: -5 });
  let q = b.api.ensureQuest(b.api.questIds.company);
  consultAll(b.api, q);
  b.api.completeQuest('queen_decides', { queenDecides: true });
  assert.equal(q.effectiveResolution, 'public_audit');

  b = boot({ surfacePower: 50 });
  b.api.record('seed_hard', { restraint: -35, centralisation: 35 });
  q = b.api.ensureQuest(b.api.questIds.company);
  consultAll(b.api, q);
  b.api.completeQuest('queen_decides', { queenDecides: true });
  assert.equal(q.effectiveResolution, 'emergency_seizure');
});

test('later royal chapters wait twelve in-game hours', () => {
  const { api } = boot();
  let q = api.ensureQuest(api.questIds.company);
  consultAll(api, q);
  api.completeQuest('public_audit');
  assert.equal(api.canStart(api.questIds.border), false);
  global.worldSeconds += api.chapterDelay - 1;
  assert.equal(api.canStart(api.questIds.border), false);
  global.worldSeconds += 1;
  assert.equal(api.canStart(api.questIds.border), true);
});

test('repeated harsh choices can turn Seraphine genuinely ruthless', () => {
  const { api } = boot({ surfacePower: 70, influence: 70 });
  let q = api.ensureQuest(api.questIds.company);
  consultAll(api, q);
  api.completeQuest('emergency_seizure');

  global.worldSeconds += api.chapterDelay;
  q = api.ensureQuest(api.questIds.border);
  consultAll(api, q);
  api.completeQuest('collective_penalties');

  global.worldSeconds += api.chapterDelay;
  q = api.ensureQuest(api.questIds.secrets);
  consultAll(api, q);
  api.completeQuest('royal_secrets');

  assert.equal(api.posture(), 'ruthless');
  assert.match(api.postureText(), /hesitation|danger|court/i);
});

test('repeated restrained choices can produce a rule-bound restrained Queen', () => {
  const { api } = boot();
  let q = api.ensureQuest(api.questIds.company);
  consultAll(api, q);
  api.completeQuest('public_audit');

  global.worldSeconds += api.chapterDelay;
  q = api.ensureQuest(api.questIds.border);
  consultAll(api, q);
  api.completeQuest('equal_law');

  global.worldSeconds += api.chapterDelay;
  q = api.ensureQuest(api.questIds.secrets);
  consultAll(api, q);
  api.completeQuest('charter_review');

  assert.equal(api.posture(), 'restrained');
});

test('player can remain loyal to a ruthless Queen', () => {
  const { api } = boot();
  api.record('hard_state', { restraint: -50, centralisation: 60 });
  assert.equal(api.chooseAlignment('crown_loyalist'), true);
  assert.equal(api.getState().alignment, 'crown_loyalist');
  assert.equal(global.seraphineRoyalAgent, true);
  assert.ok(api.getState().confidence > 0);
});

test('Ironbond counterweight can be chosen without silently switching an existing Crown commitment', () => {
  const { api } = boot();
  global.ironbondArc.playerSide = 'crown';
  const beforePower = global.ironbondArc.surfacePower;
  assert.equal(api.chooseAlignment('ironbond_counterweight'), true);
  assert.equal(api.getState().alignment, 'ironbond_counterweight');
  assert.equal(global.ironbondArc.playerSide, 'crown');
  assert.equal(global.seraphineIronbondCounterweight, true);
  assert.ok(global.ironbondArc.surfacePower > beforePower);
});

test('royal decisions expose knowledge-gated companion review without numeric approval', () => {
  const { api } = boot();
  global.party.push({ name: 'Wren Talbot' });
  global.companionDecisionAnticipation = {
    analyseChoice: (_decision, outcome) => outcome === 'emergency_seizure'
      ? [{ name: 'Wren Talbot', direction: 'tension' }]
      : [],
    impressionText: impression => `${impression.name}: this may sit uneasily with what you have learned.`,
  };
  const q = api.ensureQuest(api.questIds.company);
  consultAll(api, q);
  api.openQuestHub({ name: 'Queen Seraphine Corrin' });
  const consider = global.__lastDialogue.options.find(o => o.label === 'Consider your companions.');
  assert.ok(consider);
  consider.action();
  const emergency = global.__lastDialogue.options.find(o => /Freeze Company assets/.test(o.label));
  assert.ok(emergency);
  emergency.action();
  assert.match(global.__lastDialogue.text, /Wren Talbot/);
  assert.doesNotMatch(global.__lastDialogue.text, /[+-]\d+|approval score|friendship score|trust score/i);
});
