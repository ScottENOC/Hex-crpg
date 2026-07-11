#!/usr/bin/env node
// scripts/ai-balance-sim.js
//
// Headless AI/balance simulation harness. Boots the real game engine in a
// Playwright-driven Chromium page (same bootstrap as tests/helpers.js's
// createCharacter, so buildNPC/createMonster/aiProcess/etc. are all the
// genuine production code), then constructs party/enemy squads directly via
// buildNPC + createMonster, forces them into combat, and drives the actual
// turn loop (runTickInternal) to resolution — no UI clicking, no human.
//
// Usage: node scripts/ai-balance-sim.js
//
// This is a dev/analysis tool, not part of the Playwright test suite (it
// asserts nothing — it just runs fights and prints numbers).

const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function waitForServer(url, timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            http.get(url, (res) => { res.resume(); resolve(); })
                .on('error', () => {
                    if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
                    else setTimeout(tryOnce, 300);
                });
        };
        tryOnce();
    });
}

async function ensureServer() {
    try {
        await waitForServer(BASE_URL, 1000);
        return null; // already running
    } catch (e) {
        const proc = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
        await waitForServer(BASE_URL, 15000);
        return proc;
    }
}

// Injected into the page — everything below runs inside the browser, with
// full access to window.buildNPC/createMonster/runTickInternal/etc.
const IN_PAGE_LIB = () => {
    // --- Combatant construction ---------------------------------------
    // classSpec: { race, classLevels: [...], skillPicks: [...], equipment: [...],
    //              name, spells: [{baseId, magnitudeBonus, rangeBonus}] }
    function buildCombatant(spec, side) {
        const ent = window.buildNPC({
            name: spec.name, title: spec.title || null,
            race: spec.race, gender: spec.gender || 'male',
            hex: spec.hex, classLevels: spec.classLevels, skillPicks: spec.skillPicks || [],
            equipment: spec.equipment || [], side, factionId: null, color: spec.color || 'white',
        });
        ent.aiControlled = true; // party members fight via aiProcess too, no human
        ent.hasBeenSeenByPlayer = true;
        ent.timePoints = 100;
        ent.aiState = 'combat';
        ent.parriesRemaining = 3;
        // Manually "build" any requested spells (createSpell()'s job normally —
        // see the research: unlockedBaseSpells alone does NOT make an entity
        // cast; createdSpells is the actual castable-spell list AI reads).
        // Zero metamagic modifiers (default range/magnitude/no extra targets) —
        // the normal, unmodified path; metamagic is optional in this game, not
        // required for a spell to function.
        if (spec.spells && spec.spells.length) {
            ent.createdSpells = ent.createdSpells || [];
            spec.spells.forEach(s => {
                const base = window.baseSpells[s.baseId];
                if (!base) return;
                ent.createdSpells.push({
                    name: base.name, school: base.school, baseId: s.baseId,
                    manaCost: base.baseMana, coreManaCost: base.baseMana,
                    tpCost: 10, magnitude: base.baseMagnitude, range: base.baseRange || 6,
                    radius: 0, extraTargets: 0, type: base.type,
                });
            });
        }
        return ent;
    }

    function gearValue(ent) {
        let total = 0;
        Object.values(ent.equipped || {}).forEach(id => { if (id && window.items[id]) total += window.items[id].buyPrice || 0; });
        return total;
    }

    // --- Fight driver ----------------------------------------------------
    function placeLine(entities, startQ, r, dq) {
        entities.forEach((e, i) => {
            e.hex = { q: startQ + i * dq, r };
            e.visualQ = e.hex.q; e.visualR = e.hex.r;
            e.startQ = e.hex.q; e.startR = e.hex.r;
            e.destination = null; e.moveCooldown = 0;
        });
    }

    function runFight(partySpecs, enemySpecs, opts) {
        opts = opts || {};
        const maxTicks = opts.maxTicks || 4000;

        window.entities = [];
        window.isInCombat = true;
        window.gamePhase = 'PLAYER_TURN';
        window.currentTurnEntity = null;

        const party = partySpecs.map(s => buildCombatant(s, 'player'));
        const enemies = enemySpecs.map(s => buildCombatant(s, 'enemy'));
        placeLine(party, 0, 0, 1);
        placeLine(enemies, 6, 0, 1); // 6 hexes of open ground between the lines
        window.entities.push(...party, ...enemies);
        window.player = party[0];

        const partyStartHp = party.reduce((a, e) => a + e.hp, 0);
        const enemyStartHp = enemies.reduce((a, e) => a + e.hp, 0);

        let ticks = 0;
        let turnsTaken = 0;
        const prevCurrent = { name: null };
        while (ticks < maxTicks) {
            window.runTickInternal();
            ticks++;
            if (window.currentTurnEntity && window.currentTurnEntity.name !== prevCurrent.name) {
                turnsTaken++;
                prevCurrent.name = window.currentTurnEntity.name;
            }
            const partyAlive = window.entities.filter(e => e.side === 'player' && e.alive);
            const enemiesAlive = window.entities.filter(e => e.side === 'enemy' && e.alive);
            if (partyAlive.length === 0 || enemiesAlive.length === 0) break;
        }
        window.isInCombat = false;

        const partyAlive = window.entities.filter(e => e.side === 'player' && e.alive);
        const enemiesAlive = window.entities.filter(e => e.side === 'enemy' && e.alive);
        const partyEndHp = window.entities.filter(e => e.side === 'player').reduce((a, e) => a + Math.max(0, e.hp), 0);
        const enemyEndHp = window.entities.filter(e => e.side === 'enemy').reduce((a, e) => a + Math.max(0, e.hp), 0);

        let winner;
        if (partyAlive.length > 0 && enemiesAlive.length === 0) winner = 'party';
        else if (enemiesAlive.length > 0 && partyAlive.length === 0) winner = 'enemy';
        else winner = 'timeout';

        return {
            winner, ticks, turnsTaken,
            partySurvivors: partyAlive.length, partyTotal: party.length,
            partyHpFractionRemaining: partyStartHp ? partyEndHp / partyStartHp : 0,
            enemyHpFractionRemaining: enemyStartHp ? enemyEndHp / enemyStartHp : 0,
            partyGearValue: party.reduce((a, e) => a + gearValue(e), 0),
        };
    }

    window.aiSim = { buildCombatant, runFight, gearValue };
};

