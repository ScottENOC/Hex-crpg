const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(name) {
  return fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
}

function run(name, window, extra = {}) {
  const context = {
    window,
    Date,
    performance: extra.performance || { now: () => 0 },
    setInterval: extra.setInterval || (() => 1),
    clearInterval: extra.clearInterval || (() => {}),
    console,
  };
  vm.createContext(context);
  vm.runInContext(source(name), context, { filename:name });
  return context;
}

test('render spatial culling presents only nearby dictionaries during render and restores the world', () => {
  let now = 0;
  let seenMapKeys = null;
  let seenObjectKeys = null;
  const mapItems = { '0,0':['sword'], '100,100':['axe'] };
  const tileObjects = { '1,1':{type:'table'}, '120,120':{type:'door_closed'} };
  const window = {
    mapItems,
    tileObjects,
    LIVE_VISION_RANGE:1,
    entities:[{alive:true,side:'player',hex:{q:0,r:0}}],
    getVisibleHexes:() => ({minQ:-2,maxQ:2,minR:-2,maxR:2}),
    renderEntities() {
      seenMapKeys = Object.keys(window.mapItems).sort();
      seenObjectKeys = Object.keys(window.tileObjects).sort();
    },
  };
  run('renderSpatialCulling.js', window, { performance:{now:()=>now} });

  window.renderEntities();
  assert.deepEqual(seenMapKeys, ['0,0']);
  assert.deepEqual(seenObjectKeys, ['1,1']);
  assert.equal(window.mapItems, mapItems, 'full mapItems dictionary must be restored after render');
  assert.equal(window.tileObjects, tileObjects, 'full tileObjects dictionary must be restored after render');
  assert.equal(window.renderSpatialCullingStats.lastMapItemsSelected, 1);
  assert.equal(window.renderSpatialCullingStats.lastTileObjectsSelected, 1);

  mapItems['2,2'] = ['dagger'];
  now = 300;
  window.renderEntities();
  assert.deepEqual(seenMapKeys, ['0,0','2,2']);
});

test('visibility hot path caches party membership but follows live movement', () => {
  let now = 0;
  let underlyingCalls = 0;
  const overrideArrays = [];
  const player = { id:'p1', alive:true, side:'player', hex:{q:0,r:0}, visionBonus:0 };
  const window = {
    LIVE_VISION_RANGE:5,
    entities:[player, ...Array.from({length:100}, (_,i) => ({id:`n${i}`,alive:true,side:'neutral',hex:{q:i+20,r:0}}))],
    isVisibleToPlayer(target, friendlies) {
      underlyingCalls++;
      overrideArrays.push(friendlies);
      return true;
    },
  };
  run('visibilityHotPathCache.js', window, { performance:{now:()=>now} });

  assert.equal(window.isVisibleToPlayer({q:2,r:0}), true);
  assert.equal(window.isVisibleToPlayer({q:3,r:0}), true);
  assert.equal(window.visibilityHotPathStats.membershipRebuilds, 1);
  assert.equal(window.visibilityHotPathStats.boundsRebuilds, 1);
  assert.ok(window.visibilityHotPathStats.boundsHits >= 1);
  assert.notEqual(overrideArrays[0], overrideArrays[1], 'downstream copy avoids stale identity-based bounds caches');

  player.hex.q = 20;
  assert.equal(window.isVisibleToPlayer({q:22,r:0}), true);
  assert.equal(window.visibilityHotPathStats.boundsRebuilds, 2, 'bounds must rebuild immediately when party moves');

  const before = underlyingCalls;
  assert.equal(window.isVisibleToPlayer({q:100,r:100}), false);
  assert.equal(underlyingCalls, before, 'far targets should be rejected before LOS');
});

test('turn UI is throttled only outside combat', () => {
  let now = 0;
  let calls = 0;
  const stable = () => { calls++; };
  stable.__stableTurnCards = true;
  const window = { isInCombat:false, updateTurnIndicator:stable };
  run('realtimeUiThrottle.js', window, { performance:{now:()=>now} });

  now = 0; window.updateTurnIndicator();
  now = 100; window.updateTurnIndicator();
  now = 200; window.updateTurnIndicator();
  assert.equal(calls, 2);
  assert.equal(window.realtimeUiThrottleStats.skipped, 1);

  window.isInCombat = true;
  now = 210; window.updateTurnIndicator();
  now = 220; window.updateTurnIndicator();
  assert.equal(calls, 4, 'combat updates must never be throttled');
});
