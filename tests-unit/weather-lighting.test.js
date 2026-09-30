const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const worldTimeSource = fs.readFileSync(path.join(root, 'worldTime.js'), 'utf8');

function lightFor(state, seconds = 165 * 86400 + 12 * 3600) {
    const window = {};
    vm.runInNewContext(worldTimeSource, { window, console }, { filename: 'worldTime.js' });
    window.worldSeconds = seconds;
    window.getWeatherStateAt = () => state;
    return window.getLightLevel();
}

test('cloud cover reduces daytime ambient brightness even without precipitation', () => {
    const clear = lightFor({ cloudiness: 0, intensity: 0, precipitation: 'none' });
    const overcast = lightFor({ cloudiness: 1, intensity: 0, precipitation: 'none' });
    assert.equal(clear, 1);
    assert.ok(overcast < clear, `expected overcast (${overcast}) to be darker than clear (${clear})`);
    assert.ok(overcast >= 0.65, 'overcast daylight should remain readable');
});

test('active rain and snow add dimming on top of cloud cover', () => {
    const dry = lightFor({ cloudiness: 0.7, intensity: 0, precipitation: 'none' });
    const rain = lightFor({ cloudiness: 0.7, intensity: 1, precipitation: 'rain' });
    const snow = lightFor({ cloudiness: 0.7, intensity: 1, precipitation: 'snow' });
    assert.ok(rain < dry, 'heavy rain should dim daylight beyond dry cloud cover');
    assert.ok(snow < dry, 'heavy snow should dim daylight beyond dry cloud cover');
    assert.ok(rain < snow, 'heavy rain is intentionally a little darker than equivalent snowfall');
});

test('weather dimming is deliberately weaker at night', () => {
    const midnight = 165 * 86400;
    const clearNight = lightFor({ cloudiness: 0, intensity: 0, precipitation: 'none' }, midnight);
    const stormNight = lightFor({ cloudiness: 1, intensity: 1, precipitation: 'rain' }, midnight);
    assert.ok(stormNight < clearNight);
    assert.ok(stormNight > clearNight * 0.8, 'weather should not make an already-dark night unreadably black');
});

test('indoor daylight spill consumes the same weather-aware getLightLevel path', () => {
    assert.match(worldTimeSource, /daylightSpill = doorOpen \? getLightLevel\(\) \* 0\.5/);
    assert.match(worldTimeSource, /effectiveCloudiness/);
    assert.match(worldTimeSource, /precipDimming/);
});