// --- Scenario definitions (node side) -----------------------------------

const WEAPON_SETS = {
    wizard: ['dagger'],
    rogue: ['dagger', 'light_armor'],
    fighter: ['sword', 'medium_armor', 'wooden_shield'],
    cleric: ['club', 'medium_armor'],
    paladin: ['sword', 'heavy_armor', 'wooden_shield'],
    ranger: ['bow', 'light_armor'],
};

function level5(spec) { return { ...spec }; } // classLevels arrays already encode level via array length

const ARCHETYPES = {
    elf_wizard: {
        name: 'Elf Wizard', race: 'elf', classLevels: Array(5).fill('wizard'),
        skillPicks: ['learn_firebolt', 'arcane_mana', 'arcane_mana', 'health'],
        equipment: WEAPON_SETS.wizard,
        spells: [{ baseId: 'firebolt' }],
    },
    goblin_rogue: {
        name: 'Goblin Rogue', race: 'goblin', classLevels: Array(5).fill('rogue'),
        skillPicks: ['stealth_rogue', 'stealth_rogue', 'dagger_hit', 'dagger_dmg', 'health'],
        equipment: WEAPON_SETS.rogue,
    },
    dwarf_fighter: {
        name: 'Dwarf Fighter', race: 'dwarf', classLevels: Array(5).fill('fighter'),
        skillPicks: ['sword_hit', 'sword_dmg', 'health', 'heavy_armor_training', 'health'],
        equipment: WEAPON_SETS.fighter,
    },
    human_cleric: {
        name: 'Human Cleric', race: 'human', classLevels: Array(5).fill('cleric'),
        skillPicks: ['learn_heal', 'divine_mana', 'divine_mana', 'health'],
        equipment: WEAPON_SETS.cleric,
        spells: [{ baseId: 'heal' }],
    },
    human_paladin: {
        name: 'Human Paladin (fighter+cleric)', race: 'human',
        classLevels: [...Array(3).fill('fighter'), ...Array(2).fill('cleric')],
        skillPicks: ['sword_hit', 'sword_dmg', 'health', 'learn_heal', 'heavy_armor_training'],
        equipment: WEAPON_SETS.paladin,
        spells: [{ baseId: 'heal' }],
    },
    elf_ranger: {
        name: 'Elf Ranger (druid+fighter)', race: 'elf',
        classLevels: [...Array(3).fill('fighter'), ...Array(2).fill('druid')],
        skillPicks: ['bow_hit', 'bow_dmg', 'health', 'health', 'stealth_agility'],
        equipment: WEAPON_SETS.ranger,
    },
    // High-level variant of the same dwarf fighter archetype: 10 class
    // levels (double) instead of 5, and a much heavier skill investment
    // (weapon skills only pushed to their real maxRanks cap — sword tops
    // out at 1 dmg rank — with the rest sunk into health/armor/parry) —
    // used to see whether a solo character can out-scale being outnumbered
    // 3:1 by goblins with enough levels/gear, rather than always losing
    // regardless of build.
    // Deliberately no reaction skills (sword_parry etc.) — those pause combat
    // waiting for a UI prompt (window.isPausedForReaction) that a headless
    // aiControlled entity never answers, permanently freezing every fight
    // afterward in the same page session. Extra picks instead go to health
    // and armor progression.
    dwarf_fighter_lvl10: {
        name: 'Dwarf Fighter (lvl 10)', race: 'dwarf', classLevels: Array(10).fill('fighter'),
        skillPicks: [
            'sword_hit', 'sword_dmg',
            'light_armor_training', 'medium_armor_training', 'heavy_armor_training',
            'health', 'health', 'health', 'health', 'health', 'health', 'health', 'health',
        ],
        equipment: WEAPON_SETS.fighter,
    },
    // Fights unarmed — unarmed_dmg is a no-op in the current damage formula
    // (resolveAttack keys off `${weapon.id}_dmg`, and there's no weapon to
    // key off of unarmed), so a monk's real damage scaling has to come from
    // the generic strength-tree 'meleeDamage' skill instead. Left off any
    // reaction skills (trip_reaction/deflect_arrows) for the same reason as
    // the fighter archetypes above.
    human_monk: {
        name: 'Human Monk', race: 'human', classLevels: Array(5).fill('monk'),
        skillPicks: ['unarmed_hit', 'unarmed_dmg', 'swift_step', 'agile_climber', 'meleeDamage', 'meleeDamage', 'health', 'health'],
        equipment: [],
    },
    // Gish: fighter durability/melee + a wizard's firebolt as backup ranged
    // burst. Mirrors human_paladin's shape (3 fighter levels + 2 caster
    // levels) but with wizard instead of cleric.
    elf_spellblade: {
        name: 'Elf Spellblade (wizard+fighter)', race: 'elf',
        classLevels: [...Array(3).fill('fighter'), ...Array(2).fill('wizard')],
        skillPicks: ['sword_hit', 'sword_dmg', 'health', 'learn_firebolt', 'arcane_mana'],
        equipment: ['sword', 'medium_armor'],
        spells: [{ baseId: 'firebolt' }],
    },
};

