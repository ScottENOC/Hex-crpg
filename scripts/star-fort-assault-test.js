#!/usr/bin/env node
// Standalone test: a fake assault on Northwatch Fort (the game's actual
// star-fort, built for real during Campaign 2 world-gen — buildNorthwatchFort,
// campaign2World.js). Attackers start at 2x the defending garrison's size,
// a mix of basic human soldiers weighted toward bows. Reuses the real
// defenders (Fort Soldier Halric/Wenna/Dunstan/Ysolt/Bram/Cadha + Commander
// Ysolde Hart, campaign2Content.js) with their real combatDirective (hold
// the walls, prioritize the gate, retreat to the keep if overrun — see the
// "Layered combat AI" plan) already wired up by buildNorthwatchFort.
//
// Usage: node scripts/star-fort-assault-test.js
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
    // Campaign 2 (not 1) — Northwatch Fort only exists in this world.
    await page.waitForSelector('#race-select', { state: 'visible' });
    await page.selectOption('#race-select', 'human');
    await page.selectOption('#gender-select', 'male');
    await page.selectOption('#class-select', 'fighter');
    await page.selectOption('#campaign-select', '2');
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.campaign2NorthwatchFortRegion && window.campaign2NorthwatchGateHex);

    await page.evaluate(() => {
        const BOW_SOLDIER = { race: 'human', classLevels: ['fighter'], skillPicks: ['health', 'bow_hit', 'bow_dmg', 'light_armor_training'], equipment: ['bow', 'light_armor'] };
        const SWORD_SOLDIER = { race: 'human', classLevels: ['fighter'], skillPicks: ['health', 'sword_hit', 'sword_dmg', 'light_armor_training'], equipment: ['sword', 'light_armor'] };
        const SPEAR_SOLDIER = { race: 'human', classLevels: ['fighter'], skillPicks: ['health', 'spear_hit', 'spear_dmg', 'light_armor_training'], equipment: ['spear', 'light_armor'] };

        // The real garrison (buildNorthwatchFort already placed these into
        // window.entities during world-gen, with their real hexes/combatDirective).
        function getDefenders() {
            return window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive !== undefined);
        }
        const defenderBaseline = getDefenders().map(d => ({ ref: d, hex: { ...d.hex }, maxHp: d.maxHp }));

        // Attacker composition: 2x the garrison's headcount (defenders +
        // commander), weighted toward bows per the ask ("lots of bows").
        function buildAttackerRoster(count) {
            const roster = [];
            const bowCount = Math.round(count * 0.6);
            for (let i = 0; i < count; i++) {
                const archetype = i < bowCount ? BOW_SOLDIER : (i % 2 === 0 ? SWORD_SOLDIER : SPEAR_SOLDIER);
                roster.push({ ...archetype, name: `Attacker ${i + 1}` });
            }
            return roster;
        }

        window.aiSiegeSim = {
            async runAssault(attackerCount, maxTicks, numDirections = 6) {
                const gateHex = window.campaign2NorthwatchGateHex;
                const center = window.campaign2NorthwatchCenter;

                // Reset defenders to full HP/original position/alive, and
                // rebuild them into window.entities alongside a fresh
                // attacker roster — isolates the fight from the couple
                // hundred unrelated world NPCs Campaign 2 also spawns.
                const defenders = defenderBaseline.map(d => {
                    const e = d.ref;
                    e.hp = d.maxHp; e.alive = true; e.unconscious = false;
                    // A tiny distinct offset per entity, not a flat 100 —
                    // runTickInternal's turn-order sort breaks exact TP ties
                    // with `Math.random() - 0.5` inside Array.sort, which is
                    // a known JS anti-pattern (inconsistent comparators don't
                    // shuffle fairly): with a dozen-plus entities tied at
                    // exactly 100, it can end up never selecting one side at
                    // all rather than picking randomly among them, as
                    // discovered while building this test (one side just
                    // stood still turn after turn). Real gameplay rarely
                    // produces exact TP ties, which is presumably why nobody
                    // had hit this before. Distinct values sidestep it here;
                    // the underlying sort is a real engine bug worth fixing.
                    e.timePoints = 100 + Math.random() * 0.9;
                    e.hex = { ...d.hex };
                    e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null;
                    return e;
                });

                const attackerRoster = buildAttackerRoster(attackerCount);
                // Six axial directions out from the keep, matching the star
                // fort's own 6 points (STAR_FORT_DIRECTIONS, campaign2World.js)
                // — splits the attacking force into one group per point
                // instead of everyone funneling through the single gate, so
                // the garrison can't just mass at one breach.
                const SIX_DIRECTIONS = [
                    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
                ];
                const spawnRadius = 9;
                const activeDirections = SIX_DIRECTIONS.slice(0, numDirections);
                const groupSize = Math.ceil(attackerCount / activeDirections.length);
                const attackers = attackerRoster.map((spec, i) => {
                    const dir = activeDirections[Math.floor(i / groupSize) % activeDirections.length];
                    const withinGroup = i % groupSize;
                    const hex = {
                        q: center.q + dir.q * spawnRadius + (withinGroup % 4) - 1,
                        r: center.r + dir.r * spawnRadius + Math.floor(withinGroup / 4),
                    };
                    const ent = window.buildNPC({ ...spec, hex, side: 'enemy', factionId: null, color: '#8a2a2a' });
                    ent.combatDirective = { hostileTo: 'neutral' }; // fight the fort's neutral-side garrison
                    ent.aiControlled = true;
                    ent.hasBeenSeenByPlayer = true;
                    ent.timePoints = 100 + Math.random() * 0.9; // see defenders' reset above
                    ent.aiState = 'combat';
                    ent.parriesRemaining = 3;
                    return ent;
                });

                window.entities = [...defenders, ...attackers];
                window.isInCombat = true;
                window.currentTurnEntity = null;
                window.isPausedForReaction = false;
                window.player = attackers[0];

                const defenderStartHp = defenders.reduce((a, e) => a + e.hp, 0);
                const attackerStartHp = attackers.reduce((a, e) => a + e.hp, 0);
                const sleep = (ms) => new Promise(r => setTimeout(r, ms));

                // FORMATION SNAPSHOT: describes clustering ("balling up" vs
                // spread out) at a moment in time — centroid, mean distance
                // from centroid, and unique-hex-count vs headcount (a low
                // ratio means multiple entities are stacked on the same hex).
                function snapshotFormation(list) {
                    const alive = list.filter(e => e.alive);
                    if (alive.length === 0) return null;
                    const cq = alive.reduce((a, e) => a + e.hex.q, 0) / alive.length;
                    const cr = alive.reduce((a, e) => a + e.hex.r, 0) / alive.length;
                    const dists = alive.map(e => window.distance(e.hex, { q: Math.round(cq), r: Math.round(cr) }));
                    const meanDist = dists.reduce((a, b) => a + b, 0) / dists.length;
                    const maxDist = Math.max(...dists);
                    const uniqueHexes = new Set(alive.map(e => `${e.hex.q},${e.hex.r}`)).size;
                    return { count: alive.length, meanDist: +meanDist.toFixed(1), maxDist, uniqueHexes };
                }

                const snapshotTicks = new Set([25, 100, 300, 800]);
                const formationLog = [];

                let ticks = 0;
                while (ticks < maxTicks) {
                    window.runTickInternal();
                    ticks++;
                    await sleep(12);
                    const defAlive = defenders.filter(e => e.alive).length;
                    const atkAlive = attackers.filter(e => e.alive).length;
                    if (snapshotTicks.has(ticks)) {
                        formationLog.push({ tick: ticks, defenders: snapshotFormation(defenders), attackers: snapshotFormation(attackers) });
                    }
                    if (defAlive === 0 || atkAlive === 0) break;
                }
                window.isInCombat = false;

                const defendersAlive = defenders.filter(e => e.alive).length;
                const attackersAlive = attackers.filter(e => e.alive).length;
                const defenderEndHp = defenders.reduce((a, e) => a + Math.max(0, e.hp), 0);
                const attackerEndHp = attackers.reduce((a, e) => a + Math.max(0, e.hp), 0);
                let winner;
                if (defendersAlive > 0 && attackersAlive === 0) winner = 'defenders';
                else if (attackersAlive > 0 && defendersAlive === 0) winner = 'attackers';
                else winner = 'timeout';
                return {
                    winner, ticks,
                    defendersAlive, defendersTotal: defenders.length,
                    attackersAlive, attackersTotal: attackers.length,
                    defenderHpFractionRemaining: defenderStartHp ? defenderEndHp / defenderStartHp : 0,
                    attackerHpFractionRemaining: attackerStartHp ? attackerEndHp / attackerStartHp : 0,
                    formationLog,
                };
            },
        };
    });
    return page;
}

