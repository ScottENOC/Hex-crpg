const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'worldChunkStreaming.js'), 'utf8');

function loadWorldChunkStreaming() {
    let now = 0;
    let globalTileScans = 0;
    const tileObjects = new Proxy({
        '2,2': { type:'stair_up', toFloor:1 },
        '30,30': { type:'door_closed' },
    }, {
        ownKeys(target) {
            globalTileScans++;
            return Reflect.ownKeys(target);
        }
    });
    const player = { alive:true, side:'player', rider:null, hex:{ q:1, r:1 }, floor:0 };
    const window = {
        entities:[player],
        tileObjects,
        multiStoryBuildings:[{
            id:'test-inn', minQ:0, maxQ:8, minR:0, maxR:8,
            floors:[{}, { tileObjects:{ '2,2':{ type:'stair_down', toFloor:0 } } }],
        }],
        distance(a,b) {
            const dq=a.q-b.q, dr=a.r-b.r;
            return (Math.abs(dq)+Math.abs(dq+dr)+Math.abs(dr))/2;
        },
    };
    const context = {
        window,
        performance:{ now:()=>now },
        Date,
        setInterval:()=>1,
        clearInterval:()=>{},
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename:'worldChunkStreaming.js' });
    return {
        window,
        setNow(value) { now = value; },
        scans() { return globalTileScans; },
    };
}

test('world chunk streamer caches static stair topology between pulses', () => {
    const env = loadWorldChunkStreaming();
    assert.equal(env.scans(), 1, 'initial topology build should scan global tileObjects once');
    assert.deepEqual([...env.window.WorldChunkStreaming.activeVerticalLayers].sort(), ['test-inn:0','test-inn:1']);

    env.setNow(1000);
    env.window.WorldChunkStreaming.pulse(true);
    assert.equal(env.scans(), 1, 'ordinary pulses should reuse the cached stair index');

    env.setNow(6001);
    env.window.WorldChunkStreaming.pulse(true);
    assert.equal(env.scans(), 2, 'periodic safety refresh should rebuild the topology index');
});

test('closely spaced stream pulse requests are coalesced', () => {
    const env = loadWorldChunkStreaming();
    const before = env.window.WorldChunkStreaming.stats;
    env.setNow(100);
    env.window.WorldChunkStreaming.pulse();
    const after = env.window.WorldChunkStreaming.stats;
    assert.equal(after.pulseCount, before.pulseCount);
    assert.equal(after.skippedPulseCount, before.skippedPulseCount + 1);
});
