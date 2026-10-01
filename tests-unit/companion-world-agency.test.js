const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({ quests = [], party = [{ name: 'Hero', inventory: [] }], entities = [] } = {}) {
  const modulePath = require.resolve('../companionWorldAgency.js');
  delete require.cache[modulePath];
  delete global.document;
  global.window = global;
  global.party = party;
  global.player = party[0];
  global.questLog = quests.map(q => ({ ...q }));
  global.entities = entities.map(e => ({ alive: true, ...e, hex: e.hex ? { ...e.hex } : undefined }));
  global.worldSeconds = 1234;
  global.getNeighbors = (q, r) => [
    { q: q + 1, r }, { q: q - 1, r }, { q, r: r + 1 }, { q, r: r - 1 },
  ];
  global.getTerrainAt = () => 'Grass';
  global.showMessage = () => {};
  global.showDialogue = () => {};
  global.npcDialogueTrees = {};
  global.companionAttitude = {};
  delete global.companionWorldAgency;
  delete global.COMPANION_WORLD_AGENCY_BUILD;
  return require('../companionWorldAgency.js');
}

function entity(name, q, r, extra = {}) {
  return { name, side: 'neutral', isNPC: true, hex: { q, r }, ...extra };
}

test('world agency is deliberately limited to the four companions with clean deferred recruitment hooks', () => {
  const agency = fresh();
  assert.deepEqual(Object.keys(agency.profiles).sort(), [
    'Brother Alden', 'Fenn Oakheart', 'Mirabel Quill', 'Reyna Fletcher'
  ]);
  assert.equal(agency.profiles['Wren Talbot'], undefined);
  assert.equal(agency.profiles['Ser Aldric Thorne'], undefined);
});

test('world-agency state persists on the protagonist save record', () => {
  const hero = { name: 'Hero', inventory: [] };
  let agency = fresh({ party: [hero] });
  agency.setStage('Reyna Fletcher', 'reddale', 'test');
  assert.equal(hero.companionWorldAgency.characters['Reyna Fletcher'].stage, 'reddale');

  delete require.cache[require.resolve('../companionWorldAgency.js')];
  delete global.companionWorldAgency;
  agency = require('../companionWorldAgency.js');
  assert.equal(agency.getState('Reyna Fletcher').stage, 'reddale');
});

test('deferring Reyna relocates her to Reddale without advancing or resolving any quest', () => {
  const quests = [
    { id: 'eyes_on_border', status: 'locked', resolution: null },
    { id: 'reyna_empty_blind', status: 'active', resolution: null },
  ];
  const agency = fresh({
    quests,
    entities: [
      entity('Reyna Fletcher', 1, 1),
      entity('Captain Ilsa Rennick', 40, 50),
    ],
  });
  const before = JSON.parse(JSON.stringify(global.questLog));
  assert.equal(agency.defer('Reyna Fletcher'), true);
  assert.equal(agency.getState('Reyna Fletcher').stage, 'reddale');
  assert.deepEqual(global.questLog, before);
  assert.notDeepEqual(global.entities.find(e => e.name === 'Reyna Fletcher').hex, { q: 1, r: 1 });
});

test('Reyna can later move from Reddale to Northwatch when the border investigation exists', () => {
  const agency = fresh({
    quests: [{ id: 'eyes_on_border', status: 'active' }],
    entities: [entity('Reyna Fletcher', 1, 1)],
  });
  global.campaign2ReddaleGuildhouseCenter = { q: 20, r: 20 };
  global.campaign2NorthwatchCenter = { q: 90, r: -30 };
  agency.setStage('Reyna Fletcher', 'reddale', 'test');
  const moved = agency.advanceFromStory();
  assert.deepEqual(moved, ['Reyna Fletcher']);
  assert.equal(agency.getState('Reyna Fletcher').stage, 'northwatch');
  assert.equal(global.questLog[0].status, 'active');
});

test('Mirabel and Fenn move to later alternative recruitment locations but do not complete their stories', () => {
  const quests = [
    { id: 'wizard_vendetta', status: 'completed', resolution: 'queen' },
    { id: 'silver_accord', status: 'completed', resolution: 'signed' },
    { id: 'mirabel_unquiet_concordance', status: 'active', resolution: null },
    { id: 'fenn_living_boundary', status: 'active', resolution: null },
  ];
  const agency = fresh({
    quests,
    entities: [entity('Mirabel Quill', 1, 1), entity('Fenn Oakheart', 2, 2)],
  });
  global.campaign2PalaceThroneCenter = { q: 100, r: 100 };
  global.campaign2DruidGroveCenter = { q: -50, r: 20 };
  agency.setStage('Mirabel Quill', 'reddale', 'test');
  agency.setStage('Fenn Oakheart', 'farmstead', 'test');
  agency.advanceFromStory();
  assert.equal(agency.getState('Mirabel Quill').stage, 'silverhart_archive');
  assert.equal(agency.getState('Fenn Oakheart').stage, 'sylvan_court');
  assert.equal(global.questLog.find(q => q.id === 'mirabel_unquiet_concordance').status, 'active');
  assert.equal(global.questLog.find(q => q.id === 'fenn_living_boundary').status, 'active');
});

test('Alden can relocate from Northwatch to the Cathedral and loses his old fort-only directive', () => {
  const agency = fresh({
    entities: [
      entity('Brother Alden', 8, 8, { isNPC: false, combatDirective: { constraints: { stayWithinHexes: new Set(['8,8']) } } }),
      entity('High Cleric Adelram', 200, 210),
    ],
  });
  agency.defer('Brother Alden');
  const alden = global.entities.find(e => e.name === 'Brother Alden');
  assert.equal(agency.getState('Brother Alden').stage, 'cathedral');
  assert.equal(alden.combatDirective, undefined);
  assert.notDeepEqual(alden.hex, { q: 8, r: 8 });
});

test('a recruited companion is never relocated by later story progression', () => {
  const agency = fresh({
    quests: [{ id: 'eyes_on_border', status: 'active' }],
    party: [{ name: 'Hero', inventory: [] }, { name: 'Reyna Fletcher' }],
    entities: [entity('Reyna Fletcher', 7, 9, { side: 'player' })],
  });
  agency.setStage('Reyna Fletcher', 'reddale', 'test');
  assert.deepEqual(agency.advanceFromStory(), []);
  assert.equal(agency.getState('Reyna Fletcher').stage, 'reddale');
  assert.deepEqual(global.entities[0].hex, { q: 7, r: 9 });
});

test('alternative Fenn recruitment still requires and consumes three clean herb bundles', () => {
  const hero = { name: 'Hero', inventory: ['herbs', 'fruit', 'herbs', 'herbs', 'herbs'] };
  const agency = fresh({ party: [hero], entities: [entity('Fenn Oakheart', 5, 5)] });
  let recruited = 0;
  global.recruitFenn = () => {
    recruited++;
    global.party.push({ name: 'Fenn Oakheart' });
  };
  assert.equal(agency.recruitFromAlternative('Fenn Oakheart', global.entities[0]), true);
  assert.equal(recruited, 1);
  assert.deepEqual(hero.inventory, ['fruit', 'herbs']);
});

test('stage changes are idempotent and do not spam movement history', () => {
  const agency = fresh();
  assert.equal(agency.setStage('Mirabel Quill', 'reddale', 'first'), true);
  assert.equal(agency.setStage('Mirabel Quill', 'reddale', 'again'), false);
  const state = agency.getState('Mirabel Quill');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].reason, 'first');
});
