const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ reyna = null, disciple = false, hunt = false, lich = null, reynaState = null } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const path = require.resolve('../ilsaWatchCaptain.js');
  delete require.cache[relPath];
  delete require.cache[path];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'ilsaWatchCaptain', 'ILSA_WATCH_CAPTAIN_BUILD', 'reynaEmptyBlind',
    'necromancerAllied', 'playerIsLich'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero' }];
  global.player = global.party[0];
  global.entities = [{ name: 'Captain Ilsa Rennick', reputation: { standing: 0, knowledge: 0 } }];
  global.questLog = [];
  if (reyna) global.questLog.push({ id: 'reyna_empty_blind', status: 'completed', resolution: reyna });
  if (disciple) global.questLog.push({ id: 'disciple_exposed', status: 'completed' });
  if (hunt) global.questLog.push({ id: 'necromancer_hunt', status: 'completed' });
  if (lich) {
    global.questLog.push({ id: 'necromancer_lichdom', status: 'completed', resolution: lich });
    if (lich === 'allied') {
      global.necromancerAllied = true;
      global.playerIsLich = true;
    }
  }
  if (reynaState) global.reynaEmptyBlind = { getArcState: () => ({ ...reynaState }) };
  global.npcDialogueTrees = {
    reddale_captain: npc => global.showDialogue(npc, 'Ilsa', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../ilsaWatchCaptain.js');
  return { system, relationships };
}

function trustChange(options) {
  const { system, relationships } = fresh(options);
  const before = relationships.getRelationship('Captain Ilsa Rennick');
  system.syncStoryEvents();
  const after = relationships.getRelationship('Captain Ilsa Rennick');
  return after.trust - before.trust;
}

test('Ilsa prefers a protected witness deal to either off-books manipulation or disappearance', () => {
  const witness = trustChange({ reyna: 'witness_deal' });
  const doubleAgent = trustChange({ reyna: 'double_agent' });
  const disappear = trustChange({ reyna: 'let_disappear' });
  assert.ok(witness > 0);
  assert.ok(doubleAgent < 0);
  assert.ok(disappear < doubleAgent);
});

test('Ilsa can support prosecution without ignoring coercion', () => {
  const { system } = fresh({ reyna: 'turn_in' });
  assert.ok(trustChange({ reyna: 'turn_in' }) > 0);
  const text = system.emptyBlindText();
  assert.match(text, /public trial was defensible/);
  assert.match(text, /court hears the coercion/);
});

test('Ilsa articulates why guaranteed punishment can make institutions blind', () => {
  const { system, relationships } = fresh();
  relationships.setRelationship('Captain Ilsa Rennick', { trust: 50, friendship: 30 }, 'test');
  const text = system.philosophyText();
  assert.match(text, /teaching them exactly what will happen/);
  assert.match(text, /frightened people avoid it/);
});

test('Ilsa treats alliance with Ashgrave as an operational betrayal', () => {
  const { system, relationships } = fresh({ lich: 'allied' });
  system.syncStoryEvents();
  assert.equal(relationships.getRelationship('Captain Ilsa Rennick').trust, 0);
  const text = system.necromancerText();
  assert.match(text, /used that access to join him/);
  assert.match(text, /operational fact/);
});

test('stopping Ashgrave strongly increases Ilsa trust', () => {
  assert.ok(trustChange({ lich: 'destroyed' }) >= 10);
});

test('Ilsa can recognise Reyna learning conditional institutional trust', () => {
  const { system } = fresh({
    reyna: 'witness_deal',
    reynaState: { institutions: 'conditional_trust', institutionalTrust: 20, reliance: 'learning_to_rely', interdependence: 20 },
  });
  const text = system.reynaText();
  assert.match(text, /asking an institution for help/);
  assert.match(text, /not the same thing as surrendering judgement/);
});

test('Ilsa story memory is idempotent and remains friendship-only', () => {
  const { system, relationships } = fresh({ reyna: 'witness_deal', disciple: true, hunt: true });
  system.syncStoryEvents();
  const once = relationships.getRelationship('Captain Ilsa Rennick');
  system.syncStoryEvents();
  const twice = relationships.getRelationship('Captain Ilsa Rennick');
  assert.deepEqual(twice, once);

  relationships.setRelationship('Captain Ilsa Rennick', { trust: 80, friendship: 70, romanticBond: 80, attraction: 80 }, 'test');
  const rel = relationships.getRelationship('Captain Ilsa Rennick');
  assert.equal(rel.trust, 80);
  assert.equal(rel.friendship, 70);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
