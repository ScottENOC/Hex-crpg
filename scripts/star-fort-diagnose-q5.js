#!/usr/bin/env node
// Q5: deep-dive on the retreat mechanic, plus a "teleport + hold" variant.
//
// Part A (retreat as it exists today): for every defender that ever
// triggers retreat, record how far from the keep center they started, how
// many hexes they actually walked before dying (or making it), and how far
// from the keep they were at the moment of death. Also confirms whether
// mode ever flips off for an arrival (spoiler from reading the code: it
// doesn't need to — arrival just falls through to normal fight-in-place
// logic while mode stays 'retreat', see aiProcess's atRetreatPoint check).
//
// Part B (Q5 proper): the instant the retreat contingency first fires,
// teleport every living defender straight to an open hex inside the
// hexagon keep, then flip mode back to null and give each of them a new,
// simple standing order — archers hold one of the 6 keep-gap hexes
// (cycled round-robin), everyone else just holds the keep interior. Compare
// win rate / survivors against the current walk-there retreat.
const { chromium } = require('playwright');
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

async function bootPage(browser) {
    const page = await browser.newPage();
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
    await page.waitForFunction(() => window.campaign2NorthwatchFortRegion && window.campaign2NorthwatchGateHex);
    return page;
}

function spawnSetup() {
    // Shared setup, executed inside page.evaluate — returns { defenders, attackers, commander }.
    const center = window.campaign2NorthwatchCenter;
    function getDefenders() {
        return window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive !== undefined);
    }
    const defenderBaseline = getDefenders().map(d => ({ ref: d, hex: { ...d.hex }, maxHp: d.maxHp }));
    const defenders = defenderBaseline.map(d => {
        const e = d.ref;
        e.hp = d.maxHp; e.alive = true; e.unconscious = false;
        e.simKills = 0;
        e.timePoints = 100 + Math.random() * 0.9;
        e.hex = { ...d.hex };
        e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null;
        if (e.combatDirective) e.combatDirective.mode = null;
        e.fled = false; e.disengaged = false;
        e.knownOpponents = new Map();
        e._chaseStuckTurns = 0; e._parkedTurns = 0; e._parkedAtHex = null;
        e.climbing = null;
        e._startDistToKeep = window.distance(e.hex, center);
        e._hexesWalked = 0;
        e._lastTrackedHex = { ...e.hex };
        return e;
    });
    defenders.forEach(e => { if (e.name === 'Commander Ysolde Hart') e.takeFallenArcherPostOnce = true; });
    const commander = defenders.find(e => e.name === 'Commander Ysolde Hart');

    const attackerCount = defenders.length;
    const attackerTypes = [];
    for (let i = 0; i < attackerCount; i++) attackerTypes.push(i % 2 === 0 ? 'orc' : 'goblin');
    const SIX_DIRECTIONS = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
    ];
    const spawnRadius = 30;
    const groupSize = Math.ceil(attackerCount / SIX_DIRECTIONS.length);
    const attackers = attackerTypes.map((type, i) => {
        const dir = SIX_DIRECTIONS[Math.floor(i / groupSize) % SIX_DIRECTIONS.length];
        const withinGroup = i % groupSize;
        const hex = {
            q: center.q + dir.q * spawnRadius + (withinGroup % 4) - 1,
            r: center.r + dir.r * spawnRadius + Math.floor(withinGroup / 4),
        };
        const ent = window.createMonster(type, hex, null, null, 'enemy');
        ent.name = `${ent.name} ${i + 1}`;
        ent.combatDirective = { hostileTo: 'neutral' };
        ent.aiControlled = true;
        ent.hasBeenSeenByPlayer = true;
        ent.timePoints = 100 + Math.random() * 0.9;
        ent.aiState = 'combat';
        ent.parriesRemaining = 3;
        return ent;
    });

    window.entities = [...defenders, ...attackers];
    window.isInCombat = true;
    window.currentTurnEntity = null;
    window.isPausedForReaction = false;
    window.player = attackers[0];
    return { defenders, attackers, commander };
}

