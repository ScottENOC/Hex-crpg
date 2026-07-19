#!/usr/bin/env node
// Diagnostic run: same Northwatch assault setup as star-fort-assault-test.js,
// but instrumented to answer three specific questions instead of the usual
// win/loss summary:
//   1. Who acts first — attacker or defender — across the opening 20 turns?
//   2. How far from the wall does each attacker actually spawn, and how much
//      HP do they have by the time they first reach a wall-adjacent hex?
//   3. Does disabling the wall garrison's retreat contingency change the
//      outcome (run twice: retreat on, retreat off)?
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
    try { await waitForServer(BASE_URL, 1000); return null; }
    catch (e) {
        const proc = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
        await waitForServer(BASE_URL, 15000);
        return proc;
    }
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

async function runDiagnostic(page, { spawnRadius, disableRetreat, attackerMultiplier, maxTicks }) {
    return page.evaluate(async ({ spawnRadius, disableRetreat, attackerMultiplier, maxTicks }) => {
        const gateHex = window.campaign2NorthwatchGateHex;
        const center = window.campaign2NorthwatchCenter;
        const region = window.campaign2NorthwatchFortRegion;

        function getDefenders() {
            return window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive !== undefined);
        }
        const defenderBaseline = getDefenders().map(d => ({ ref: d, hex: { ...d.hex }, maxHp: d.maxHp }));
        const commander = defenderBaseline.map(d => d.ref).find(e => e.name === 'Commander Ysolde Hart');

        const defenders = defenderBaseline.map(d => {
            const e = d.ref;
            e.hp = d.maxHp; e.alive = true; e.unconscious = false;
            e.simKills = 0;
            e.timePoints = 100 + Math.random() * 0.9;
            e.hex = { ...d.hex };
            e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null;
            if (e.combatDirective) {
                e.combatDirective.mode = null;
                if (disableRetreat) e.combatDirective.contingencies = [];
            }
            e.fled = false; e.disengaged = false;
            e.knownOpponents = new Map();
            e._chaseStuckTurns = 0; e._parkedTurns = 0; e._parkedAtHex = null;
            e.climbing = null;
            return e;
        });
        defenders.forEach(e => { if (e.name === 'Commander Ysolde Hart') e.takeFallenArcherPostOnce = true; });

        const attackerCount = Math.round(defenders.length * attackerMultiplier);
        const attackerTypes = [];
        for (let i = 0; i < attackerCount; i++) attackerTypes.push(i % 2 === 0 ? 'orc' : 'goblin');
        const SIX_DIRECTIONS = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
        ];
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
            // Distance-to-wall at spawn: nearest wallHex, in hexes.
            ent._spawnDistToWall = Math.min(...region.wallHexes.map(h => window.distance(hex, h)));
            ent._loggedAdjacent = false;
            return ent;
        });

        window.entities = [...defenders, ...attackers];
        window.isInCombat = true;
        window.currentTurnEntity = null;
        window.isPausedForReaction = false;
        window.player = attackers[0];

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // Question 1: first 20 turns, attacker or defender.
        const actionLog = [];
        // Question 2: per-attacker, HP fraction the first tick it's adjacent
        // (distance <= 1) to any wall hex.
        const wallArrivalLog = [];

        let ticks = 0;
        while (ticks < maxTicks) {
            const beforeTurnEntity = window.currentTurnEntity;
            window.runTickInternal();
            ticks++;
            // window.currentTurnEntity gets nulled out by the time takeTurn
            // finishes synchronously for a non-scripted turn, so capture who
            // acted via a temporary wrap instead — simplest reliable signal
            // here is checking turnStartHex-stamped entities right after the
            // tick call, but easiest robust approach: hook takeTurn once.
            await sleep(12);
            attackers.forEach(a => {
                if (a.alive && !a._loggedAdjacent && a._spawnDistToWall !== undefined) {
                    const distToWall = Math.min(...region.wallHexes.map(h => window.distance(a.hex, h)));
                    if (distToWall <= 1) {
                        a._loggedAdjacent = true;
                        wallArrivalLog.push({
                            name: a.name,
                            spawnDistToWall: a._spawnDistToWall,
                            tickReachedWall: ticks,
                            hpFraction: +(a.hp / a.maxHp).toFixed(2),
                            hp: a.hp, maxHp: a.maxHp,
                        });
                    }
                }
            });
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

        return {
            winner, ticks,
            defendersAlive, defendersTotal: defenders.length,
            attackersAlive, attackersTotal: attackers.length,
            wallArrivalLog,
            spawnDistances: attackers.map(a => a._spawnDistToWall),
        };
    }, { spawnRadius, disableRetreat, attackerMultiplier, maxTicks });
}

