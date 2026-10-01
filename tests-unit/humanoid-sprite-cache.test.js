const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'humanoidSpriteCache.js'), 'utf8');

function makeCanvas() {
  return {
    width:0, height:0,
    getContext() {
      return { drawImage(){} };
    }
  };
}

test('non-party direct humanoids reuse a composite while player/combat draws bypass it', () => {
  let baseCalls = 0;
  const intervals = [];
  const window = {
    isInCombat:false,
    hexSize:30,
    DIRECT_HUMANOID_RIGS:{ human_male:{}, human_female:{} },
    __humanoidRendererDrawCount:0,
    drawPlayerCharacter(ctx, entity) {
      baseCalls++;
      window.__humanoidRendererDrawCount++;
      window.__humanoidRendererLastDraw = { entity };
    },
  };
  window.drawPlayerCharacter.__directHumanoidCompositor = true;
  const document = {
    createElement(name) { assert.equal(name, 'canvas'); return makeCanvas(); },
    getElementById() { return null; },
  };
  const context = {
    window, document, JSON,
    setInterval(fn,ms){ intervals.push({fn,ms}); return intervals.length; }, clearInterval(){},
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename:'humanoidSpriteCache.js' });

  const ctx = { drawImage(){} };
  // Deliberately no isNPC flag: any non-party direct humanoid is cacheable.
  const npc = { name:'Guard', side:'neutral', race:'human', gender:'male', equipped:{armor:'heavy_armor'}, facing:'down' };
  window.drawPlayerCharacter(ctx, npc, 100, 100, 1, 0);
  window.drawPlayerCharacter(ctx, npc, 101, 100, 1, 0);
  assert.equal(baseCalls, 1, 'second stable humanoid draw should use cached composite');
  assert.equal(window.humanoidSpriteCacheStats.builds, 1);
  assert.equal(window.humanoidSpriteCacheStats.hits, 1);

  const player = { name:'Player', side:'player', race:'human', gender:'female', equipped:{}, facing:'down' };
  window.drawPlayerCharacter(ctx, player, 100, 100, 1, 0);
  assert.equal(baseCalls, 2, 'player rendering must bypass NPC cache');

  window.isInCombat = true;
  window.drawPlayerCharacter(ctx, npc, 102, 100, 1, 0);
  assert.equal(baseCalls, 3, 'combat rendering must bypass NPC cache');
});

test('cache healthcheck can reattach after a later renderer replacement', () => {
  const intervals = [];
  const window = {
    isInCombat:false,
    hexSize:30,
    DIRECT_HUMANOID_RIGS:{ human_male:{} },
    __humanoidRendererDrawCount:0,
    drawPlayerCharacter(){},
  };
  window.drawPlayerCharacter.__directHumanoidCompositor = true;
  const document = {
    createElement(){ return makeCanvas(); },
    getElementById(){ return null; },
  };
  const context = {
    window, document, JSON,
    setInterval(fn,ms){ intervals.push({fn,ms}); return intervals.length; }, clearInterval(){},
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename:'humanoidSpriteCache.js' });
  assert.equal(window.humanoidSpriteCacheStats.installed, true);

  const replacement = function(){};
  replacement.__directHumanoidCompositor = true;
  window.drawPlayerCharacter = replacement;
  const health = intervals.find(i => i.ms === 1000);
  assert.ok(health, '1 Hz healthcheck should exist');
  health.fn();
  assert.equal(window.humanoidSpriteCacheStats.rewraps, 1);
  assert.equal(window.drawPlayerCharacter.__stableNpcCompositeCache, true);
});
