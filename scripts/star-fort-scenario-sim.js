#!/usr/bin/env node
// The three player-choice scenarios for the Northwatch catapult siege,
// built cheap rather than as one continuous 236-entity sim (which proved
// far too slow once the catapult/knight/hold-position machinery was
// layered on top of a much bigger fort). Each mode "fakes" the parts of
// the story that don't need a full combat sim:
//   - human_sally:  a small ~6-unit fight (player stand-in vs the
//                    catapult + its 3 crew + 2 guards) actually runs.
//                    Everything else in the fort is untouched/idle for
//                    that stretch — nothing to simulate there at all.
//   - human_stay:    nobody contests the catapult, so it just fires its
//                    10 shots at the wall — a direct damageWall call,
//                    no combat needed.
//   - greenskin_join: same undefended firing as human_stay (the player
//                    is embedded with the greenskins, not attacking the
//                    catapult), just with the assault force short one
//                    player-sized slot.
// After the catapult is down (however it got there), all three modes
// run the same real assault-phase sim: the 31-defender garrison vs a
// fresh ring of attackers, spawned already hostile (not holding — the
// "wait for the catapult" story beat is already over by this point).
// Attacker count is +5 for a human-side player (human_sally, human_stay)
// and -5 for a greenskin-side player (greenskin_join), per the design.
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const BASE_URL = 'http://localhost:3000';