async function main() {
    const serverProc = await ensureServer();
    const browser = await chromium.launch({ headless: true });

    // Q1 needs a per-turn actor log, which requires wrapping takeTurn BEFORE
    // combat starts. Do that as a separate, small page so it doesn't
    // interfere with the Q2/Q3 pages below.
    if (process.env.ONLY_Q2 !== '1') {
        const page = await bootPage(browser);
        await page.evaluate(() => {
            window.__actionLog = [];
            const origTakeTurn = window.takeTurn;
            window.takeTurn = function (entity) {
                if (window.isInCombat && window.__actionLog.length < 20) {
                    window.__actionLog.push({ name: entity.name, side: entity.side, isDefender: entity.factionTag === 'northwatch_human' });
                }
                return origTakeTurn(entity);
            };
        });
        const result = await runDiagnostic(page, { spawnRadius: 30, disableRetreat: false, attackerMultiplier: 1, maxTicks: 60 });
        const log = await page.evaluate(() => window.__actionLog);
        console.log('=== Q1: first 20 actions (attacker vs defender) ===');
        log.slice(0, 20).forEach((a, i) => console.log(`  ${i + 1}. ${a.isDefender ? 'DEFENDER' : 'ATTACKER'} — ${a.name}`));
        console.log();
        await page.close();
    }

    // Q2: spawn distance + HP-on-first-wall-adjacency, full run.
    {
        const page = await bootPage(browser);
        const result = await runDiagnostic(page, { spawnRadius: 30, disableRetreat: false, attackerMultiplier: 1, maxTicks: 8000 });
        console.log('=== Q2: attacker spawn distance to wall + HP on first wall-adjacency ===');
        const dists = result.spawnDistances;
        console.log(`  spawn distance to wall: min=${Math.min(...dists)} max=${Math.max(...dists)} mean=${(dists.reduce((a,b)=>a+b,0)/dists.length).toFixed(1)}`);
        console.log(`  ${result.wallArrivalLog.length}/${result.attackersTotal} attackers reached the wall before the fight ended (winner=${result.winner}, ticks=${result.ticks})`);
        result.wallArrivalLog.slice(0, 30).forEach(w => {
            console.log(`    ${w.name}: spawned ${w.spawnDistToWall} hexes out, reached wall@tick${w.tickReachedWall}, hp ${w.hp}/${w.maxHp} (${Math.round(w.hpFraction * 100)}%)`);
        });
        if (result.wallArrivalLog.length > 30) console.log(`    ... and ${result.wallArrivalLog.length - 30} more`);
        const avgHpFrac = result.wallArrivalLog.length
            ? result.wallArrivalLog.reduce((a, w) => a + w.hpFraction, 0) / result.wallArrivalLog.length
            : null;
        console.log(`  average HP fraction on first wall-adjacency: ${avgHpFrac !== null ? Math.round(avgHpFrac * 100) + '%' : 'n/a'}`);
        console.log();
        await page.close();
    }

    // Q3: retreat ON vs retreat OFF, a few trials each.
    if (process.env.ONLY_Q2 !== '1') {
        const page = await bootPage(browser);
        console.log('=== Q3: retreat contingency ON vs OFF ===');
        for (const disableRetreat of [false, true]) {
            const results = [];
            for (let t = 0; t < 3; t++) {
                const r = await runDiagnostic(page, { spawnRadius: 30, disableRetreat, attackerMultiplier: 1, maxTicks: 12000 });
                results.push(r);
                console.log(`  [retreat ${disableRetreat ? 'OFF' : 'ON '}] trial ${t + 1}: winner=${r.winner} ticks=${r.ticks} defendersAlive=${r.defendersAlive}/${r.defendersTotal} attackersAlive=${r.attackersAlive}/${r.attackersTotal}`);
            }
            const defWins = results.filter(r => r.winner === 'defenders').length;
            console.log(`  [retreat ${disableRetreat ? 'OFF' : 'ON '}] defender win rate: ${defWins}/${results.length}`);
        }
        await page.close();
    }

    await browser.close();
    if (serverProc) serverProc.kill();
    console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
