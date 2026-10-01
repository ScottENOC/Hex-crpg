const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ boundaryResolution = null, accordResolution = null, trailStatus = null, withFenn = false, fennState = null } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const nessaPath = require.resolve('../nessaGroveWarden.js');
  delete require.cache[relPath];
  delete require.cache[nessaPath];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'nessaGroveWarden', 'NESSA_GROVE_WARDEN_BUILD', 'fennLivingBoundary'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero' }];
  if (withFenn) global.party.push({ name: 'Fenn Oakheart' });
  global.player = global.party[0];
  global.entities = [{ name: 'Elder Nessa Wren', reputation: { standing: 0, knowledge: 0 } }];
  global.questLog = [];
  if (boundaryResolution) global.questLog.push({ id: 'fenn_living_boundary', status: 'completed', resolution: boundaryResolution });
  if (accordResolution) global.questLog.push({ id: 'aelwen_living_accord', status: 'completed', resolution: accordResolution });
  if (trailStatus) global.questLog.push({ id: 'unicorn_tracking', status: trailStatus, resolution: null });
  global.npcDialogueTrees = {
    elder_nessa_wren: npc => global.showDialogue(npc, 'Nessa', [{ label: 'Leave.', action: () => {} }]),
  };
  global.showDialogue = () => {};
  if (fennState) global.fennLivingBoundary = { getArcState: () => ({ ...fennState }) };

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../nessaGroveWarden.js');
  return { system, relationships };
}

function storyTrustChange(options) {
  const { system, relationships } = fresh(options);
  const before = relationships.getRelationship('Elder Nessa Wren');
  system.syncStoryEvents();
  const after = relationships.getRelationship('Elder Nessa Wren');
  return after.trust - before.trust;
}

test('Nessa distinguishes active stewardship from simply draining the marsh', () => {
  const managed = storyTrustChange({ boundaryResolution: 'managed_spillway' });
  const drained = storyTrustChange({ boundaryResolution: 'drain_marsh' });
  assert.ok(managed > 0);
  assert.ok(drained < 0);
  assert.ok(managed > Math.abs(drained));
});

test('Nessa can support preserving the marsh while still naming the cost to Mac', () => {
  const { system } = fresh({ boundaryResolution: 'preserve_marsh' });
  const text = system.livingBoundaryText();
  assert.match(text, /Mac’s winter does not become imaginary/);
  assert.match(text, /responsibility/);
});

test('Nessa treats ecological movement and political consent as different things', () => {
  let setup = fresh({ accordResolution: 'joint_stewardship' });
  assert.match(setup.system.livingAccordText(), /flexibility itself is part of the promise/);

  setup = fresh({ accordResolution: 'press_silverhart' });
  assert.match(setup.system.livingAccordText(), /Need explains trespass/);
  assert.ok(storyTrustChange({ accordResolution: 'press_silverhart' }) < 0);
});

test('The Silver Trail reinforces Nessa’s respect for the unicorn’s independent agency', () => {
  const { system, relationships } = fresh({ trailStatus: 'completed' });
  const before = relationships.getRelationship('Elder Nessa Wren');
  system.syncStoryEvents();
  const after = relationships.getRelationship('Elder Nessa Wren');
  assert.match(system.silverTrailText(), /she chose what happened next/);
  assert.match(system.silverTrailText(), /another creature’s trust/);
  assert.ok(after.trust > before.trust);
});

test('Nessa wants Fenn to develop judgement rather than reproduce her answers', () => {
  const { system } = fresh({
    boundaryResolution: 'managed_spillway',
    withFenn: true,
    fennState: { stewardship: 40, independence: 50, landEthic: 'interventionist_steward', voice: 'self_directed' },
  });
  assert.match(system.fennText(), /conclusions instead of requests for permission/);
  assert.match(system.fennText(), /younger copy of me/);
});

test('authored story events are idempotent and Nessa remains friendship-only', () => {
  const { system, relationships } = fresh({ boundaryResolution: 'managed_spillway', trailStatus: 'completed' });
  system.syncStoryEvents();
  const once = relationships.getRelationship('Elder Nessa Wren');
  system.syncStoryEvents();
  const twice = relationships.getRelationship('Elder Nessa Wren');
  assert.deepEqual(twice, once);

  relationships.setRelationship('Elder Nessa Wren', {
    trust: 80,
    friendship: 70,
    romanticBond: 80,
    attraction: 80,
  }, 'test');
  const rel = relationships.getRelationship('Elder Nessa Wren');
  assert.equal(rel.trust, 80);
  assert.equal(rel.friendship, 70);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});

test('Nessa’s high-trust philosophy admits elders can mistake habit for wisdom', () => {
  const { system, relationships } = fresh();
  relationships.setRelationship('Elder Nessa Wren', { trust: 50, friendship: 30 }, 'test');
  assert.match(system.philosophyText(), /call fear ‘patience’ and habit ‘tradition’/);
  assert.match(system.philosophyText(), /tell me I am wrong/);
});
