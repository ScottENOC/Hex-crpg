from pathlib import Path
import re

root = Path('.')
planner_path = root / 'spellPlanner.js'
test_path = root / 'tests-unit' / 'idle-auto-heal.test.js'
index_path = root / 'index.html'

planner = planner_path.read_text()
tests = test_path.read_text()
index = index_path.read_text()


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected text for {label}')
    if text.count(old) != 1:
        raise SystemExit(f'Expected exactly one match for {label}, found {text.count(old)}')
    return text.replace(old, new, 1)

planner = replace_once(
    planner,
    "const AUTO_HEAL_STORAGE_KEY = 'rpg_idle_auto_heal';\n",
    "const AUTO_HEAL_STORAGE_KEY = 'rpg_idle_auto_heal';\nconst AUTO_HEAL_APPROACH_HEXES = 5;\n",
    'approach constant'
)

planner = replace_once(
    planner,
    "function alreadyReceivingAutoHeal(target, party) {\n    return party.some(member => member !== target && member.pendingCast &&\n        member.pendingCast.target === target && isHealingSpell(member.pendingCast.spell));\n}\n",
    "function alreadyReceivingAutoHeal(target, party, caster) {\n    return party.some(member => member !== target && member !== caster && (\n        (member.pendingCast && member.pendingCast.target === target && isHealingSpell(member.pendingCast.spell)) ||\n        member._autoHealTarget === target\n    ));\n}\n\nfunction getAutoHealApproachDestination(caster, target, spell) {\n    if (!window.distance) return undefined;\n    const range = Math.max(1, Number(spell && spell.range) || 1);\n    const directDistance = window.distance(caster.hex, target.hex);\n    if (directDistance <= range) return null;\n    if (directDistance > range + AUTO_HEAL_APPROACH_HEXES || typeof window.findPath !== 'function') return undefined;\n\n    // Use the real movement path, not just straight-line hex distance. If a\n    // wall/detour means reaching casting range would take >5 actual steps,\n    // Auto Heal leaves the character alone. Path[0] is the caster's hex.\n    const path = window.findPath(caster.hex, target.hex, undefined, caster, true);\n    if (!path || path.length < 2) return undefined;\n    const furthestStep = Math.min(AUTO_HEAL_APPROACH_HEXES, path.length - 1);\n    for (let step = 1; step <= furthestStep; step++) {\n        const hex = path[step];\n        if (window.distance(hex, target.hex) <= range) return { q: hex.q, r: hex.r };\n    }\n    return undefined;\n}\n",
    'incoming heal reservation and approach helper'
)

planner = replace_once(
    planner,
    "        if (alreadyReceivingAutoHeal(target, party)) continue;\n\n        const distance = window.distance ? window.distance(caster.hex, target.hex) : Infinity;\n        const reachable = prepared.filter(spell => distance <= (Number(spell.range) || 1));\n        if (!reachable.length) continue;\n\n        reachable.sort((a, b) => {\n            const eff = healEfficiency(caster, b) - healEfficiency(caster, a);\n            if (Math.abs(eff) > 1e-9) return eff;\n            const aCost = getAutoHealManaCost(caster, a);\n            const bCost = getAutoHealManaCost(caster, b);\n            if (aCost !== bCost) return aCost - bCost;\n            return (b.magnitude || 0) - (a.magnitude || 0);\n        });\n        candidates.push({ target, spell: reachable[0] });\n",
    "        if (alreadyReceivingAutoHeal(target, party, caster)) continue;\n\n        const distance = window.distance ? window.distance(caster.hex, target.hex) : Infinity;\n        const usable = prepared.map(spell => {\n            const range = Math.max(1, Number(spell.range) || 1);\n            if (distance > range + AUTO_HEAL_APPROACH_HEXES) return null;\n            const approachDestination = getAutoHealApproachDestination(caster, target, spell);\n            if (distance > range && !approachDestination) return null;\n            return { spell, approachDestination };\n        }).filter(Boolean);\n        if (!usable.length) continue;\n\n        usable.sort((a, b) => {\n            const eff = healEfficiency(caster, b.spell) - healEfficiency(caster, a.spell);\n            if (Math.abs(eff) > 1e-9) return eff;\n            const aCost = getAutoHealManaCost(caster, a.spell);\n            const bCost = getAutoHealManaCost(caster, b.spell);\n            if (aCost !== bCost) return aCost - bCost;\n            return (b.spell.magnitude || 0) - (a.spell.magnitude || 0);\n        });\n        candidates.push({ target, spell: usable[0].spell, approachDestination: usable[0].approachDestination });\n",
    'range selection'
)

