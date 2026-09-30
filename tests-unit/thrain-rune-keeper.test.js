const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ race = 'human', trustQuest = null, teachQuest = null, runesmithing = false, lastHold = null } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const path = require.resolve('../thrainRuneKeeper.js');
  delete require.cache[relPath];
  delete require.cache[path];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'thrainRuneKeeper', 'THRAIN_RUNE_KEEPER_BUILD'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero', race, skills: runesmithing ? { runesmithing: 1 } : {} }];
  global.player = global.party[0];
  global.entities = [{ name: 'Thrain Emberhand', reputation: { standing: 0, knowledge: 0 } }];
  global.questLog = [];
  if (trustQuest) global.questLog.push({ id: 'kragmoor_runesmith_trust', status: trustQuest });
  if (teachQuest) global.questLog.push({ id: 'kragmoor_runesmith_teach', status: teachQuest });
  if (lastHold) global.questLog.push({ id: 'balrik_last_hold', status: 'completed', resolution: lastHold });
  global.npcDialogueTrees = {
    deepholds_runesmith: npc => global.showDialogue(npc, 'Thrain', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../thrainRuneKeeper.js');
  return { system, relationships };
}

test('The Forge Trusts a Stranger creates personal trust, not only kingdom standing', () => {
  const { system, relationships } = fresh({ trustQuest: 'completed' });
  const before = relationships.getRelationship('Thrain Emberhand');
  system.syncStoryEvents();
  const after = relationships.getRelationship('Thrain Emberhand');
  assert.ok(after.trust > before.trust);
  assert.ok(after.friendship > before.friendship);
  assert.match(system.trustQuestText(), /shard was never the point/);
});

test('Thrain treats dwarven birthright as inherited responsibility rather than automatic mastery', () => {
  const { system } = fresh({ race: 'dwarf', teachQuest: 'completed', runesmithing: true });
  const text = system.teachingText();
  assert.match(text, /opened the door sooner/);
  assert.match(text, /Blood does not straighten a bad rune/);
});

test('an outsider can become a legitimate heir to dwarven craft without erasing its origin', () => {
  const { system, relationships } = fresh({ race: 'human', trustQuest: 'completed', teachQuest: 'completed', runesmithing: true });
  system.syncStoryEvents();
  const rel = relationships.getRelationship('Thrain Emberhand');
  assert.ok(rel.trust >= 20);
  const text = system.teachingText();
  assert.match(text, /without treating it like loot/);
  assert.match(text, /Blood is one way\. Conduct is another/);
});

test('Thrain prefers bounded reclamation but can respect a decision to seal the Deep', () => {
  let setup = fresh({ lastHold: 'bounded_reclamation' });
  assert.match(setup.system.lastHoldText(), /policy I would have chosen/);
  assert.deepEqual(setup.system.lastHoldDelta('bounded_reclamation'), { trust: 8, friendship: 5 });

  setup = fresh({ lastHold: 'seal_below' });
  assert.match(setup.system.lastHoldText(), /I would have surveyed it/);
  assert.match(setup.system.lastHoldText(), /earned the right/);
  assert.deepEqual(setup.system.lastHoldDelta('seal_below'), { trust: 3, friendship: 2 });
});

test('sync does not duplicate Last Hold consequences owned by Balrik quest module', () => {
  const { system, relationships } = fresh({ lastHold: 'bounded_reclamation' });
  const before = relationships.getRelationship('Thrain Emberhand');
  system.syncStoryEvents();
  const after = relationships.getRelationship('Thrain Emberhand');
  assert.equal(after.trust, before.trust);
  assert.equal(after.friendship, before.friendship);
});

test('high-trust Thrain distinguishes living tradition from unexamined gatekeeping', () => {
  const { system, relationships } = fresh();
  relationships.setRelationship('Thrain Emberhand', { trust: 50, friendship: 30 }, 'test');
  const text = system.philosophyText();
  assert.match(text, /call something sacred/);
  assert.match(text, /closed door/);
  assert.match(text, /old habit/);
});

test('Thrain explains cultural ownership differently to dwarves and outsiders', () => {
  let setup = fresh({ race: 'dwarf' });
  assert.match(setup.system.inheritanceText(), /receive that labour before you have earned it/);
  assert.match(setup.system.inheritanceText(), /become worthy/);

  setup = fresh({ race: 'human' });
  assert.match(setup.system.inheritanceText(), /dwarves paid the cost of keeping it alive/);
  assert.match(setup.system.inheritanceText(), /Do not scrape the maker’s mark off/);
});

test('Thrain memory is idempotent and remains friendship-only', () => {
  const { system, relationships } = fresh({ race: 'human', trustQuest: 'completed', teachQuest: 'completed', runesmithing: true });
  system.syncStoryEvents();
  const once = relationships.getRelationship('Thrain Emberhand');
  system.syncStoryEvents();
  const twice = relationships.getRelationship('Thrain Emberhand');
  assert.deepEqual(twice, once);

  relationships.setRelationship('Thrain Emberhand', { trust: 80, friendship: 70, romanticBond: 80, attraction: 80 }, 'test');
  const rel = relationships.getRelationship('Thrain Emberhand');
  assert.equal(rel.trust, 80);
  assert.equal(rel.friendship, 70);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
