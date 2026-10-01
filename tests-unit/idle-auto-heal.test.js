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
        isResting: false,
        isSleeping: false,
        casts: [],
        distance(a, b) {
            return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
        },
        findPath(start, target) {
            if (start.r !== target.r) return null;
            const path = [{ q: start.q, r: start.r }];
            const step = target.q >= start.q ? 1 : -1;
            for (let q = start.q + step; q !== target.q + step; q += step) path.push({ q, r: start.r });
            return path;
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
    const tooFar = entity('Far', { hp: 2, maxHp: 100, q: 11 });
    const eligible = entity('OK', { hp: 3, maxHp: 100, q: 4 });
    world.entities = [caster, moving, tooFar, eligible];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.equal(action.target.name, 'OK');
    assert.equal(action.spell.manaCost, 4, '5-mana version costs 8 in armour and is unavailable');
});

test('Auto Heal never runs in combat, rest, or while disabled, and otherwise uses tryCastSpell', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 1 });
    world.entities = [caster, target];

    world.isInCombat = true;
    assert.equal(world.idleBehaviours.processAutoHeal(), false);
    assert.equal(world.casts.length, 0);

    world.isInCombat = false;
    world.isResting = true;
    assert.equal(world.idleBehaviours.processAutoHeal(), false);
    world.isResting = false;

    world.idleBehaviours.setAutoHealEnabled(false);
    assert.equal(world.idleBehaviours.processAutoHeal(), false);

    world.idleBehaviours.setAutoHealEnabled(true);
    assert.equal(world.idleBehaviours.processAutoHeal(), true);
    assert.equal(world.casts.length, 1);
    assert.equal(world.casts[0].target, target);
});

test('AI-controlled allies are not treated as idle party characters', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10)] });
    const summon = entity('Summon', { hp: 1, maxHp: 10, q: 1 });
    summon.aiControlled = true;
    const partyMember = entity('Hero', { hp: 2, maxHp: 10, q: 1 });
    world.entities = [caster, summon, partyMember];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.equal(action.target, partyMember);
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


test('Auto Heal walks at most five path steps to enter normal spell range before casting', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10, 2)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 7 });
    world.entities = [caster, target];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.equal(action.approachDestination.q, 5);
    assert.equal(action.approachDestination.r, 0);

    assert.equal(world.idleBehaviours.processAutoHeal(), true);
    assert.equal(caster.destination.q, 5);
    assert.equal(caster.destination.r, 0);
    assert.equal(world.casts.length, 0, 'walking happens before casting');

    caster.hex = { ...caster.destination };
    caster.destination = null;
    assert.equal(world.idleBehaviours.processAutoHeal(), true);
    assert.equal(world.casts.length, 1);
    assert.equal(world.casts[0].target, target);
});

test('Auto Heal will not start an approach that needs more than five movement steps', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10, 2)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 8 });
    world.entities = [caster, target];

    assert.equal(world.idleBehaviours.selectAutoHealAction(caster, world.entities), null);
    assert.equal(world.idleBehaviours.processAutoHeal(), false);
    assert.equal(caster.destination, undefined);
});

test('path detours count against the five-step Auto Heal approach allowance', () => {
    const world = makeWorld();
    world.findPath = (start, target) => [
        { q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 },
        { q: 3, r: 1 }, { q: 4, r: 1 }, { q: 5, r: 1 }, { q: 6, r: 0 },
    ];
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10, 1)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 6 });
    world.entities = [caster, target];

    assert.equal(world.idleBehaviours.selectAutoHealAction(caster, world.entities), null);
});
