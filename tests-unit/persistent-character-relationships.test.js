const test = require('node:test');
const assert = require('node:assert/strict');

function freshSystem() {
  const path = require.resolve('../persistentCharacterRelationships.js');
  delete require.cache[path];
  delete global.persistentCharacterRelationships;
  delete global.persistentCharacterRelationshipState;
  delete global.getPersistentCharacterProfile;
  delete global.getPersistentCharacterRelationship;
  delete global.setPersistentCharacterRelationship;
  delete global.adjustPersistentCharacterRelationship;
  delete global.notePersistentCharacterConversation;
  delete global.recordPersistentCharacterEvent;
  global.party = [{ name: 'Hero' }];
  global.player = global.party[0];
  global.entities = [];
  return require('../persistentCharacterRelationships.js');
}

test('initial roster deliberately spans human, elf and dwarf major characters', () => {
  const sys = freshSystem();
  const roster = sys.roster();
  assert.equal(roster.length, 9);
  assert.deepEqual(new Set(roster.map(row => row.race)), new Set(['human', 'elf', 'dwarf']));
  assert.ok(roster.some(row => row.name === 'Queen Seraphine Corrin' && row.affinityMode === 'full'));
  assert.ok(roster.some(row => row.name === 'King Balrik Deepholm' && row.home === 'Kragmoor'));
  assert.ok(roster.some(row => row.name === "Queen Aelwen Sil'thandriel" && row.home === "Sil'thandriel"));
});

test('persistent state lives on protagonist so ordinary party saves carry it', () => {
  const sys = freshSystem();
  sys.noteConversation('Queen Seraphine Corrin', 'first_audience', { familiarity: 2 });
  const saved = global.party[0].persistentCharacterRelationships;
  assert.ok(saved);
  assert.equal(saved['Queen Seraphine Corrin'].familiarity, 7);
  assert.equal(global.persistentCharacterRelationshipState, saved);
});

test('legacy NPC standing remains the approval source of truth', () => {
  const sys = freshSystem();
  const queen = { name: 'Queen Seraphine Corrin', reputation: { standing: 20, knowledge: 30 } };
  global.entities.push(queen);
  assert.equal(sys.getRelationship(queen).approval, 60);
  queen.reputation.standing = -40;
  assert.equal(sys.getRelationship(queen).approval, 30);
  sys.setRelationship(queen, { approval: 75 }, 'test');
  assert.equal(queen.reputation.standing, 50);
});

test('authored events are idempotent and can deepen trust and friendship', () => {
  const sys = freshSystem();
  const before = sys.getRelationship('Queen Seraphine Corrin');
  sys.recordEvent('Queen Seraphine Corrin', 'reported_tunnel', { trust: 12, friendship: 4 });
  const once = sys.getRelationship('Queen Seraphine Corrin');
  sys.recordEvent('Queen Seraphine Corrin', 'reported_tunnel', { trust: 12, friendship: 4 });
  const twice = sys.getRelationship('Queen Seraphine Corrin');
  assert.equal(once.trust, before.trust + 12);
  assert.equal(once.friendship, before.friendship + 4);
  assert.deepEqual(twice, once);
});

test('romance and attraction stay dormant until a character is authored to full depth', () => {
  const sys = freshSystem();
  sys.adjustRelationship("Queen Aelwen Sil'thandriel", { friendship: 8, romanticBond: 30, attraction: 30 }, 'test');
  const aelwen = sys.getRelationship("Queen Aelwen Sil'thandriel");
  assert.equal(aelwen.friendship, 8);
  assert.equal(aelwen.romanticBond, 0);
  assert.equal(aelwen.attraction, 0);

  sys.adjustRelationship('Queen Seraphine Corrin', { romanticBond: 9, attraction: 6 }, 'test');
  const seraphine = sys.getRelationship('Queen Seraphine Corrin');
  assert.equal(seraphine.romanticBond, 9);
  assert.equal(seraphine.attraction, 6);
});

test('approval changed while NPC is off-map is applied when they next exist', () => {
  const sys = freshSystem();
  sys.setRelationship('Captain Ilsa Rennick', { approval: 70 }, 'off-map consequence');
  const ilsa = { name: 'Captain Ilsa Rennick', reputation: { standing: 0, knowledge: 0 } };
  global.entities.push(ilsa);
  const rel = sys.getRelationship('Captain Ilsa Rennick');
  assert.equal(rel.approval, 70);
  assert.equal(ilsa.reputation.standing, 40);
});