planner = replace_once(
    planner,
    "    for (const caster of party) {\n        const action = selectAutoHealAction(caster, party);\n        if (!action) continue;\n        const started = window.tryCastSpell(action.caster, action.spell, action.target, action.target.hex);\n        if (started !== false) startedAny = true;\n    }\n",
    "    for (const caster of party) {\n        const action = selectAutoHealAction(caster, party);\n        if (!action) {\n            if (!caster.destination && !caster.pendingCast) caster._autoHealTarget = null;\n            continue;\n        }\n        if (action.approachDestination) {\n            caster._autoHealTarget = action.target;\n            caster.destination = { ...action.approachDestination };\n            startedAny = true;\n            continue;\n        }\n        caster._autoHealTarget = null;\n        const started = window.tryCastSpell(action.caster, action.spell, action.target, action.target.hex);\n        if (started !== false) startedAny = true;\n    }\n",
    'approach dispatch'
)

planner = replace_once(
    planner,
    "    help.textContent = 'Outside combat, idle healers may use prepared healing spells on nearby idle party members when the target\\'s health % is below the caster\\'s mana %.';\n",
    "    help.textContent = 'Outside combat, idle healers may walk up to 5 hexes to get within normal spell range, then heal nearby idle party members when the target\\'s health % is below the caster\\'s mana %.';\n",
    'settings help'
)

planner = replace_once(
    planner,
    "    healEfficiency,\n    selectAutoHealAction,\n",
    "    healEfficiency,\n    getAutoHealApproachDestination,\n    selectAutoHealAction,\n",
    'helper export'
)

# Test sandbox gets a deterministic q-axis pathfinder for approach tests.
tests = replace_once(
    tests,
    "        distance(a, b) {\n            return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));\n        },\n",
    "        distance(a, b) {\n            return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));\n        },\n        findPath(start, target) {\n            if (start.r !== target.r) return null;\n            const path = [{ q: start.q, r: start.r }];\n            const step = target.q >= start.q ? 1 : -1;\n            for (let q = start.q + step; q !== target.q + step; q += step) path.push({ q, r: start.r });\n            return path;\n        },\n",
    'test pathfinder'
)

tests = tests.replace("const tooFar = entity('Far', { hp: 2, maxHp: 100, q: 6 });", "const tooFar = entity('Far', { hp: 2, maxHp: 100, q: 11 });", 1)

tests += """

test('Auto Heal walks at most five path steps to enter normal spell range before casting', () => {
    const world = makeWorld();
    const caster = entity('Cleric', { mana: 8, maxMana: 10, spells: [heal(5, 10, 2)] });
    const target = entity('Hero', { hp: 2, maxHp: 10, q: 7 });
    world.entities = [caster, target];

    const action = world.idleBehaviours.selectAutoHealAction(caster, world.entities);
    assert.deepEqual(action.approachDestination, { q: 5, r: 0 });

    assert.equal(world.idleBehaviours.processAutoHeal(), true);
    assert.deepEqual(caster.destination, { q: 5, r: 0 });
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
"""

# The project deliberately cache-busts changed entry scripts for iOS Safari.
m = re.search(r'spellPlanner\.js\?v=(\d+)', index)
if not m:
    raise SystemExit('Could not find spellPlanner cache-busting tag')
next_version = int(m.group(1)) + 1
index = index[:m.start(1)] + str(next_version) + index[m.end(1):]

planner_path.write_text(planner)
test_path.write_text(tests)
index_path.write_text(index)
