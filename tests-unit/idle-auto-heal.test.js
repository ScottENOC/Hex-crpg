const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'spellPlanner.js'), 'utf8');

function makeWorld() {
    const store = new Map();
    const sandbox = {
        console,
        localStorage: {
            getItem: key => store.has(key) ? store.get(key) : null,
            setItem: (key, value) => store.set(key, String(value)),
        },
        entities: [],
        isInCombat: false,
        currentTurnEntity: null,
        isPausedForReaction: false,
        isSleeping: false,
        casts: [],
        distance(a, b) {
            return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
        },
        getArmorSpellPenalty() { return 0; },
        tryCastSpell(caster, spell, target, hex) {
            caster.pendingCast = { spell, target, hex };
            this.casts.push({ caster, spell, target, hex });
            return true;
        },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'spellPlanner.js' });
    return sandbox;
}

function entity(name, { hp = 100, maxHp = 100, mana = 0, maxMana = 0, q = 0, r = 0, spells = [] } = {}) {
    return {
        name,
        alive: true,
        side: 'player',
        hp,
        maxHp,
        currentMana: mana,
        maxMana,
        hex: { q, r },
        createdSpells: spells,
    };
}

function heal(manaCost, magnitude, range = 3, type = 'heal') {
    return {
        name: 'Heal',
        baseId: 'heal',
        type,
        school: 'divine',
        manaCost,
        magnitude,
        range,
        tpCost: 10,
    };
}

test('Auto Heal defaults on and persists its toggle', () => {
    const world = makeWorld();
    assert.equal(world.idleBehaviours.isAutoHealEnabled(), true);

    world.idleBehaviours.setAutoHealEnabled(false);
    assert.equal(world.idleBehaviours.isAutoHealEnabled(), false);
});

test('Auto Heal targets the fewest absolute hitpoints and chooses the best healing per mana', () => {
    const world = makeWorld();
    const caster = entity('Cleric', {
        mana: 80,
        maxMana: 100,
        spells: [heal(6, 5), heal(8, 12), heal(5, 10)],
    });
    const lowerPercentage = entity('A', { hp: 20, maxHp: 100, q: 1 });
    const fewerHitpoints = entity('B', { hp: 10, maxHp: 20, q: 1 });
    world.entities = [caster, lowerPercentage, fewerHitpoints];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.equal(action.target.name, 'B');
    assert.equal(action.spell.manaCost, 5);
    assert.equal(action.spell.magnitude, 10);
});

test('target health percentage must be below caster mana percentage', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 40, maxMana: 100, spells: [heal(5, 5)] });
    const tooHealthy = entity('A', { hp: 9, maxHp: 20, q: 1 }); // 45%; fewer raw HP but fails gate
    const eligible = entity('B', { hp: 30, maxHp: 100, q: 1 }); // 30%
    world.entities = [caster, tooHealthy, eligible];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.equal(action.target.name, 'B');
});

test('Auto Heal respects instructions, range, and effective armour-adjusted mana cost', () => {
    const world = makeWorld();
    world.getArmorSpellPenalty = () => 3;
    const caster = entity('Cleric', {
        mana: 7,
        maxMana: 10,
        spells: [heal(5, 10, 2), heal(4, 6, 5)],
    });
    const moving = entity('Moving', { hp: 1, maxHp: 100, q: 1 });
    moving.destination = { q: 2, r: 0 };
    const tooFar = entity('Far', { hp: 2, maxHp: 100, q: 6 });
    const eligible = entity('OK', { hp: 3, maxHp: 100, q: 4 });
    world.entities = [caster, moving, tooFar, eligible];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.equal(action.target.name, 'OK');
    assert.equal(action.spell.manaCost, 4, '5-mana version costs 8 in armour and is unavailable');
});

test('Auto Heal never runs in combat or while disabled, and otherwise uses tryCastSpell', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 1 });
    world.entities = [caster, target];

    world.isInCombat = true;
    assert.equal(world.idleBehaviours.processAutoHeal(), false);
    assert.equal(world.casts.length, 0);

    world.isInCombat = false;
    world.idleBehaviours.setAutoHealEnabled(false);
    assert.equal(world.idleBehaviours.processAutoHeal(), false);

    world.idleBehaviours.setAutoHealEnabled(true);
    assert.equal(world.idleBehaviours.processAutoHeal(), true);
    assert.equal(world.casts.length, 1);
    assert.equal(world.casts[0].target, target);
});

test('a target with a pending incoming heal is not double-booked', () => {
    const world = makeWorld();
    const firstHealer = entity('A', { mana: 8, maxMana: 10, spells: [heal(5, 10)] });
    const secondHealer = entity('B', { mana: 8, maxMana: 10, spells: [heal(5, 10)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 1 });
    firstHealer.pendingCast = { spell: heal(5, 10), target };
    world.entities = [firstHealer, secondHealer, target];

    assert.equal(world.idleBehaviours.selectAutoHealAction(secondHealer, world.entities), null);
});
