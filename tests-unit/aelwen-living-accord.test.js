const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ accordStatus = 'completed', withFenn = false } = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const aelwenPath = require.resolve('../aelwenLivingAccord.js');
  delete require.cache[relPath];
  delete require.cache[aelwenPath];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'aelwenLivingAccord', 'AELWEN_LIVING_ACCORD_BUILD', 'campaign2ForestAccordState',
    'fennLivingBoundary', 'campaign2WetlandState'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.npcDialogueTrees = {};
  global.questLog = [{ id: 'silver_accord', title: 'The Silver Accord', status: accordStatus }];
  global.party = [{ name: 'Hero', race: 'human' }];
  if (withFenn) global.party.push({ name: 'Fenn Oakheart' });
  global.player = global.party[0];
  global.entities = [
    { name: "Queen Aelwen Sil'thandriel", reputation: { standing: 0, knowledge: 0 } },
    { name: 'Queen Seraphine Corrin', reputation: { standing: 0, knowledge: 0 } },
    { name: 'Elder Nessa Wren', reputation: { standing: 0, knowledge: 0 } },
  ];
  global.showMessage = () => {};
  global.showDialogue = () => {};
  global.worldSeconds = 1000;

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../aelwenLivingAccord.js');
  return { system, relationships };
}

test('The Living Accord only opens after the Silver Accord is completed', () => {
  let setup = fresh({ accordStatus: 'active' });
  assert.equal(setup.system.canStart(), false);
  assert.equal(setup.system.ensureQuest(), null);

  setup = fresh({ accordStatus: 'completed' });
  assert.equal(setup.system.canStart(), true);
  const q = setup.system.ensureQuest();
  assert.equal(q.status, 'active');
  assert.equal(q.stage, 'hear_silverhart');
  assert.equal(q.aelwenPositionHeard, true);
});

test('Aelwen and Seraphine keep separate personal relationship consequences', () => {
  const { system, relationships } = fresh();
  const a0 = relationships.getRelationship("Queen Aelwen Sil'thandriel");
  const s0 = relationships.getRelationship('Queen Seraphine Corrin');

  system.ensureQuest();
  system.noteSeraphinePosition();
  const result = system.resolve('joint_stewardship');

  assert.equal(result.quest.status, 'completed');
  assert.equal(result.quest.resolution, 'joint_stewardship');
  assert.equal(result.quest.forestTerms.jointManagement, true);
  assert.equal(result.quest.forestTerms.greenwoodHarvest, true);

  const a1 = relationships.getRelationship("Queen Aelwen Sil'thandriel");
  const s1 = relationships.getRelationship('Queen Seraphine Corrin');
  assert.ok(a1.trust > a0.trust);
  assert.ok(a1.friendship > a0.friendship);
  assert.ok(s1.trust > s0.trust);
  assert.ok(s1.friendship > s0.friendship);
});

test('the player cannot simply order Aelwen to surrender the border', () => {
  const { system, relationships } = fresh();
  system.ensureQuest();
  system.noteSeraphinePosition();
  const before = relationships.getRelationship("Queen Aelwen Sil'thandriel");
  const result = system.resolve('press_silverhart');
  const after = relationships.getRelationship("Queen Aelwen Sil'thandriel");

  assert.equal(result.quest.resolution, 'press_silverhart');
  assert.equal(result.quest.forestTerms.mode, 'old_boundary_enforced');
  assert.equal(result.quest.forestTerms.greenwoodHarvest, false);
  assert.ok(after.trust < before.trust);
  assert.ok(after.friendship < before.friendship);
  assert.match(result.text, /No\. Silverhart needing timber/);
});

test('Fenn counsel reflects the land ethic developed in his own companion quest', () => {
  const { system } = fresh({ withFenn: true });
  system.ensureQuest();

  global.fennLivingBoundary = { getArcState: () => ({ landEthic: 'preservationist' }) };
  assert.match(system.fennCounselText(), /line people simply do not cross/);

  global.fennLivingBoundary = { getArcState: () => ({ landEthic: 'pragmatic_steward' }) };
  assert.match(system.fennCounselText(), /Managed use is still management/);

  const q = system.noteFennCounsel();
  assert.equal(q.fennCounselHeard, true);
});

test('Nessa counsel is optional and relationship credit is idempotent', () => {
  const { system, relationships } = fresh();
  system.ensureQuest();
  const before = relationships.getRelationship('Elder Nessa Wren');
  system.noteNessaCounsel();
  const once = relationships.getRelationship('Elder Nessa Wren');
  system.noteNessaCounsel();
  const twice = relationships.getRelationship('Elder Nessa Wren');

  assert.ok(once.trust > before.trust);
  assert.ok(once.friendship > before.friendship);
  assert.deepEqual(twice, once);
});

test('Aelwen remains friendship-authored; this pass does not silently make her romanceable', () => {
  const { relationships } = fresh();
  relationships.adjustRelationship("Queen Aelwen Sil'thandriel", {
    friendship: 12,
    romanticBond: 70,
    attraction: 70,
  }, 'test');
  const rel = relationships.getRelationship("Queen Aelwen Sil'thandriel");
  assert.equal(rel.friendship, 12);
  assert.equal(rel.romanticBond, 0);
  assert.equal(rel.attraction, 0);
});
