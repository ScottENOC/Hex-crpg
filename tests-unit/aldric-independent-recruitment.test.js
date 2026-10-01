const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ quests = [], stage = null } = {}) {
  const modulePath = require.resolve('../aldricIndependentRecruitment.js');
  delete require.cache[modulePath];
  delete global.document;
  for (const key of [
    'aldricIndependentRecruitment', 'ALDRIC_INDEPENDENT_RECRUITMENT_BUILD',
    '__aldricIndependentRecruitmentTimer', 'recruitAldric'
  ]) delete global[key];

  global.window = global;
  global.party = [{ name: 'Hero', inventory: [] }];
  global.player = global.party[0];
  global.questLog = quests.map(q => ({ ...q }));
  global.worldSeconds = 5000;
  global.entities = [
    {
      name: 'Ser Aldric Thorne', side: 'neutral', alive: true, isNPC: true,
      tiedUp: true, dialogueId: 'ser_aldric_captive', level: 2, hp: 14,
      inventory: ['sword', 'wooden_shield'], hex: { q: 4, r: 6 },
    },
    { name: 'Guildmaster Petra Voss', side: 'neutral', alive: true, isNPC: true, hex: { q: 40, r: 50 } },
    { name: 'Captain Ilsa Rennick', side: 'neutral', alive: true, isNPC: true, hex: { q: 55, r: 60 } },
  ];
  global.getNeighbors = (q, r) => [{ q: q + 1, r }, { q: q - 1, r }, { q, r: r + 1 }, { q, r: r - 1 }];
  global.getTerrainAt = () => ({ name: 'Grass', impassable: false });
  global.showMessage = () => {};
  global.showDialogue = () => {};
  global.npcDialogueTrees = { ser_aldric_captive: () => {} };
  global.setupVillageScene = () => {};
  global.companionAttitude = {};
  global.updatePartyTabs = () => {};
  global.drawMap = () => {};
  global.renderEntities = () => {};
  global.wireSharedInventory = () => {};
  global.buildCanonicalCompanionData = (name) => ({
    name, level: 2, hp: 20, maxHp: 20, inventory: ['sword', 'wooden_shield'],
    attributes: { agility: 10 }, equipped: { weapon: 'sword', offhand: 'wooden_shield' },
  });
  global.finishRecruiting = (companion, placeholder) => {
    global.party.push(companion);
    global.entities = global.entities.filter(e => e !== placeholder);
    global.entities.push({ ...companion, side: 'player', hex: { ...placeholder.hex } });
    global.companionAttitude[companion.name] = 60;
  };

  const system = require('../aldricIndependentRecruitment.js');
  if (stage) {
    const s = system.state();
    s.freed = true;
    s.stage = stage;
    global.entities[0].tiedUp = false;
  }
  return system;
}

test('freeing Aldric no longer recruits him automatically', () => {
  const system = fresh();
  const aldric = global.entities.find(e => e.name === 'Ser Aldric Thorne');
  assert.equal(system.freeAldric(aldric), true);
  assert.equal(aldric.tiedUp, false);
  assert.equal(global.party.some(p => p.name === 'Ser Aldric Thorne'), false);
  assert.equal(system.state().stage, 'camp');
});

test('campaign rescuePaladin calls free Aldric and send him to Reddale rather than conscripting him', () => {
  const system = fresh({ quests: [{ id: 'goblin_threat', status: 'completed', resolution: 'goblin_diplomacy' }] });
  const before = JSON.parse(JSON.stringify(global.questLog));
  system.install();
  assert.equal(global.rescuePaladin(), true);
  assert.equal(global.party.some(p => p.name === 'Ser Aldric Thorne'), false);
  assert.equal(system.state().stage, 'reddale');
  assert.deepEqual(global.questLog, before);
  const aldric = global.entities.find(e => e.name === 'Ser Aldric Thorne');
  assert.equal(aldric.tiedUp, false);
  assert.notDeepEqual(aldric.hex, { q: 4, r: 6 });
});

test('manual defer sends a freed Aldric to Petra without resolving Broken Vigil', () => {
  const system = fresh({ quests: [{ id: 'aldric_broken_vigil', status: 'active', resolution: null }] });
  const before = JSON.parse(JSON.stringify(global.questLog));
  const aldric = global.entities[0];
  system.freeAldric(aldric);
  system.deferAldric(aldric);
  assert.equal(system.state().stage, 'reddale');
  assert.deepEqual(global.questLog, before);
  assert.notDeepEqual(aldric.hex, { q: 4, r: 6 });
});

test('the Vessel-Seeker hunt moves deferred Aldric to Ilsa but does not advance the hunt', () => {
  const system = fresh({
    quests: [{ id: 'necromancer_hunt', status: 'active', resolution: null }],
    stage: 'reddale',
  });
  const before = JSON.parse(JSON.stringify(global.questLog));
  assert.equal(system.advanceFromStory(), true);
  assert.equal(system.state().stage, 'hunt');
  assert.deepEqual(global.questLog, before);
  const aldric = global.entities.find(e => e.name === 'Ser Aldric Thorne');
  assert.ok(Math.abs(aldric.hex.q - 55) <= 1);
});

test('recruitment is a separate explicit act and preserves canonical companion construction', () => {
  const system = fresh({ stage: 'reddale' });
  const aldric = global.entities.find(e => e.name === 'Ser Aldric Thorne');
  assert.equal(system.recruitAldric(aldric), true);
  assert.equal(global.party.some(p => p.name === 'Ser Aldric Thorne'), true);
  assert.equal(system.state().stage, 'recruited');
  assert.equal(system.state().recruited, true);
  assert.equal(global.companionAttitude['Ser Aldric Thorne'], 60);
});

test('Aldric world-agency state persists on the same protagonist save object as other companions', () => {
  const system = fresh();
  system.freeAldric(global.entities[0]);
  system.deferAldric(global.entities[0]);
  assert.equal(global.party[0].companionWorldAgency.characters['Ser Aldric Thorne'].stage, 'reddale');
  assert.equal(global.party[0].companionWorldAgency.characters['Ser Aldric Thorne'].freed, true);
});

test('alternative recruitment copy explicitly says Aldric has not solved his own quest off-screen', () => {
  let system = fresh({ stage: 'reddale' });
  assert.match(system.alternativeText(), /has not confronted Petra/);
  assert.match(system.alternativeText(), /resolved The Broken Vigil without you/);

  system = fresh({ quests: [{ id: 'necromancer_hunt', status: 'active' }], stage: 'hunt' });
  assert.match(system.alternativeText(), /has not entered the crypt/);
});
