const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'campSystem.js'), 'utf8');

function makeWorld({ terrain = 'Grass', temperature = 2, inventory = ['tent', 'bedroll', 'bedroll', 'bedroll'] } = {}) {
    const hero = { name: 'Hero', alive: true, side: 'player', hex: { q: 0, r: 0 }, equipped: { armor: 'heavy_armor' } };
    const a = { name: 'A', alive: true, side: 'player', hex: hero.hex, equipped: {} };
    const b = { name: 'B', alive: true, side: 'player', hex: hero.hex, equipped: {} };
    const sandbox = {
        console,
        items: {
            tent: { id: 'tent', shelterCapacity: 4 },
            bedroll: { id: 'bedroll' },
            tinderbox: { id: 'tinderbox' },
            heavy_armor: { id: 'heavy_armor', type: 'armor' },
        },
        partyInventory: [...inventory],
        player: hero,
        party: [hero, a, b],
        entities: [hero, a, b],
        worldSeconds: 0,
        isSleeping: false,
        getTerrainAt: () => ({ name: terrain }),
        getAmbientTemperature: () => temperature,
        getEffectiveTemperature: () => temperature,
        showMessage() {},
        updateTime(seconds) { this.worldSeconds += seconds; },
        updateSleepButton() {},
        toggleSleep() {
            this.isSleeping = !this.isSleeping;
            if (this.isSleeping) {
                for (const member of this.entities) member.sleepRemainingSeconds ||= 10 * 3600;
            }
        },
    };
    sandbox.toggleSleep._expedition = true;
    sandbox.updateSleepButton._expedition = true;
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'campSystem.js' });
    sandbox.campSystem.refreshHooks();
    return sandbox;
}

test('make camp consumes setup time and applies available shelter and bedding', () => {
    const world = makeWorld();
    world.toggleSleep();

    assert.equal(world.isSleeping, true);
    assert.equal(world.worldSeconds, 40 * 60);
    assert.equal(world.entities.filter(e => e._sleepTent).length, 3);
    assert.equal(world.entities.filter(e => e._sleepBedroll).length, 3);
    assert.equal(world.entities[0]._campArmourRemoved, true);
    assert.equal(world.entities[0].sleepRemainingSeconds, 8 * 3600);
    assert.equal(world.campSystem.getCamp().sleepHours, 8);
});

test('make camp refuses unsafe water terrain', () => {
    const world = makeWorld({ terrain: 'Deep Water' });
    world.toggleSleep();

    assert.equal(world.isSleeping, false);
    assert.equal(world.worldSeconds, 0);
    assert.equal(world.campSystem.evaluateCampsite().ok, false);
});

test('cold weather makes disliked companions more willing to share shelter', () => {
    const world = makeWorld({ temperature: 15, inventory: ['tent', 'bedroll', 'bedroll', 'bedroll'] });
    const [hero, a] = world.party;
    hero.relationships = { A: -50 };

    const mildPlan = world.campSystem.buildPlan();
    const mildHeroTent = mildPlan.tents.find(t => t.occupants.includes(hero));
    assert.equal(mildHeroTent.occupants.includes(a), false);

    world.getAmbientTemperature = () => -10;
    world.getEffectiveTemperature = () => -10;
    const coldPlan = world.campSystem.buildPlan();
    const coldHeroTent = coldPlan.tents.find(t => t.occupants.includes(hero));
    assert.equal(coldHeroTent.occupants.includes(a), true);
});

test('resuming after an ambush does not reset remaining sleep time', () => {
    const world = makeWorld();
    world.toggleSleep();
    world.entities.forEach(e => { e.sleepRemainingSeconds = 3 * 3600; });
    world.isSleeping = false;
    world._resumeSleepAfterCombat = true;

    world.toggleSleep();

    assert.equal(world.isSleeping, true);
    for (const member of world.entities) assert.equal(member.sleepRemainingSeconds, 3 * 3600);
});