// Weapon-scaling matrix: for each weapon, build a level-10 fighter whose
// weapon-tree picks are pushed to that weapon's real maxRanks cap (not an
// arbitrary number — axe's generateWeaponSkills call passes maxDmgRanks=3,
// every other weapon here defaults to 1), with the remaining skill budget
// sunk into health. This is the "late game investment" comparison: a
// weapon whose _dmg skill can only ever reach rank 1 cannot out-scale one
// that goes to rank 3, no matter how many levels you pour in.
const WEAPON_MAX_DMG_RANKS = { sword: 1, axe: 3, spear: 1, club: 1, dagger: 1, bow: 1 };
function highLevelWeaponFighter(weapon) {
    const dmgRanks = WEAPON_MAX_DMG_RANKS[weapon] || 1;
    // No reaction skills here either (see dwarf_fighter_lvl10's comment) —
    // parry/feint stall a headless fight forever waiting on a UI prompt.
    const picks = [`${weapon}_hit`, ...Array(dmgRanks).fill(`${weapon}_dmg`), 'health', 'health', 'health', 'health', 'health', 'health', 'health', 'heavy_armor_training'];
    return {
        name: `Fighter (lvl10) w/ ${weapon}`, race: 'dwarf', classLevels: Array(10).fill('fighter'),
        skillPicks: picks, equipment: [weapon, 'medium_armor'],
    };
}

