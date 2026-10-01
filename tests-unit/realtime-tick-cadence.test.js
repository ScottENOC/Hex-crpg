const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'realtimeTickCadence.js'), 'utf8');

test('exploration ticks are coalesced while combat keeps the 10 ms driver cadence', () => {
    let now = 0;
    let tickCalls = 0;
    const intervals = [];
    const window = {
        isInCombat:false,
        tickInterval:99,
        tick(){ tickCalls++; },
    };
    const context = {
        window,
        Date,
        performance:{ now:()=>now },
        setInterval(fn,ms){ intervals.push({fn,ms,cleared:false}); return intervals.length; },
        clearInterval(id){ if (intervals[id-1]) intervals[id-1].cleared=true; },
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename:'realtimeTickCadence.js' });

    assert.equal(window.__realtimeTickCadenceInstalled, true);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].ms, 10, 'driver keeps combat-compatible 10 ms wakeups');

    const drive = intervals[0].fn;
    now = 0; drive();
    now = 10; drive();
    now = 20; drive();
    assert.equal(tickCalls, 2, 'exploration should run about every 20 ms, not every 10 ms');
    assert.equal(window.RealtimeTickCadence.stats.skippedExplorationTicks, 1);

    window.isInCombat = true;
    now = 30; drive();
    now = 40; drive();
    assert.equal(tickCalls, 4, 'combat must run every driver callback');
});
