const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ wrenResolution = null, aldricResolution = null, infiltration = false, pitchComplete = false } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const petraPath = require.resolve('../petraIronbondFactor.js');
  delete require.cache[relPath];
  delete require.cache[petraPath];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'petraIronbondFactor', 'PETRA_IRONBOND_FACTOR_BUILD', 'ironbondArc'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero' }];
  global.player = global.party[0];
  global.entities = [{ name: 'Guildmaster Petra Voss', reputation: { standing: 0, knowledge: 0 } }];
  global.questLog = [];
  if (wrenResolution) global.questLog.push({ id: 'wren_price_of_silence', status: 'completed', resolution: wrenResolution });
  if (aldricResolution) global.questLog.push({ id: 'aldric_broken_vigil', status: 'completed', resolution: aldricResolution });
  if (pitchComplete) global.questLog.push({ id: 'ironbond_pitch', status: 'completed' });
  global.ironbondArc = { crownInfiltrationRevealed: infiltration };
  global.npcDialogueTrees = {
    reddale_guildmaster: npc => global.showDialogue(npc, 'Petra', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../petraIronbondFactor.js');
  return { system, relationships };
}

function storyTrustChange(options) {
  const { system, relationships } = fresh(options);
  const before = relationships.getRelationship('Guildmaster Petra Voss');
  system.syncStoryEvents();
  const after = relationships.getRelationship('Guildmaster Petra Voss');
  return after.trust - before.trust;
}

test('Petra distinguishes protecting a witness from using the murder trail as leverage', () => {
  const protectedPetra = storyTrustChange({ wrenResolution: 'protect_petra' });
  const proofFirst = storyTrustChange({ wrenResolution: 'proof' });
  const leverage = storyTrustChange({ wrenResolution: 'leverage' });
  assert.ok(protectedPetra > proofFirst);
  assert.ok(proofFirst > 0);
  assert.ok(leverage < 0);
});

test('Petra does not approve of Ironbond buying silence over Aldric even though the Company benefits', () => {
  const { system } = fresh({ aldricResolution: 'buried_for_money' });
  assert.ok(storyTrustChange({ aldricResolution: 'buried_for_money' }) < 0);
  assert.match(system.brokenVigilText(), /turning responsibility into a price/);
  assert.match(system.brokenVigilText(), /Ironbond benefiting from silence/);
});

test('Petra accepts public accountability as a consequence of treating contracts as promises', () => {
  const { system } = fresh({ aldricResolution: 'public_accountability' });
  const text = system.brokenVigilText();
  assert.match(text, /made my month considerably worse/);
  assert.match(text, /contracts treated as promises/);
  assert.ok(storyTrustChange({ aldricResolution: 'public_accountability' }) > 0);
});

test('Petra can become an internal reformer without becoming anti-Ironbond', () => {
  const { system } = fresh({
    wrenResolution: 'proof',
    aldricResolution: 'spare_patrol',
    infiltration: true,
  });
  assert.equal(system.factorStance(), 'internal_reformer');
  assert.match(system.stanceText(), /parts worth keeping/);
  assert.match(system.stanceText(), /impossible to deny/);
});

test('Petra’s high-trust philosophy admits that protecting current workers also protects her own desk', () => {
  const { system, relationships } = fresh();
  relationships.setRelationship('Guildmaster Petra Voss', { trust: 50, friendship: 30 }, 'test');
  const text = system.philosophyText();
  assert.match(text, /should not lose their livelihoods/);
  assert.match(text, /protects the desk I am sitting behind/);
  assert.match(text, /records/);
});

test('revealed Ironbond infiltration does not make Petra treat every worker as culpable', () => {
  const { system } = fresh({ infiltration: true });
  const text = system.crownInfiltrationText();
  assert.match(text, /contracts as camouflage/);
  assert.match(text, /every clerk, guard and carter/);
  assert.match(text, /demolition/);
});

test('Petra story memory is idempotent and she remains friendship-only', () => {
  const { system, relationships } = fresh({
    wrenResolution: 'protect_petra',
    aldricResolution: 'spare_patrol',
    pitchComplete: true,
  });
  system.syncStoryEvents();
  const once = relationships.getRelationship('Guildmaster Petra Voss');
  system.syncStoryEvents();
  const twice = relationships.getRelationship('Guildmaster Petra Voss');
  assert.deepEqual(twice, once);

  relationships.setRelationship('Guildmaster Petra Voss', {
    trust: 80,
    friendship: 70,
    romanticBond: 80,
    attraction: 80,
  }, 'test');
  const rel = relationships.getRelationship('Guildmaster Petra Voss');
  assert.equal(rel.trust, 80);
  assert.equal(rel.friendship, 70);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