function enemySquad(type, count, healthRank) {
    return Array.from({ length: count }, (_, i) => ({
        name: `${type}_${i}`, race: null, classLevels: null,
        __monster: { type, customSkills: { health: healthRank, meleeDamage: healthRank } },
    }));
}

// customSkills: null keeps the monster template's own hand-tuned skills
// (createMonster replaces rather than merges skills when customSkills is
// given) — needed for the dragon templates, whose firebolt_hit/arcane_mana
// skills back the mana pool their pre-baked Dragon Breath createdSpells
// entry draws from; passing a healthRank override here would silently
// leave them unable to actually cast it.
function namedMonster(type, name) {
    return { name: name || type, race: null, classLevels: null, __monster: { type, customSkills: null } };
}

// Boots a fresh page and installs window.aiSim.runFightMixed on it. Split
// out of main() so a crashed/closed page (long sim runs accumulate a lot of
// combat-log/floating-text/DOM state across hundreds of fights in one tab —
// this harness has hit "Target page, context or browser has been closed"
// after ~70 fights in a single session) can be transparently replaced
// mid-run instead of losing the whole harness invocation.
async function bootPage(browser) {
    const page = await browser.newPage();
    // The combat log calls console.log for every hit/miss/kill message —
    // across hundreds of headless fights in one tab that's tens of
    // thousands of CDP console events, which appears to be what eventually
    // crashes the tab ("Target page, context or browser has been closed").
    // Silencing it before any game code runs is a pure perf/stability win
    // with no behavioral effect (the harness never reads console output).
    await page.addInitScript(() => { window.console.log = () => {}; });
    await page.goto(BASE_URL + '/');
    // Bootstrap the engine exactly like tests/helpers.js's createCharacter,
    // then hand off to our own scenario code — we don't need the resulting
    // character, just a fully-initialized window.entities/terrain/skills world.
    await page.waitForSelector('#race-select', { state: 'visible' });
    await page.selectOption('#race-select', 'human');
    await page.selectOption('#gender-select', 'male');
    await page.selectOption('#class-select', 'fighter');
    await page.selectOption('#campaign-select', '1');
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.entities && window.entities.length > 0);

    await page.evaluate(IN_PAGE_LIB);
    // createMonster-based enemy support: extend runFight's buildCombatant use
    // by pre-building monster entities via createMonster and merging them in.
    await page.evaluate(() => {
        const origRunFight = window.aiSim.runFight;
        window.aiSim.runFightMixed = async function(partySpecs, enemyDefs, opts) {
            opts = opts || {};
            // aiProcess frequently continues a turn via setTimeout(...,20)
            // (re-arming, stalking, gaze/song abilities, etc.) rather than
            // finishing synchronously. Driving runTickInternal in a tight
            // synchronous loop never lets those timeouts fire, so every
            // fight stalled forever on whichever entity's turn it started.
            // Yielding a macrotask between ticks lets the browser's timer
            // queue actually drain.
            const maxTicks = opts.maxTicks || 500;
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            window.entities = [];
            window.isInCombat = true;
            window.currentTurnEntity = null;
            // Defensive: a reaction skill (parry etc.) left mid-resolution
            // from an earlier fight would otherwise freeze every fight after
            // it for the rest of this page session.
            window.isPausedForReaction = false;
            const party = partySpecs.map(s => window.aiSim.buildCombatant(s, 'player'));
            const enemies = enemyDefs.map((d, i) => {
                if (d.__monster) {
                    const m = window.createMonster(d.__monster.type, { q: 6 + i, r: 0 }, d.__monster.customSkills, null, 'enemy');
                    m.name = d.name; m.aiState = 'combat'; m.timePoints = 100; m.hasBeenSeenByPlayer = true;
                    return m;
                }
                return window.aiSim.buildCombatant(d, 'enemy');
            });
            party.forEach((e, i) => { e.hex = { q: i, r: 0 }; e.visualQ = e.hex.q; e.visualR = e.hex.r; e.startQ = e.hex.q; e.startR = e.hex.r; e.destination = null; });
            enemies.forEach((e, i) => { e.hex = { q: 6 + i, r: 0 }; e.visualQ = e.hex.q; e.visualR = e.hex.r; e.startQ = e.hex.q; e.startR = e.hex.r; e.destination = null; });
            window.entities.push(...party, ...enemies);
            window.player = party[0];
            const partyStartHp = party.reduce((a, e) => a + e.hp, 0);
            const enemyStartHp = enemies.reduce((a, e) => a + e.hp, 0);
            let ticks = 0;
            while (ticks < maxTicks) {
                window.runTickInternal();
                ticks++;
                // Let any queued setTimeout(...,20) AI continuations run
                // before we check win/loss or force the next tick.
                await sleep(12);
                const pa = window.entities.filter(e => e.side === 'player' && e.alive);
                const ea = window.entities.filter(e => e.side === 'enemy' && e.alive);
                if (pa.length === 0 || ea.length === 0) break;
            }
            window.isInCombat = false;
            const partyAlive = window.entities.filter(e => e.side === 'player' && e.alive);
            const enemiesAlive = window.entities.filter(e => e.side === 'enemy' && e.alive);
            const partyEndHp = window.entities.filter(e => e.side === 'player').reduce((a, e) => a + Math.max(0, e.hp), 0);
            const enemyEndHp = window.entities.filter(e => e.side === 'enemy').reduce((a, e) => a + Math.max(0, e.hp), 0);
            let winner;
            if (partyAlive.length > 0 && enemiesAlive.length === 0) winner = 'party';
            else if (enemiesAlive.length > 0 && partyAlive.length === 0) winner = 'enemy';
            else winner = 'timeout';
            return {
                winner, ticks,
                partySurvivors: partyAlive.length, partyTotal: party.length,
                partyHpFractionRemaining: partyStartHp ? partyEndHp / partyStartHp : 0,
                enemyHpFractionRemaining: enemyStartHp ? enemyEndHp / enemyStartHp : 0,
            };
        };
    });
    return page;
}