const MODE = process.argv[2];
if (!['human_sally', 'human_stay', 'greenskin_join'].includes(MODE)) {
    console.error('Usage: node star-fort-scenario-sim.js <human_sally|human_stay|greenskin_join>');
    process.exit(1);
}

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
    try { await waitForServer(BASE_URL, 1000); return null; }
    catch (e) {
        const proc = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
        await waitForServer(BASE_URL, 15000);
        return proc;
    }
}
async function takeScreenshot(page, label, outDir) {
    await page.evaluate(() => {
        window.cameraZoom = 0.18;
        window.cameraFollowEnabled = false;
        window.centerCameraOn({ q: window.campaign2NorthwatchCenter.q + 15, r: window.campaign2NorthwatchCenter.r });
        document.querySelectorAll('.modal').forEach(el => { el.style.display = 'none'; });
    });
    await page.waitForTimeout(150);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const shotPath = path.join(outDir, `${label}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`  Screenshot saved: ${shotPath}`);
}

async function runTicks(page, maxTicks, checkEvery, onCheck) {
    let ticks = 0;
    while (ticks < maxTicks) {
        await page.evaluate(() => window.runTickInternal());
        await page.waitForTimeout(8);
        ticks++;
        if (ticks % 20 === 0) {
            await page.evaluate(() => {
                (window.__scenarioRoster || []).forEach(e => {
                    if (!e || !e.alive) return;
                    if (e.timePoints < 150) e.timePoints = Math.min(150, e.timePoints + 50);
                    // A fresh attacker spawned 30 hexes out and told to
                    // attack immediately (no holdPosition — the "wait for
                    // the catapult" beat is already over) can rack up 20-30
                    // of its own non-adjacent turns just closing that
                    // distance, which the engine's generic "give up
                    // chasing" heuristic reads as abandoning a fight it
                    // never actually reached yet — confirmed directly (the
                    // same false-mass-disengage pattern already diagnosed
                    // earlier this session, reappearing here because these
                    // attackers intentionally skip the holdPosition gate
                    // that shielded them from it before). Clearing it here
                    // is a sim-only patch, not a real gameplay fix — the
                    // real game's own assault doesn't spawn a fresh 62-unit
                    // ring 30 hexes out mid-fight.
                    // markFled (gameEngine.js) is the harsher sibling of the
                    // same heuristic — a "severely outnumbered, can't reach
                    // anyone" verdict permanently marks fled=true (a
                    // one-shot flag: markFled itself refuses to run twice)
                    // and is EXACTLY the same false-positive for a fresh
                    // attacker that hasn't reached the fight yet. Only
                    // clearing disengaged (as this patch originally did)
                    // left every attacker that hit this harsher branch
                    // permanently benched — reads as "the horde got far
                    // enough away to escape" in the results even though
                    // ticks keep advancing, because they're silently
                    // excluded from the alive-count filter forever, not
                    // actually resolved one way or the other.
                    if (e.disengaged || e.fled) {
                        e.disengaged = false;
                        e.fled = false;
                        if (e.combatDirective) e.combatDirective.mode = null;
                    }
                    e._chaseStuckTurns = 0;
                });
            });
        }
        if (ticks % checkEvery === 0) {
            const done = await onCheck(ticks);
            if (done) return ticks;
        }
    }
    return ticks;
}

async function main() {
    const serverProc = await ensureServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.addInitScript(() => { window.console.log = () => {}; });
    await page.goto(BASE_URL + '/');
    await page.waitForSelector('#race-select', { state: 'visible' });
    await page.selectOption('#race-select', 'human');
    await page.selectOption('#gender-select', 'male');
    await page.selectOption('#class-select', 'fighter');
    await page.selectOption('#campaign-select', '2');
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.campaign2NorthwatchFortRegion && window.campaign2NorthwatchGateHex, { timeout: 30000 });

    const outDir = path.join(__dirname, '..', 'scratchpad-screens');
    console.log(`=== MODE: ${MODE} ===\n`);

    // Fog-of-war workaround (no real player-side entity drives visibility).
    await page.evaluate(() => {
        const center = window.campaign2NorthwatchCenter;
        const region = window.campaign2NorthwatchFortRegion;
        const keepRegion = window.campaign2NorthwatchKeepRegion;
        if (!window.exploredHexes) window.exploredHexes = new Set();
        [...region.floorHexes, ...region.wallHexes, ...keepRegion.floorHexes, ...keepRegion.wallHexes]
            .forEach(h => window.exploredHexes.add(`${h.q},${h.r}`));
        for (let dq = -70; dq <= 70; dq += 2) {
            for (let dr = -70; dr <= 70; dr += 2) {
                if (Math.abs(dq) + Math.abs(dr) <= 80) window.exploredHexes.add(`${center.q + dq},${center.r + dr}`);
            }
        }
        window.isVisibleToPlayer = () => true;
    });

    // --- PHASE 1: get the catapult down, one of three ways ---
    if (MODE === 'human_sally') {
        console.log('Phase 1: sally fight (player stand-in vs catapult + crew + guards)...');
        const setup = await page.evaluate(() => {
            const catapult = window.campaign2NorthwatchCatapult;
            catapult.hp = catapult.maxHp; catapult.alive = true; catapult.firesRemaining = 10;
            catapult.aiState = 'combat'; catapult.timePoints = 100;
            window.catapultHasFired = false;

            const crew = window.entities.filter(e => e.isCatapultCrew);
            crew.forEach(e => { e.hp = e.maxHp; e.alive = true; e.aiState = 'combat'; e.timePoints = 100; });
            const guards = window.entities.filter(e => e.factionTag === 'greenskin_assault' && !e.isCatapultCrew && !e.isCatapult);
            guards.forEach(e => { e.hp = e.maxHp; e.alive = true; e.aiState = 'combat'; e.timePoints = 100; });

            // A fake 4-member player party, level 5 each, standing in for
            // the real player character + companions doing this sally —
            // one member per class archetype, mundane (non-magic) gear
            // only, matching what a level-5 party would plausibly have
            // bought/found by this point.
            const staging = window.campaign2NorthwatchHiddenStagingHex;
            const PARTY_SPEC = [
                {
                    name: 'Elowen', title: 'Wizard', race: 'elf', gender: 'female',
                    classLevels: ['wizard', 'wizard', 'wizard', 'wizard', 'wizard'],
                    skillPicks: ['health', 'health', 'arcane_mana', 'arcane_mana', 'arcane_mana', 'firebolt_hit', 'firebolt_hit', 'firebolt_dmg', 'firebolt_dmg', 'arcane_regen'],
                    equipment: ['dagger', 'light_armor'],
                },
                {
                    name: 'Borin', title: 'Cleric', race: 'dwarf', gender: 'male',
                    classLevels: ['cleric', 'cleric', 'cleric', 'cleric', 'cleric'],
                    skillPicks: ['health', 'health', 'health', 'sword_hit', 'sword_dmg', 'shield_proficiency', 'medium_armor_training', 'learn_heal', 'divine_mana', 'divine_mana'],
                    equipment: ['club', 'wooden_shield', 'medium_armor'],
                },
                {
                    name: 'Nix', title: 'Rogue', race: 'goblin', gender: 'male',
                    classLevels: ['rogue', 'rogue', 'rogue', 'rogue', 'rogue'],
                    skillPicks: ['health', 'health', 'dagger_hit', 'dagger_hit', 'dagger_dmg', 'dagger_dmg', 'stealth_rogue', 'sneak_attack_dmg', 'sneak_attack_dmg', 'light_armor_training'],
                    equipment: ['dagger', 'bow', 'light_armor'],
                },
                {
                    name: 'Halric', title: 'Fighter', race: 'human', gender: 'male',
                    classLevels: ['fighter', 'fighter', 'fighter', 'fighter', 'fighter'],
                    skillPicks: ['health', 'health', 'health', 'sword_hit', 'sword_hit', 'sword_dmg', 'sword_dmg', 'shield_proficiency', 'light_armor_training', 'medium_armor_training'],
                    equipment: ['sword', 'wooden_shield', 'medium_armor'],
                },
            ];
            const party = PARTY_SPEC.map((spec, i) => {
                const member = window.buildNPC({
                    ...spec, side: 'neutral', factionId: 'silverhart_kingdom', color: '#c9a227',
                    hex: { q: staging.q + (i % 2), r: staging.r + Math.floor(i / 2) },
                });
                member.combatDirective = { hostileTo: 'enemy' };
                member.aiState = 'combat';
                member.aiControlled = true;
                member.timePoints = 100;
                window.entities.push(member);
                return member;
            });

            window.isInCombat = true;
            window.currentTurnEntity = null;
            window.player = party[0];
            window.__scenarioRoster = [catapult, ...crew, ...guards, ...party];
            window.__scenarioParty = party;
            return { crewCount: crew.length, guardCount: guards.length };
        });
        console.log(`  Player stand-in spawned at the hidden staging hex. Crew: ${setup.crewCount}. Guards: ${setup.guardCount}.`);

        let lastCurrentTurnName = null, stuckStreak = 0;
        const finalTick = await runTicks(page, 20000, 20, async (ticks) => {
            const stuck = await page.evaluate(() => window.currentTurnEntity ? window.currentTurnEntity.name : null);
            if (stuck && stuck === lastCurrentTurnName) {
                stuckStreak++;
                if (stuckStreak >= 3) {
                    await page.evaluate(() => { window.currentTurnEntity = null; window.isPausedForReaction = false; window.gamePhase = 'WAITING'; });
                    stuckStreak = 0;
                }
            } else stuckStreak = 0;
            lastCurrentTurnName = stuck;

            if (ticks % 500 !== 0) return false;
            const snap = await page.evaluate(() => ({
                catapultAlive: !!window.campaign2NorthwatchCatapult?.alive,
                partyAlive: (window.__scenarioParty || []).filter(e => e.alive).length,
            }));
            console.log(`  tick ${ticks}: catapult alive=${snap.catapultAlive}, party ${snap.partyAlive}/4 alive`);
            return !snap.catapultAlive || snap.partyAlive === 0;
        });
        const result = await page.evaluate(() => ({
            catapultAlive: !!window.campaign2NorthwatchCatapult?.alive,
            partyAlive: (window.__scenarioParty || []).filter(e => e.alive).length,
            partyNames: (window.__scenarioParty || []).filter(e => e.alive).map(e => e.name),
        }));
        console.log(`  Sally result at tick ${finalTick}: catapult destroyed=${!result.catapultAlive}, party ${result.partyAlive}/4 alive (${result.partyNames.join(', ')})\n`);
        await takeScreenshot(page, 'scenario-human_sally-sally-fight', outDir);
        if (result.catapultAlive) {
            console.log('  Party did not bring the catapult down within the tick budget — stopping here rather than faking a result.');
            await browser.close(); if (serverProc) serverProc.kill(); return;
        }
    } else {
        // human_stay / greenskin_join: nobody contests the catapult, so
        // it simply fires its full magazine at the wall — no combat to
        // simulate, just the same window.damageWall call its own AAI
        // block already makes per shot.
        console.log('Phase 1: catapult fires undefended (10 shots)...');
        await page.evaluate(() => {
            const region = window.campaign2NorthwatchFortRegion;
            for (let i = 0; i < 10; i++) {
                const targetWall = region.wallHexes[Math.floor(window.pseudoRandom(i, 7) * region.wallHexes.length)];
                if (targetWall) window.damageWall(targetWall.q, targetWall.r, 10);
            }
            window.campaign2NorthwatchCatapult.hp = 0;
            window.campaign2NorthwatchCatapult.alive = false;
        });
        console.log('  Catapult fired all 10 shots and broke.\n');
        await takeScreenshot(page, `scenario-${MODE}-catapult-spent`, outDir);
    }

    // --- PHASE 2: the real assault — 31 defenders vs an adjusted-size ring ---
    const attackerCount = MODE === 'greenskin_join' ? 57 : 67;
    console.log(`Phase 2: assault — 31 defenders vs ${attackerCount} attackers...`);
    const assaultSetup = await page.evaluate((attackerCount) => {
        const center = window.campaign2NorthwatchCenter;
        const defenders = window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive !== undefined);
        defenders.forEach(e => {
            e.hp = e.maxHp; e.alive = true; e.unconscious = false;
            e.timePoints = 100 + Math.random() * 0.9;
            if (e.combatDirective) e.combatDirective.mode = null;
            e.fled = false; e.disengaged = false;
            e.knownOpponents = new Map();
            e._chaseStuckTurns = 0; e._parkedTurns = 0; e._parkedAtHex = null;
            e.climbing = null;
        });
        const commander = defenders.find(d => d.name === 'Commander Ysolde Hart');
        if (commander) commander.takeFallenArcherPostOnce = true;
        window.northwatchRetreatCalled = false;
        window.coverFireZones = [];

        const attackerTypes = [];
        for (let i = 0; i < attackerCount; i++) attackerTypes.push(i % 2 === 0 ? 'orc' : 'goblin');
        const spawnRadius = 30;
        const attackers = attackerTypes.map((type, i) => {
            const angle = (i / attackerCount) * Math.PI * 2;
            const hex = window.hexRound(center.q + Math.cos(angle) * spawnRadius, center.r + Math.sin(angle) * spawnRadius);
            const ent = window.createMonster(type, hex, null, null, 'enemy');
            ent.name = `${ent.name} ${i + 1}`;
            // Already-triggered assault: hostile and active immediately,
            // no holdPosition — the "wait for the catapult" beat is over.
            ent.combatDirective = { hostileTo: 'neutral' };
            ent.aiControlled = true;
            ent.hasBeenSeenByPlayer = true;
            ent.timePoints = 100 + Math.random() * 0.9;
            ent.aiState = 'combat';
            ent.parriesRemaining = 3;
            return ent;
        });
        window.entities.push(...attackers);
        window.isInCombat = true;
        window.currentTurnEntity = null;
        window.player = attackers[0];
        window.__simDefenders = defenders;
        window.__simAttackers = attackers;
        window.__scenarioRoster = [...defenders, ...attackers];
        return { defenderCount: defenders.length, attackerCount: attackers.length };
    }, attackerCount);
    console.log(`  Defenders: ${assaultSetup.defenderCount}. Attackers: ${assaultSetup.attackerCount}.`);

    let winner = null;
    let lastCurrentTurnName = null, stuckStreak = 0;
    const finalTick = await runTicks(page, 12000, 20, async (ticks) => {
        const stuck = await page.evaluate(() => window.currentTurnEntity ? window.currentTurnEntity.name : null);
        if (stuck && stuck === lastCurrentTurnName) {
            stuckStreak++;
            if (stuckStreak >= 3) {
                await page.evaluate(() => { window.currentTurnEntity = null; window.isPausedForReaction = false; window.gamePhase = 'WAITING'; });
                stuckStreak = 0;
            }
        } else stuckStreak = 0;
        lastCurrentTurnName = stuck;

        if (ticks % 500 !== 0) return false;
        const snap = await page.evaluate(() => ({
            defAlive: window.__simDefenders.filter(e => e.alive && !e.fled && !e.disengaged).length,
            atkAlive: window.__simAttackers.filter(e => e.alive && !e.fled && !e.disengaged).length,
        }));
        console.log(`  tick ${ticks}: defenders ${snap.defAlive}/${assaultSetup.defenderCount} | attackers ${snap.atkAlive}/${assaultSetup.attackerCount}`);
        if (snap.defAlive === 0 && snap.atkAlive > 0) { winner = 'attackers'; return true; }
        if (snap.atkAlive === 0 && snap.defAlive > 0) { winner = 'defenders'; return true; }
        if (snap.defAlive === 0 && snap.atkAlive === 0) { winner = 'mutual wipe'; return true; }
        return false;
    });
    if (!winner) winner = 'tick cap reached, still active';

    const final = await page.evaluate(() => ({
        defAlive: window.__simDefenders.filter(e => e.alive && !e.fled && !e.disengaged).length,
        atkAlive: window.__simAttackers.filter(e => e.alive && !e.fled && !e.disengaged).length,
        defDead: window.__simDefenders.filter(e => !e.alive).length,
        atkDead: window.__simAttackers.filter(e => !e.alive).length,
        commanderAlive: window.__simDefenders.find(e => e.name === 'Commander Ysolde Hart')?.alive,
    }));
    console.log(`\n=== ${MODE} RESULT: ${winner} at tick ${finalTick} ===`);
    console.log(`Defenders: ${final.defAlive}/${assaultSetup.defenderCount} alive, ${final.defDead} dead. Commander alive: ${final.commanderAlive}`);
    console.log(`Attackers: ${final.atkAlive}/${assaultSetup.attackerCount} alive, ${final.atkDead} dead.`);
    await takeScreenshot(page, `scenario-${MODE}-final`, outDir);

    await browser.close();
    if (serverProc) serverProc.kill();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
