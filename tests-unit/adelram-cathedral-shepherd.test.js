const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ uncounted = null, crimson = false, hunt = false, lich = null, phylacteryReturned = false } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const path = require.resolve('../adelramCathedralShepherd.js');
  delete require.cache[relPath];
  delete require.cache[path];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'adelramCathedralShepherd', 'ADEL_RAM_CATHEDRAL_SHEPHERD_BUILD',
    'vampireLeadConfirmed', 'phylacteryReturned', 'necromancerAllied', 'playerIsLich'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero' }];
  global.player = global.party[0];
  global.entities = [{ name: 'High Cleric Adelram', reputation: { standing: 0, knowledge: 0 } }];
  global.questLog = [];
  if (uncounted) global.questLog.push({ id: 'alden_uncounted', status: 'completed', resolution: uncounted });
  if (crimson) {
    global.questLog.push({ id: 'crimson_court', status: 'completed' });
    global.vampireLeadConfirmed = true;
  }
  if (hunt) global.questLog.push({ id: 'necromancer_hunt', status: 'completed' });
  if (lich) {
    global.questLog.push({ id: 'necromancer_lichdom', status: 'completed', resolution: lich });
    if (lich === 'allied') {
      global.necromancerAllied = true;
      global.playerIsLich = true;
    }
  }
  global.phylacteryReturned = phylacteryReturned;
  global.npcDialogueTrees = {
    high_cleric: npc => global.showDialogue(npc, 'Adelram', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../adelramCathedralShepherd.js');
  return { system, relationships };
}

function trustChange(options) {
  const { system, relationships } = fresh(options);
  const before = relationships.getRelationship('High Cleric Adelram');
  system.syncStoryEvents();
  const after = relationships.getRelationship('High Cleric Adelram');
  return after.trust - before.trust;
}

test('Adelram strongly values restoring names but still respects a quiet memorial', () => {
  const restored = trustChange({ uncounted: 'restore_names' });
  const quiet = trustChange({ uncounted: 'quiet_memorial' });
  assert.ok(restored > quiet);
  assert.ok(quiet > 0);
});

test('Adelram does not treat rites as an excuse for losing people administratively', () => {
  const { system } = fresh({ uncounted: 'rites_over_names' });
  const text = system.uncountedText();
  assert.match(text, /rites mattered/);
  assert.match(text, /convenient sentence for the clerk who lost the name/);
});

test('Adelram treats evidence as capable of correcting old religious texts', () => {
  const { system } = fresh({ crimson: true });
  const text = system.crimsonText();
  assert.match(text, /old description gave us one more question/);
  assert.match(text, /Faith that refuses correction/);
  assert.ok(trustChange({ crimson: true }) > 0);
});

test('alliance with Ashgrave is a major trust rupture rather than a curiosity disagreement', () => {
  const { system } = fresh({ lich: 'allied' });
  assert.ok(trustChange({ lich: 'allied' }) < -20);
  assert.match(system.necromancyText(), /chose to learn from Ashgrave rather than end him/);
  assert.match(system.necromancyText(), /study becomes use/);
});

test('stopping Ashgrave materially increases Adelram trust', () => {
  assert.ok(trustChange({ lich: 'destroyed' }) > 0);
});

test('high-trust Adelram admits religious language can hide ordinary institutional failure', () => {
  const { system, relationships } = fresh();
  relationships.setRelationship('High Cleric Adelram', { trust: 50, friendship: 30 }, 'test');
  const text = system.philosophyText();
  assert.match(text, /dangerous vocabulary/);
  assert.match(text, /failed to count to six/);
});

test('Adelram story memory is idempotent and remains friendship-only', () => {
  const { system, relationships } = fresh({ uncounted: 'restore_names', crimson: true, hunt: true, phylacteryReturned: true });
  system.syncStoryEvents();
  const once = relationships.getRelationship('High Cleric Adelram');
  system.syncStoryEvents();
  const twice = relationships.getRelationship('High Cleric Adelram');
  assert.deepEqual(twice, once);

  relationships.setRelationship('High Cleric Adelram', { trust: 80, friendship: 70, romanticBond: 80, attraction: 80 }, 'test');
  const rel = relationships.getRelationship('High Cleric Adelram');
  assert.equal(rel.trust, 80);
  assert.equal(rel.friendship, 70);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