async function main() {
    const serverProc = await ensureServer();
    const browser = await chromium.launch({ headless: true });
    let page = await bootPage(browser);

    // Wraps a page.evaluate call; on a crashed/closed page, boots a
    // replacement (once) and retries instead of aborting the whole run.
    async function evalWithRecovery(fn, arg) {
        try {
            return await page.evaluate(fn, arg);
        } catch (e) {
            if (!/closed|crash/i.test(e.message)) throw e;
            console.log(`  [page died: ${e.message} — rebooting and retrying]`);
            page = await bootPage(browser);
            return await page.evaluate(fn, arg);
        }
    }

    const results = [];
    async function run(label, partyKeys, enemyType, enemyCount, healthRank, trials) {
        trials = trials || 5;
        const outcomes = [];
        for (let t = 0; t < trials; t++) {
            const partySpecs = partyKeys.map(k => ARCHETYPES[k]);
            const enemyDefs = enemySquad(enemyType, enemyCount, healthRank);
            const r = await evalWithRecovery(({ partySpecs, enemyDefs }) => window.aiSim.runFightMixed(partySpecs, enemyDefs), { partySpecs, enemyDefs });
            outcomes.push(r);
        }
        const winRate = outcomes.filter(o => o.winner === 'party').length / outcomes.length;
        const avgHpLeft = outcomes.reduce((a, o) => a + o.partyHpFractionRemaining, 0) / outcomes.length;
        const avgTicks = outcomes.reduce((a, o) => a + o.ticks, 0) / outcomes.length;
        const row = { label, winRate, avgHpLeft, avgTicks, n: trials };
        results.push(row);
        console.log(`${label.padEnd(55)} winRate=${(winRate * 100).toFixed(0).padStart(3)}%  avgPartyHpLeft=${(avgHpLeft * 100).toFixed(0).padStart(3)}%  avgTicks=${avgTicks.toFixed(0)}`);
        return row;
    }

    console.log('\n=== SOLO FIGHTS (1 character vs N goblins, healthRank=1) ===');
    for (const key of Object.keys(ARCHETYPES)) {
        await run(`${key} solo vs 1 goblin`, [key], 'goblin', 1, 1, 4);
        await run(`${key} solo vs 3 goblins`, [key], 'goblin', 3, 1, 4);
        await run(`${key} solo vs 1 wolf`, [key], 'wolf', 1, 1, 4);
        await run(`${key} solo vs 1 orc`, [key], 'orc', 1, 2, 4);
    }

    console.log('\n=== FULL PARTY (wizard+rogue+fighter+cleric) vs enemy squads ===');
    const fullParty = ['elf_wizard', 'goblin_rogue', 'dwarf_fighter', 'human_cleric'];
    await run('party vs 4 goblins', fullParty, 'goblin', 4, 1, 5);
    await run('party vs 6 goblins', fullParty, 'goblin', 6, 1, 5);
    await run('party vs 3 orcs', fullParty, 'orc', 3, 2, 5);
    await run('party vs 2 trolls', fullParty, 'troll', 2, 3, 5);
    await run('party vs 1 troll', fullParty, 'troll', 1, 4, 5);

    console.log('\n=== DUAL-CLASS COMPARISON (vs 1 goblin, discriminating benchmark) ===');
    await run('paladin solo vs 1 goblin', ['human_paladin'], 'goblin', 1, 1, 6);
    await run('fighter solo vs 1 goblin (baseline)', ['dwarf_fighter'], 'goblin', 1, 1, 6);
    await run('ranger solo vs 1 goblin', ['elf_ranger'], 'goblin', 1, 1, 6);
    await run('cleric solo vs 1 goblin (baseline)', ['human_cleric'], 'goblin', 1, 1, 6);
    await run('paladin vs 1 orc', ['human_paladin'], 'orc', 1, 2, 4);
    await run('ranger vs 1 orc', ['elf_ranger'], 'orc', 1, 2, 4);
    await run('fighter vs 1 orc (baseline)', ['dwarf_fighter'], 'orc', 1, 2, 4);

    console.log('\n=== WEAPON COMPARISON (dwarf fighter, same skill points, different weapon, vs 1 goblin) ===');
    for (const weapon of ['sword', 'axe', 'spear', 'club', 'dagger', 'bow']) {
        const spec = {
            ...ARCHETYPES.dwarf_fighter,
            name: `fighter_${weapon}`,
            skillPicks: [`${weapon}_hit`, `${weapon}_hit`, `${weapon}_dmg`, 'health', 'health'],
            equipment: [weapon, 'medium_armor'],
        };
        ARCHETYPES[`__tmp_${weapon}`] = spec;
        await run(`fighter w/ ${weapon} vs 1 goblin`, [`__tmp_${weapon}`], 'goblin', 1, 1, 6);
    }

    console.log('\n=== HIGH-LEVEL SOLO vs 3 GOBLINS (does leveling/investment overcome being outnumbered 3:1?) ===');
    await run('dwarf_fighter (lvl 5, baseline) solo vs 3 goblins', ['dwarf_fighter'], 'goblin', 3, 1, 6);
    await run('dwarf_fighter (lvl 10, heavy invest) solo vs 3 goblins', ['dwarf_fighter_lvl10'], 'goblin', 3, 1, 6);
    await run('dwarf_fighter (lvl 10, heavy invest) solo vs 6 goblins', ['dwarf_fighter_lvl10'], 'goblin', 6, 1, 6);
    await run('dwarf_fighter (lvl 10, heavy invest) solo vs 3 orcs', ['dwarf_fighter_lvl10'], 'orc', 3, 2, 6);

    console.log('\n=== LATE-GAME WEAPON SCALING (lvl 10 fighter, weapon skills at real maxRanks cap, vs 3 goblins) ===');
    for (const weapon of ['sword', 'axe', 'spear', 'club', 'dagger', 'bow']) {
        ARCHETYPES[`__lvl10_${weapon}`] = highLevelWeaponFighter(weapon);
        await run(`lvl10 fighter w/ ${weapon} (maxRanks dmg=${WEAPON_MAX_DMG_RANKS[weapon]}) vs 3 goblins`, [`__lvl10_${weapon}`], 'goblin', 3, 1, 6);
    }
    console.log('\n--- same late-game weapon builds, vs a single tougher orc (healthRank=3) ---');
    for (const weapon of ['sword', 'axe', 'spear', 'club', 'dagger', 'bow']) {
        await run(`lvl10 fighter w/ ${weapon} vs 1 tough orc`, [`__lvl10_${weapon}`], 'orc', 1, 3, 6);
    }

    console.log('\n=== PARTY COMPOSITION SHOWDOWN (all four parties vs the same encounters) ===');
    const balancedParty = fullParty; // elf_wizard, goblin_rogue, dwarf_fighter, human_cleric
    const fourFighters = ['dwarf_fighter', 'dwarf_fighter', 'dwarf_fighter', 'dwarf_fighter'];
    const fourWizards = ['elf_wizard', 'elf_wizard', 'elf_wizard', 'elf_wizard'];
    const metaParty = ['elf_ranger', 'human_monk', 'human_paladin', 'elf_spellblade'];

    const compositions = [
        ['balanced (wizard/rogue/fighter/cleric)', balancedParty],
        ['4 fighters', fourFighters],
        ['4 wizards', fourWizards],
        ['meta (ranger/monk/paladin/spellblade)', metaParty],
    ];

    // "How many goblins can this party beat?" — escalate the goblin count
    // until win rate drops to/below 50%, rather than testing one arbitrary
    // fixed count that tells you "yes" or "no" but not where the real
    // ceiling is. Stops early on two consecutive 0% results (once a party
    // is clearly broken there's no need to keep climbing).
    async function findGoblinCapacity(label, party) {
        let lastGoodCount = 0;
        let consecutiveZero = 0;
        for (const count of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) {
            const row = await run(`${label} vs ${count} goblins`, party, 'goblin', count, 1, 4);
            if (row.winRate >= 0.5) { lastGoodCount = count; consecutiveZero = 0; }
            else {
                consecutiveZero++;
                if (consecutiveZero >= 2) break;
            }
        }
        console.log(`  -> ${label}: can reliably beat up to ~${lastGoodCount} goblins`);
        return lastGoodCount;
    }

    console.log('--- how many goblins can each party beat? ---');
    for (const [label, party] of compositions) {
        await findGoblinCapacity(label, party);
    }

    console.log('--- vs a young dragon ---');
    async function fightDragon(partySpecs, trials, maxTicks) {
        const enemyDefs = [namedMonster('dragon_young', 'Young Dragon')];
        const outcomes = [];
        for (let t = 0; t < trials; t++) {
            outcomes.push(await evalWithRecovery(({ partySpecs, enemyDefs, maxTicks }) => window.aiSim.runFightMixed(partySpecs, enemyDefs, { maxTicks }), { partySpecs, enemyDefs, maxTicks }));
        }
        const winRate = outcomes.filter(o => o.winner === 'party').length / outcomes.length;
        const avgHpLeft = outcomes.reduce((a, o) => a + o.partyHpFractionRemaining, 0) / outcomes.length;
        const avgTicks = outcomes.reduce((a, o) => a + o.ticks, 0) / outcomes.length;
        return { winRate, avgHpLeft, avgTicks };
    }
    for (const [label, party] of compositions) {
        const partySpecs = party.map(k => ARCHETYPES[k]);
        const r = await fightDragon(partySpecs, 5, 700);
        console.log(`${(label + ' vs young dragon').padEnd(55)} winRate=${(r.winRate * 100).toFixed(0).padStart(3)}%  avgPartyHpLeft=${(r.avgHpLeft * 100).toFixed(0).padStart(3)}%  avgTicks=${r.avgTicks.toFixed(0)}`);
        results.push({ label: label + ' vs young dragon', ...r, n: 5 });
    }

    // What level does the (balanced) party need to be to beat the dragon,
    // now that it's actually fixed (enough mana for one cast, and grounds
    // for melee once out of mana instead of kiting forever)? Scale all four
    // core archetypes up in class levels together, dumping any extra skill
    // picks beyond each one's original build into health (a conservative
    // scaling — not cherry-picking mana/damage ranks to make this look better).
    function scaledBalancedParty(level) {
        const scale = (base, cls) => ({
            ...base,
            classLevels: Array(level).fill(cls),
            skillPicks: [...base.skillPicks, ...Array(Math.max(0, level - 5)).fill('health')],
        });
        return [
            scale(ARCHETYPES.elf_wizard, 'wizard'),
            scale(ARCHETYPES.goblin_rogue, 'rogue'),
            scale(ARCHETYPES.dwarf_fighter, 'fighter'),
            scale(ARCHETYPES.human_cleric, 'cleric'),
        ];
    }
    console.log('--- what level does the balanced party need to beat the young dragon? ---');
    for (const level of [5, 10, 15, 20, 25, 30]) {
        const r = await fightDragon(scaledBalancedParty(level), 5, 700);
        console.log(`balanced party @ lvl ${String(level).padEnd(3)} vs young dragon`.padEnd(55) + `winRate=${(r.winRate * 100).toFixed(0).padStart(3)}%  avgPartyHpLeft=${(r.avgHpLeft * 100).toFixed(0).padStart(3)}%  avgTicks=${r.avgTicks.toFixed(0)}`);
        if (r.winRate >= 0.75) { console.log(`  -> reliably wins from level ${level}`); break; }
    }

    console.log('\n=== AI TWEAK: focus-fire lowest-HP target vs baseline targeting ===');
    await run('party vs 4 goblins (baseline AI)', fullParty, 'goblin', 4, 1, 6);
    await page.evaluate(() => {
        window.__origTargetPriorityCompare = window.targetPriorityCompare;
        window.targetPriorityCompare = function(entity, a, b, opponentsHaveHealer) {
            // Tweak: always prefer the lower-current-HP target (pure focus
            // fire), ignoring the existing downed-target deprioritization.
            return a.hp - b.hp;
        };
    });
    await run('party vs 4 goblins (focus-fire tweak)', fullParty, 'goblin', 4, 1, 6);
    await page.evaluate(() => { window.targetPriorityCompare = window.__origTargetPriorityCompare; });

    console.log('\nDone.');
    await browser.close();
    if (serverProc) { try { process.kill(-serverProc.pid); } catch (e) {} }
}

main().catch(e => { console.error(e); process.exit(1); });
