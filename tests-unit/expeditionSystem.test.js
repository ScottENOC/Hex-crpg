const test = require('node:test');
const assert = require('node:assert/strict');

function freshSystem() {
  const path = require.resolve('../expeditionSystem.js');
  delete require.cache[path];
  delete global.items;
  delete global.skills;
  delete global.party;
  delete global.entities;
  delete global.partyInventory;
  delete global.player;
  delete global.document;
  delete global.getWeatherStateAt;
  delete global.getTerrainAt;
  delete global.findInteriorRegion;
  delete global.getLightLevel;
  delete global.worldSeconds;
  global.items = {
    sword: { id:'sword', name:'Sword', type:'weapon', subType:'melee', damage:3 },
    bow: { id:'bow', name:'Bow', type:'weapon', subType:'ranged', damage:1, buyPrice:30 },
    light_armor: { id:'light_armor', name:'Light Armor', type:'armor', reduction:1 },
    medium_armor: { id:'medium_armor', name:'Medium Armor', type:'armor', reduction:2 },
    heavy_armor: { id:'heavy_armor', name:'Heavy Armor', type:'armor', reduction:3 },
    wood: { id:'wood', name:'Timber', type:'resource', weight:5 },
    ore_iron: { id:'ore_iron', name:'Iron Ore', type:'resource' }
  };
  global.skills = {
    strong_back: { tree:'strength' },
    quartermaster: { tree:'endurance' },
    heavy_armor_training: { tree:'strength' }
  };
  return require('../expeditionSystem.js');
}

test('shared cargo water-fills to equal percentage burden', () => {
  const sys = freshSystem();
  const carriers = sys.allocateSharedCargo([
    { capacity: 40, equippedWeight: 10 },
    { capacity: 80, equippedWeight: 0 }
  ], 50);
  assert.ok(Math.abs(carriers[0].burden - carriers[1].burden) < 1e-8);
  assert.ok(Math.abs(carriers.reduce((s,c)=>s+c.allocatedSharedWeight,0) - 50) < 1e-7);
});

test('heavily equipped carrier keeps its unavoidable higher burden', () => {
  const sys = freshSystem();
  const carriers = sys.allocateSharedCargo([
    { capacity: 40, equippedWeight: 50 },
    { capacity: 80, equippedWeight: 0 }
  ], 20);
  assert.equal(carriers[0].burden, 1.25);
  assert.ok(carriers[1].burden < carriers[0].burden);
});

test('encumbrance curve is gradual and increasingly severe', () => {
  const sys = freshSystem();
  assert.equal(sys.rawBurdenMoveMultiplier(1), 1);
  assert.ok(sys.rawBurdenMoveMultiplier(1.1) > 1);
  assert.ok(sys.rawBurdenMoveMultiplier(1.3) > sys.rawBurdenMoveMultiplier(1.1));
  assert.ok(sys.rawBurdenMoveMultiplier(1.7) > sys.rawBurdenMoveMultiplier(1.3));
  assert.ok(sys.rawBurdenMoveMultiplier(2.2) > sys.rawBurdenMoveMultiplier(1.7));
});

test('quantity helpers preserve repeated-ID inventory format', () => {
  const sys = freshSystem();
  global.partyInventory = ['wood', 'wood'];
  assert.equal(sys.countPartyItem('wood'), 2);
  sys.addPartyItem('wood', 3);
  assert.equal(sys.countPartyItem('wood'), 5);
  assert.equal(sys.removePartyItem('wood', 2), 2);
  assert.equal(sys.countPartyItem('wood'), 3);
});

test('basic arrow crafting consumes one timber and ore and makes twenty arrows', () => {
  const sys = freshSystem();
  global.partyInventory = ['wood', 'ore_iron'];
  assert.equal(sys.craftBasicArrows(), true);
  assert.equal(sys.countPartyItem('wood'), 0);
  assert.equal(sys.countPartyItem('ore_iron'), 0);
  assert.equal(sys.countPartyItem('basic_arrow'), 20);
});

test('fatigue transitions after sixteen, twenty and twenty-eight awake hours', () => {
  const sys = freshSystem();
  assert.equal(sys.getFatigueState({awakeSeconds: 15*3600}).key, 'rested');
  assert.equal(sys.getFatigueState({awakeSeconds: 16*3600}).key, 'tired');
  assert.equal(sys.getFatigueState({awakeSeconds: 20*3600}).key, 'exhausted');
  assert.equal(sys.getFatigueState({awakeSeconds: 28*3600}).key, 'severely_exhausted');
});

test('climate elevation is deterministic and mountains are colder/higher', () => {
  const sys = freshSystem();
  global.getTerrainAt = () => ({name:'Grass'});
  const a = sys.getClimateElevation(10, 20);
  const b = sys.getClimateElevation(10, 20);
  assert.equal(a, b);
  global.getTerrainAt = () => ({name:'Mountain'});
  const mountain = sys.getClimateElevation(10, 20);
  assert.ok(mountain >= a + 600);
});

test('live weather is the thermal baseline while elevation remains a local modifier', () => {
  const sys = freshSystem();
  global.worldSeconds = 98765;
  const seen = [];
  global.getWeatherStateAt = (seconds, hex) => {
    seen.push({ seconds, q:hex.q, r:hex.r });
    return { temperatureC: 5 };
  };
  global.getTerrainAt = () => ({name:'Grass'});

  const lowHex = {q:10,r:20};
  const lowElevation = sys.getClimateElevation(lowHex.q, lowHex.r);
  const low = sys.getAmbientTemperature(lowHex);
  const expected = 5 - (lowElevation - 220) * 0.0065;
  assert.ok(Math.abs(low - expected) < 1e-9, `${low} vs expected ${expected}`);
  assert.deepEqual(seen.at(-1), {seconds:98765,q:10,r:20});

  global.getTerrainAt = () => ({name:'Mountain'});
  const mountain = sys.getAmbientTemperature(lowHex);
  assert.ok(mountain < low - 5, `expected mountain microclimate (${mountain}) to remain materially colder than lowland (${low})`);
});

test('effective temperature still layers sunshine on top of weather air temperature', () => {
  const sys = freshSystem();
  global.worldSeconds = 1000;
  global.getWeatherStateAt = () => ({ temperatureC: 10 });
  global.getTerrainAt = () => ({name:'Grass'});
  global.getLightLevel = () => 1;
  const e = {hex:{q:0,r:0}};
  const ambient = sys.getAmbientTemperature(e.hex);
  const effective = sys.getEffectiveTemperature(e);
  assert.ok(effective > ambient + 5.5, `expected direct sun to add close to 6 C: ambient=${ambient}, effective=${effective}`);
});

test('static expedition data gives bows finite arrows and adds camping gear', () => {
  const sys = freshSystem();
  global.items = {
    bow: { id: 'bow', name: 'Bow', type: 'weapon', subType: 'ranged' },
    bottle: { id: 'bottle', name: 'Bottle', type: 'weapon', subType: 'ranged' },
    light_armor: { id: 'light_armor', type: 'armor' },
    medium_armor: { id: 'medium_armor', type: 'armor' },
    heavy_armor: { id: 'heavy_armor', type: 'armor' },
  };
  global.skills = {};
  sys.configureStaticData();
  assert.equal(global.items.bow.ammoClass, 'arrow');
  assert.equal(global.items.bottle.ammoClass, undefined);
  assert.equal(global.items.basic_arrow.weight, 0.05);
  assert.equal(global.items.bedroll.type, 'camping');
  assert.equal(global.items.tent.shelterCapacity, 4);
});