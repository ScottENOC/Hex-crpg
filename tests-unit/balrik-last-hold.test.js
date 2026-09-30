const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ infestationStatus = 'completed', warningRead = false, withMirabel = false } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const balrikPath = require.resolve('../balrikLastHold.js');
  delete require.cache[relPath];
  delete require.cache[balrikPath];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'balrikLastHold', 'BALRIK_LAST_HOLD_BUILD', 'campaign2SunkenDeepPolicy',
    'campaign2SunkenDeepWarningRead', 'mirabelUnquietConcordance'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.questLog = [{ id: 'deepholds_infestation', status: infestationStatus }];
  global.party = [{ name: 'Hero' }];
  if (withMirabel) global.party.push({ name: 'Mirabel Quill' });
  global.player = global.party[0];
  global.entities = [
    { name: 'King Balrik Deepholm', reputation: { standing: 0, knowledge: 0 } },
    { name: 'Thrain Emberhand', reputation: { standing: 0, knowledge: 0 } },
  ];
  global.npcDialogueTrees = {
    dwarf_king: npc => global.showDialogue(npc, 'King', [{ label: 'Leave.', action: () => {} }]),
    deepholds_runesmith: npc => global.showDialogue(npc, 'Smith', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};
  global.showMessage = () => {};
  global.readSunkenDeepWarning = () => 'read';
  global.noteCompanionConversation = () => {};
  global.worldSeconds = 1000;
  global.campaign2SunkenDeepWarningRead = warningRead;

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../balrikLastHold.js');
  return { system, relationships };
}

test('The Last Hold needs both the cleared lower tunnels and the old warning', () => {
  let setup = fresh({ infestationStatus: 'active', warningRead: true });
  assert.equal(setup.system.canStart(), false);
  assert.equal(setup.system.ensureQuest(), null);

  setup = fresh({ infestationStatus: 'completed', warningRead: false });
  assert.equal(setup.system.canStart(), false);
  setup.system.markWarningRead();
  assert.equal(setup.system.canStart(), true);
  assert.equal(setup.system.ensureQuest().title, 'The Last Hold');
});

test('the wrapped Sunken Deep plaque records the discovery for Balrik', () => {
  const { system } = fresh({ warningRead: false });
  assert.equal(global.campaign2SunkenDeepWarningRead, false);
  assert.equal(global.readSunkenDeepWarning(), 'read');
  assert.equal(global.campaign2SunkenDeepWarningRead, true);
  assert.equal(system.canStart(), true);
});

test('reporting the warning creates personal history rather than only faction standing', () => {
  const { system, relationships } = fresh({ warningRead: true });
  const before = relationships.getRelationship('King Balrik Deepholm');
  const q = system.reportWarning();
  const after = relationships.getRelationship('King Balrik Deepholm');

  assert.equal(q.warningReported, true);
  assert.equal(q.stage, 'choose_policy');
  assert.ok(after.trust > before.trust);
  assert.ok(after.friendship > before.friendship);
});

test('survey policy earns the strongest Balrik trust while all three policies preserve agency', () => {
  function resolveFresh(resolution) {
    const setup = fresh({ warningRead: true });
    setup.system.reportWarning();
    const before = setup.relationships.getRelationship('King Balrik Deepholm');
    const result = setup.system.resolve(resolution);
    const after = setup.relationships.getRelationship('King Balrik Deepholm');
    return { result, gain: after.trust - before.trust };
  }

  const seal = resolveFresh('seal_below');
  const survey = resolveFresh('survey_only');
  const reclaim = resolveFresh('bounded_reclamation');

  assert.equal(seal.result.quest.status, 'completed');
  assert.equal(seal.result.quest.resolution, 'seal_below');
  assert.equal(seal.result.quest.description.includes('re-sealed'), true);
  assert.equal(survey.result.quest.resolution, 'survey_only');
  assert.equal(reclaim.result.quest.resolution, 'bounded_reclamation');
  assert.ok(survey.gain > seal.gain);
  assert.ok(survey.gain > reclaim.gain);
});

test('bounded reclamation creates a narrow world policy rather than unrestricted mining', () => {
  const { system } = fresh({ warningRead: true });
  system.reportWarning();
  system.resolve('bounded_reclamation');
  assert.deepEqual(global.campaign2SunkenDeepPolicy, {
    mode: 'bounded_reclamation',
    survey: true,
    extraction: true,
    extractionLimit: 'upper_safe_seam_only',
    wardedThreshold: true,
    resolution: 'bounded_reclamation',
    decidedAt: 1000,
  });
});

test('Thrain counsel and relationship credit are idempotent', () => {
  const { system, relationships } = fresh({ warningRead: true });
  system.reportWarning();
  const before = relationships.getRelationship('Thrain Emberhand');
  system.noteThrainCounsel();
  const once = relationships.getRelationship('Thrain Emberhand');
  system.noteThrainCounsel();
  const twice = relationships.getRelationship('Thrain Emberhand');

  assert.ok(once.trust > before.trust);
  assert.ok(once.friendship > before.friendship);
  assert.deepEqual(twice, once);
});

test('Mirabel counsel remembers the scholarship developed in her companion chapter', () => {
  const { system } = fresh({ warningRead: true, withMirabel: true });
  system.reportWarning();

  global.mirabelUnquietConcordance = { getArcState: () => ({ scholarship: 'unfettered_scholar' }) };
  assert.match(system.mirabelCounselText(), /Study it first/);

  global.mirabelUnquietConcordance = { getArcState: () => ({ scholarship: 'responsible_scholar' }) };
  assert.match(system.mirabelCounselText(), /stopping conditions/);

  const q = system.noteMirabelCounsel();
  assert.equal(q.mirabelCounselHeard, true);
});

test('Balrik remains friendship-authored; The Last Hold does not silently add romance', () => {
  const { system, relationships } = fresh({ warningRead: true });
  system.reportWarning();
  system.resolve('survey_only');
  relationships.adjustRelationship('King Balrik Deepholm', {
    friendship: 10,
    romanticBond: 70,
    attraction: 70,
  }, 'test');
  const rel = relationships.getRelationship('King Balrik Deepholm');
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
