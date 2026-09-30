const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const weatherSource = fs.readFileSync(path.join(root, 'weatherSystem.js'), 'utf8');

function loadWeatherSandbox() {
    const window = {
        worldSeconds: 0,
        currentCampaign: '2',
        campaign2Landmarks: { crossroads: { q: 8, r: 24 } },
        devicePixelRatio: 1,
        addEventListener() {},
    };
    vm.runInNewContext(weatherSource, { window, console }, { filename: 'weatherSystem.js' });
    return window;
}

test('campaign 2 gets colder to the north using the authored negative-r north axis', () => {
    const w = loadWeatherSandbox();
    const t = 165 * 86400 + 14 * 3600;
    const origin = { q: 8, r: 24 };
    const fourWorldHexesNorth = { q: 8, r: 24 - 4 * 130 };
    const fourWorldHexesSouth = { q: 8, r: 24 + 4 * 130 };

    const middle = w.getWeatherStateAt(t, origin);
    const north = w.getWeatherStateAt(t, fourWorldHexesNorth);
    const south = w.getWeatherStateAt(t, fourWorldHexesSouth);

    assert.ok(north.temperatureC < middle.temperatureC);
    assert.ok(middle.temperatureC < south.temperatureC);
    assert.ok(Math.abs((middle.temperatureC - north.temperatureC) - 3.2) < 0.001);
    assert.ok(Math.abs((south.temperatureC - middle.temperatureC) - 3.2) < 0.001);
});

test('latitude effect is capped on the infinite procedural map', () => {
    const w = loadWeatherSandbox();
    const t = 100 * 86400;
    const farNorth = w.getWeatherStateAt(t, { q: 0, r: -100000 });
    const farSouth = w.getWeatherStateAt(t, { q: 0, r: 100000 });
    assert.equal(farNorth.latitudeOffsetC, -w.weatherSystem.constants.MAX_LATITUDE_OFFSET_C);
    assert.equal(farSouth.latitudeOffsetC, w.weatherSystem.constants.MAX_LATITUDE_OFFSET_C);
});

test('snow can accumulate and shallow water can ice over after sustained northern winter cold', () => {
    const w = loadWeatherSandbox();
    const northernR = 24 - 8 * 130;
    let maxSnow = 0;
    let maxIce = 0;

    // Two samples per in-game day are enough to prove the deterministic
    // ten-day surface-history model reaches persistent cover during winter.
    for (let day = 0; day < 360; day++) {
        for (const hour of [0, 12]) {
            const seconds = day * 86400 + hour * 3600;
            maxSnow = Math.max(maxSnow, w.getGroundSnowCoverAt(0, northernR, 'Grass', seconds));
            maxIce = Math.max(maxIce, w.getWaterIceCoverAt(0, northernR, 'Water', seconds));
        }
    }

    assert.ok(maxSnow > 0.5, `expected substantial settled snow, max=${maxSnow}`);
    assert.ok(maxIce > 0.5, `expected substantial shallow-water ice, max=${maxIce}`);
});

test('settled snow respects indoor/non-ground terrain and only shallow water freezes', () => {
    const w = loadWeatherSandbox();
    const coldSeconds = 3 * 86400;
    const northernR = 24 - 8 * 130;

    assert.equal(w.getGroundSnowCoverAt(0, northernR, 'Wood Floor', coldSeconds), 0);
    assert.equal(w.getGroundSnowCoverAt(0, northernR, 'Water', coldSeconds), 0);
    assert.equal(w.getWaterIceCoverAt(0, northernR, 'Deep Water', coldSeconds), 0);
});

test('ground rendering is buffered and simplifies itself for low graphics settings', () => {
    assert.match(weatherSource, /groundBuffer/);
    assert.match(weatherSource, /groundVisibilityKey/);
    assert.match(weatherSource, /window\.renderScale < 0\.75/);
    assert.match(weatherSource, /window\.foliageDetail === 'simple'/);
    assert.match(weatherSource, /window\.cameraZoom \|\| 1\) < 0\.35/);
    assert.match(weatherSource, /installGroundRendererHook/);
    assert.match(weatherSource, /drawGroundSurfaceOverlay/);
});
