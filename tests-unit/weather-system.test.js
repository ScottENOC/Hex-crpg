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
        devicePixelRatio: 1,
        addEventListener() {},
    };
    const sandbox = { window, console };
    vm.runInNewContext(weatherSource, sandbox, { filename: 'weatherSystem.js' });
    return window;
}

test('weather is deterministic from in-game time and has a real annual temperature cycle', () => {
    const w = loadWeatherSandbox();
    const t = 123 * 86400 + 9 * 3600;
    assert.deepEqual(w.getWeatherStateAt(t), w.getWeatherStateAt(t));

    const summer = w.getWeatherStateAt(165 * 86400 + 14 * 3600).temperatureC;
    const winter = w.getWeatherStateAt(345 * 86400 + 14 * 3600).temperatureC;
    assert.ok(summer > winter + 10, `expected summer (${summer}) to be substantially warmer than winter (${winter})`);
});

test('a simulated year contains rain and snow, and precipitation contributes to apparent temperature', () => {
    const w = loadWeatherSandbox();
    let rain = 0;
    let snow = 0;

    for (let seconds = 0; seconds < 360 * 86400; seconds += 3 * 3600) {
        const state = w.getWeatherStateAt(seconds);
        if (state.precipitation === 'rain') {
            rain++;
            assert.ok(state.feelsLikeC < state.temperatureC);
        }
        if (state.precipitation === 'snow') {
            snow++;
            assert.ok(state.temperatureC <= w.weatherSystem.constants.SNOW_CUTOFF_C);
            assert.ok(state.feelsLikeC <= state.temperatureC);
        }
    }

    assert.ok(rain > 0, 'expected at least one rain block in a simulated year');
    assert.ok(snow > 0, 'expected at least one snow block in a simulated year');
});

test('weather is wired into world time and seasonal clothing', () => {
    const worldTime = fs.readFileSync(path.join(root, 'worldTime.js'), 'utf8');
    const clothing = fs.readFileSync(path.join(root, 'seasonalClothing.js'), 'utf8');

    assert.match(worldTime, /weatherSystem\.js/);
    assert.match(worldTime, /seasonalClothing\.js/);
    assert.match(worldTime, /temperatureC/);
    assert.match(clothing, /getFeelsLikeTemperatureC/);
    assert.match(clothing, /shortsThresholdC/);
});

test('precipitation renderer uses an independent overlay canvas and respects graphics accessibility controls', () => {
    assert.match(weatherSource, /weather-overlay-canvas/);
    assert.match(weatherSource, /requestAnimationFrame/);
    assert.match(weatherSource, /window\.reduceMotion/);
    assert.match(weatherSource, /window\.renderScale/);
    assert.match(weatherSource, /isPlayerInside/);
});
