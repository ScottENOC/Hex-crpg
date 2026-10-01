const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'npcReliability.js'), 'utf8');

test('NPC reliability does not rescan generated residents before every render', () => {
  let now = 0;
  let renders = 0;
  const window = {
    entities: [],
    party: [],
    renderEntities() { renders++; },
  };
  const document = {
    getElementById() { return null; },
    createElement() { return { width: 0, height: 0 }; },
  };
  const context = {
    window,
    document,
    performance: { now: () => now },
    Date,
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    getComputedStyle() { return { display: 'none' }; },
    Option: function Option() {},
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'npcReliability.js' });

  now = 10;
  window.renderEntities();
  now = 100;
  window.renderEntities();
  now = 510;
  window.renderEntities();

  assert.equal(renders, 3, 'all real renderer calls must still happen');
  assert.equal(window.NPCReliability.stats.renderGuardRuns, 2, 'expensive reliability guard should run at most twice per second');
  assert.equal(window.NPCReliability.stats.renderGuardSkips, 1, 'intermediate render should skip the global reliability scan');
  assert.equal(window.NPCReliability.RENDER_GUARD_MS, 500);
});
