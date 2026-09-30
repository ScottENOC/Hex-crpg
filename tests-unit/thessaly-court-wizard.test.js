const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ vendettaResolution = null, concordanceResolution = null, withMirabel = false } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const thessalyPath = require.resolve('../thessalyCourtWizard.js');
  delete require.cache[relPath];
  delete require.cache[thessalyPath];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'thessalyCourtWizard', 'THESSALY_COURT_WIZARD_BUILD'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero' }];
  if (withMirabel) global.party.push({ name: 'Mirabel Quill' });
  global.player = global.party[0];
  global.entities = [{ name: 'Court Wizard Thessaly', reputation: { standing: 0, knowledge: 0 } }];
  global.questLog = [];
  if (vendettaResolution) {
    global.questLog.push({ id: 'wizard_vendetta', status: 'completed', resolution: vendettaResolution });
  }
  if (concordanceResolution) {
    global.questLog.push({ id: 'mirabel_unquiet_concordance', status: 'completed', resolution: concordanceResolution });
  }
  global.npcDialogueTrees = {
    royal_wizard: npc => global.showDialogue(npc, 'Wizard', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};
  global.noteCompanionConversation = () => {};

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../thessalyCourtWizard.js');
  return { system, relationships };
}

test('Thessaly interprets the three Noble Grudge outcomes differently', () => {
  let setup = fresh({ vendettaResolution: 'wizard' });
  assert.match(setup.system.vendettaFollowupText(), /not entirely wrong/);
  assert.match(setup.system.vendettaFollowupText(), /gave it to me/);

  setup = fresh({ vendettaResolution: 'queen' });
  assert.match(setup.system.vendettaFollowupText(), /correct place/);
  assert.match(setup.system.vendettaFollowupText(), /scrutinised/);

  setup = fresh({ vendettaResolution: 'noble' });
  assert.match(setup.system.vendettaFollowupText(), /leverage/);
  assert.match(setup.system.vendettaFollowupText(), /picked a side/);
});

test('vendetta follow-up deepens a supportive relationship idempotently', () => {
  const { system, relationships } = fresh({ vendettaResolution: 'wizard' });
  const before = relationships.getRelationship('Court Wizard Thessaly');
  system.recordVendettaFollowup();
  const once = relationships.getRelationship('Court Wizard Thessaly');
  system.recordVendettaFollowup();
  const twice = relationships.getRelationship('Court Wizard Thessaly');

  assert.ok(once.trust > before.trust);
  assert.ok(once.friendship > before.friendship);
  assert.deepEqual(twice, once);
});

test('Thessaly distinguishes responsible restriction from unrestricted Concordance access', () => {
  function reaction(resolution) {
    const setup = fresh({ concordanceResolution: resolution });
    const before = setup.relationships.getRelationship('Court Wizard Thessaly');
    const text = setup.system.concordanceReactionText();
    setup.system.recordConcordanceReaction();
    const after = setup.relationships.getRelationship('Court Wizard Thessaly');
    return { text, trustChange: after.trust - before.trust };
  }

  const sealed = reaction('preserve_sealed');
  const open = reaction('preserve_open');
  const destroyed = reaction('destroy_appendix');
  const experiment = reaction('experiment');

  assert.match(sealed.text, /Restriction is not destruction/);
  assert.ok(sealed.trustChange > 0);
  assert.match(open.text, /Open access/);
  assert.ok(open.trustChange < 0);
  assert.match(destroyed.text, /controlled copy/);
  assert.ok(destroyed.trustChange > 0);
  assert.match(experiment.text, /successful one is often more dangerous/);
  assert.ok(experiment.trustChange < 0);
});

test('Thessaly has a personal philosophy of dangerous archives, not merely a quest response', () => {
  const { system, relationships } = fresh();
  assert.match(system.dangerousKnowledgeText(), /professional answer/);

  relationships.setRelationship('Court Wizard Thessaly', { trust: 30, friendship: 5 }, 'test');
  assert.match(system.dangerousKnowledgeText(), /curate themselves into innocence/);

  relationships.setRelationship('Court Wizard Thessaly', { trust: 50, friendship: 25 }, 'test');
  assert.match(system.dangerousKnowledgeText(), /temptation and the body count/);
});

test('Mirabel can be present for Thessaly reacting to the companion quest without changing authoring depth', () => {
  const { system, relationships } = fresh({ concordanceResolution: 'preserve_sealed', withMirabel: true });
  system.recordConcordanceReaction();
  const rel = relationships.getRelationship('Court Wizard Thessaly');
  assert.ok(rel.trust > 6);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});

test('Thessaly remains friendship-authored even at high personal trust', () => {
  const { relationships } = fresh();
  relationships.setRelationship('Court Wizard Thessaly', {
    trust: 80,
    friendship: 70,
    romanticBond: 80,
    attraction: 80,
  }, 'test');
  const rel = relationships.getRelationship('Court Wizard Thessaly');
  assert.equal(rel.trust, 80);
  assert.equal(rel.friendship, 70);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