async function main() {
    const serverProc = await ensureServer();
    let browser = await chromium.launch({ headless: true });
    let page = await bootPage(browser);

    async function evalWithRecovery(fn, arg) {
        try { return await page.evaluate(fn, arg); }
        catch (e) {
            if (!/closed|crash|disconnected|Target page/i.test(e.message)) throw e;
            console.log(`  [page died: ${e.message} — rebooting]`);
            try { page = await bootPage(browser); }
            catch (e2) {
                try { await browser.close(); } catch (e3) {}
                browser = await chromium.launch({ headless: true });
                page = await bootPage(browser);
            }
            return await page.evaluate(fn, arg);
        }
    }

    // Garrison is 6 soldiers + 1 commander = 7 (real garrison headcount is
    // fixed by content, not scaled). Attackers = garrison * multiplier,
    // split across all 6 of the star fort's points instead of funneling
    // through the gate — usage: node star-fort-assault-test.js [trials] [attackerMultiplier]
    const attackerMultiplier = Number(process.argv[3] || 3.5);
    const attackerCount = await page.evaluate((mult) =>
        window.entities.filter(e => e.factionTag === 'northwatch_human').length * mult, attackerMultiplier);
    console.log(`Garrison size: ${Math.round(attackerCount / attackerMultiplier)}. Attacking force: ${attackerCount} (${attackerMultiplier}x, ~60% bows, rest sword/spear, spawned around all 6 points).\n`);

    const trials = Number(process.argv[2] || 3);
    const outcomes = [];
    for (let t = 0; t < trials; t++) {
        const numDirections = Number(process.argv[4] || 6);
        const r = await evalWithRecovery(({ attackerCount, maxTicks, numDirections }) => window.aiSiegeSim.runAssault(attackerCount, maxTicks, numDirections), { attackerCount, maxTicks: 3000, numDirections });
        outcomes.push(r);
        console.log(`trial ${t + 1}: winner=${r.winner.padEnd(10)} defenders ${r.defendersAlive}/${r.defendersTotal} (${(r.defenderHpFractionRemaining * 100).toFixed(0)}% hp)  attackers ${r.attackersAlive}/${r.attackersTotal} (${(r.attackerHpFractionRemaining * 100).toFixed(0)}% hp)  ticks=${r.ticks}`);
        r.formationLog.forEach(f => {
            const d = f.defenders, a = f.attackers;
            console.log(`    tick ${f.tick}: defenders n=${d?.count ?? 0} meanDist=${d?.meanDist ?? '-'} uniqueHexes=${d?.uniqueHexes ?? '-'}  |  attackers n=${a?.count ?? 0} meanDist=${a?.meanDist ?? '-'} uniqueHexes=${a?.uniqueHexes ?? '-'}`);
        });
    }

    const attackerWinRate = outcomes.filter(o => o.winner === 'attackers').length / outcomes.length;
    const defenderWinRate = outcomes.filter(o => o.winner === 'defenders').length / outcomes.length;
    const timeoutRate = outcomes.filter(o => o.winner === 'timeout').length / outcomes.length;
    console.log(`\nAttacker win rate: ${(attackerWinRate * 100).toFixed(0)}%`);
    console.log(`Defender win rate: ${(defenderWinRate * 100).toFixed(0)}%`);
    if (timeoutRate > 0) console.log(`Timeout (no resolution within tick cap): ${(timeoutRate * 100).toFixed(0)}%`);

    console.log('\nDone.');
    await browser.close();
    if (serverProc) { try { process.kill(-serverProc.pid); } catch (e) {} }
}

main().catch(e => { console.error(e); process.exit(1); });