async function runPartA(page, maxTicks) {
    return page.evaluate(async ({ maxTicks, spawnSetupSrc }) => {
        const spawnSetup = new Function('return ' + spawnSetupSrc)();
        const { defenders, attackers } = spawnSetup();
        const center = window.campaign2NorthwatchCenter;

        const retreatEvents = new Map();
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        let ticks = 0;
        while (ticks < maxTicks) {
            window.runTickInternal();
            ticks++;
            await sleep(10);
            defenders.forEach(e => {
                // Track distance walked, cheaply: only when hex actually changed.
                if (e._lastTrackedHex.q !== e.hex.q || e._lastTrackedHex.r !== e.hex.r) {
                    e._hexesWalked += window.distance(e._lastTrackedHex, e.hex);
                    e._lastTrackedHex = { ...e.hex };
                }
                const rec = retreatEvents.get(e) || {};
                if (e.combatDirective?.mode === 'retreat' && rec.triggeredTick === undefined) {
                    rec.triggeredTick = ticks;
                    rec.hexesWalkedAtTrigger = e._hexesWalked;
                }
                if (rec.triggeredTick !== undefined && rec.arrivedTick === undefined && e.combatDirective?.retreatTo &&
                    window.distance(e.hex, e.combatDirective.retreatTo) === 0) {
                    rec.arrivedTick = ticks;
                    rec.modeAtArrival = e.combatDirective.mode;
                }
                if (!e.alive && rec.diedTick === undefined) {
                    rec.diedTick = ticks;
                    rec.diedEnRoute = rec.triggeredTick !== undefined && rec.arrivedTick === undefined;
                    rec.distFromKeepAtDeath = window.distance(e.hex, center);
                    rec.hexesWalkedTotal = e._hexesWalked;
                    rec.hexesWalkedSinceTrigger = rec.triggeredTick !== undefined ? (e._hexesWalked - (rec.hexesWalkedAtTrigger || 0)) : null;
                }
                retreatEvents.set(e, rec);
            });
            const defAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
            const atkAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
            if (defAlive === 0 || atkAlive === 0) break;
        }
        window.isInCombat = false;

        const summary = defenders.map(e => {
            const rec = retreatEvents.get(e) || {};
            return {
                name: e.name,
                startDistToKeep: e._startDistToKeep,
                retreated: rec.triggeredTick !== undefined,
                triggeredTick: rec.triggeredTick ?? null,
                madeIt: rec.arrivedTick !== undefined,
                modeAtArrival: rec.modeAtArrival ?? null,
                died: rec.diedTick !== undefined,
                diedEnRoute: !!rec.diedEnRoute,
                distFromKeepAtDeath: rec.distFromKeepAtDeath ?? null,
                hexesWalkedSinceTrigger: rec.hexesWalkedSinceTrigger ?? null,
                hexesWalkedTotal: e._hexesWalked,
                stillAlive: e.alive,
                currentDistToKeep: e.alive ? window.distance(e.hex, center) : null,
                currentMode: e.combatDirective?.mode ?? null,
                fled: !!e.fled,
                disengaged: !!e.disengaged,
            };
        });
        const defendersAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
        const attackersAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
        let winner;
        if (defendersAlive > 0 && attackersAlive === 0) winner = 'defenders';
        else if (attackersAlive > 0 && defendersAlive === 0) winner = 'attackers';
        else winner = 'timeout';
        return { winner, ticks, defendersAlive, attackersAlive, summary };
    }, { maxTicks, spawnSetupSrc: spawnSetup.toString() });
}

async function runPartB(page, maxTicks) {
    return page.evaluate(async ({ maxTicks, spawnSetupSrc }) => {
        const spawnSetup = new Function('return ' + spawnSetupSrc)();
        const { defenders, attackers } = spawnSetup();
        const center = window.campaign2NorthwatchCenter;
        const keepRegion = window.campaign2NorthwatchKeepRegion;
        const gaps = window.campaign2NorthwatchKeepGaps || [];
        const interiorHexes = keepRegion.floorHexes;

        let teleportDone = false;
        function doTeleportAndHold() {
            teleportDone = true;
            // Spiral-fill open interior hexes so defenders don't all stack
            // on the exact same tile; fall back to center if we run out.
            const occupied = new Set();
            const openInterior = interiorHexes.filter(h => {
                const key = `${h.q},${h.r}`;
                if (occupied.has(key)) return false;
                return true;
            });
            let slot = 0;
            const gapDefenders = [];
            const holdDefenders = [];
            defenders.forEach(e => {
                if (!e.alive) return;
                const w = e.equipped?.weapon ? window.items[e.equipped.weapon] : null;
                const isArcher = w?.subType === 'ranged';
                if (isArcher) gapDefenders.push(e); else holdDefenders.push(e);
            });
            // Teleport + assign posts.
            let interiorIdx = 0;
            holdDefenders.forEach(e => {
                const dest = openInterior[interiorIdx % openInterior.length] || center;
                interiorIdx++;
                e.hex = { ...dest }; e.visualQ = dest.q; e.visualR = dest.r; e.destination = null;
                if (e.combatDirective) {
                    e.combatDirective.mode = null;
                    e.combatDirective.contingencies = [];
                    e.combatDirective.constraints = { stayWithinHexes: new Set(interiorHexes.map(h => `${h.q},${h.r}`)) };
                }
            });
            gapDefenders.forEach((e, i) => {
                const gapHex = gaps.length ? gaps[i % gaps.length] : center;
                e.hex = { ...gapHex }; e.visualQ = gapHex.q; e.visualR = gapHex.r; e.destination = null;
                if (e.combatDirective) {
                    e.combatDirective.mode = null;
                    e.combatDirective.contingencies = [];
                    e.combatDirective.constraints = { stayWithinHexes: new Set([`${gapHex.q},${gapHex.r}`, ...interiorHexes.map(h => `${h.q},${h.r}`)]) };
                }
            });
        }

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        let ticks = 0;
        while (ticks < maxTicks) {
            if (!teleportDone && defenders.some(e => e.combatDirective?.mode === 'retreat')) {
                doTeleportAndHold();
            }
            window.runTickInternal();
            ticks++;
            await sleep(10);
            const defAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
            const atkAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
            if (defAlive === 0 || atkAlive === 0) break;
        }
        window.isInCombat = false;

        const defendersAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
        const attackersAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
        let winner;
        if (defendersAlive > 0 && attackersAlive === 0) winner = 'defenders';
        else if (attackersAlive > 0 && defendersAlive === 0) winner = 'attackers';
        else winner = 'timeout';
        return { winner, ticks, defendersAlive, attackersAlive, teleportDone };
    }, { maxTicks, spawnSetupSrc: spawnSetup.toString() });
}

async function main() {
    await waitForServer(BASE_URL, 5000);
    const browser = await chromium.launch({ headless: true });
    const page = await bootPage(browser);

    console.log('=== Q5 Part A: retreat mechanics deep-dive (current behavior) ===');
    const a = await runPartA(page, 8000);
    console.log(`  winner=${a.winner} ticks=${a.ticks} defAlive=${a.defendersAlive} atkAlive=${a.attackersAlive}`);
    const retreated = a.summary.filter(s => s.retreated);
    const madeIt = retreated.filter(s => s.madeIt);
    console.log(`  ${retreated.length}/${a.summary.length} defenders triggered retreat; ${madeIt.length} reached the keep center`);
    madeIt.forEach(s => console.log(`    ARRIVED: ${s.name} — mode at arrival: ${s.modeAtArrival} (still 'retreat'? ${s.modeAtArrival === 'retreat'}), alive now: ${s.stillAlive}`));
    const diedEnRoute = retreated.filter(s => s.diedEnRoute);
    console.log(`  ${diedEnRoute.length} died en route (cut down before reaching the keep):`);
    diedEnRoute.forEach(s => console.log(`    ${s.name}: started ${s.startDistToKeep} hexes from keep, walked ~${s.hexesWalkedSinceTrigger} hexes since triggering, died ${s.distFromKeepAtDeath} hexes from keep`));
    const stillAliveNotArrived = retreated.filter(s => s.stillAlive && !s.madeIt);
    console.log(`  ${stillAliveNotArrived.length} triggered retreat, still alive, NOT yet arrived at end of run:`);
    stillAliveNotArrived.forEach(s => console.log(`    ${s.name}: started ${s.startDistToKeep} hexes out, walked ${s.hexesWalkedTotal} hexes total, currently ${s.currentDistToKeep} hexes from keep, mode=${s.currentMode}, fled=${s.fled}, disengaged=${s.disengaged}`));
    console.log();

    if (process.env.SKIP_PART_B !== '1') {
        console.log('=== Q5 Part B: instant teleport-to-keep + hold (archers to gaps, rest hold interior) ===');
        for (let t = 0; t < 3; t++) {
            const b = await runPartB(page, 10000);
            console.log(`  trial ${t + 1}: winner=${b.winner} ticks=${b.ticks} defAlive=${b.defendersAlive} atkAlive=${b.attackersAlive} teleportTriggered=${b.teleportDone}`);
        }
    }

    await browser.close();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
