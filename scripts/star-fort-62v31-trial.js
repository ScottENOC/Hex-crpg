#!/usr/bin/env node
// A single trial: the real, fixed 31-defender Northwatch roster (built by
// buildNorthwatchFort — no test-side equipment overrides, no randomization)
// against 62 attackers, no player. Doesn't stop at the first apparent
// resolution if HP is still actively changing — only ends when either side
// is wiped, or total HP across both sides has been completely flat for a
// long stretch (a genuine stalemate/standoff), so a fight that's still
// actually being fought never gets cut off early.
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

async function main() {
    const serverProc = await ensureServer();
    const browser = await chromium.launch({ headless: true });
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

    console.log('Setting up 62 attackers vs the real 31-defender roster (no player)...');
    const setup = await page.evaluate(() => {
        const center = window.campaign2NorthwatchCenter;
        // The REAL garrison, exactly as buildNorthwatchFort left it — no
        // equipment overrides, no re-rolling. Just reset to full HP/alive.
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

        const attackerCount = 62;
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
                q: center.q + dir.q * spawnRadius + (withinGroup % 5) - 2,
                r: center.r + dir.r * spawnRadius + Math.floor(withinGroup / 5),
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
        // "No player" means no human controlling anything — window.player
        // just needs to point at a harmless anchor entity so any code that
        // reads it (rendering, isVisibleToPlayer) doesn't crash on null;
        // it's never actually driven or given special treatment here.
        window.player = attackers[0];
        window.__simDefenders = defenders;
        window.__simAttackers = attackers;

        return {
            defenderCount: defenders.length,
            attackerCount: attackers.length,
            defenderStartHp: defenders.reduce((a, e) => a + e.hp, 0),
            attackerStartHp: attackers.reduce((a, e) => a + e.hp, 0),
        };
    });
    console.log(`  Defenders: ${setup.defenderCount} (expect 31). Attackers: ${setup.attackerCount}.`);
    console.log(`  Starting HP: defenders=${setup.defenderStartHp}, attackers=${setup.attackerStartHp}.\n`);

    const MAX_TICKS = 60000;
    const STABLE_TICKS_TO_STOP = 3000; // total HP unchanged this many ticks in a row = real standoff
    let ticks = 0;
    let lastTotalHp = null;
    let flatSince = 0;
    let winner = null;

    console.log('Running (checking every 500 ticks)...');
    while (ticks < MAX_TICKS) {
        await page.evaluate(() => window.runTickInternal());
        ticks++;
        if (ticks % 500 === 0) {
            const snap = await page.evaluate(() => {
                const defenders = window.__simDefenders;
                const attackers = window.__simAttackers;
                const defAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged);
                const atkAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged);
                const defHp = defAlive.reduce((a, e) => a + Math.max(0, e.hp), 0);
                const atkHp = atkAlive.reduce((a, e) => a + Math.max(0, e.hp), 0);
                return {
                    defAliveCount: defAlive.length, atkAliveCount: atkAlive.length,
                    defHp, atkHp, totalHp: defHp + atkHp,
                    defFled: defenders.filter(e => e.fled).length, atkFled: attackers.filter(e => e.fled).length,
                };
            });
            console.log(`  tick ${ticks}: defenders ${snap.defAliveCount}/31 alive (hp ${snap.defHp}, ${snap.defFled} fled) | attackers ${snap.atkAliveCount}/62 alive (hp ${snap.atkHp}, ${snap.atkFled} fled)`);

            if (snap.defAliveCount === 0 && snap.atkAliveCount > 0) { winner = 'attackers'; break; }
            if (snap.atkAliveCount === 0 && snap.defAliveCount > 0) { winner = 'defenders'; break; }
            if (snap.defAliveCount === 0 && snap.atkAliveCount === 0) { winner = 'mutual wipe'; break; }

            if (lastTotalHp !== null && snap.totalHp === lastTotalHp) {
                flatSince += 500;
                if (flatSince >= STABLE_TICKS_TO_STOP) { winner = 'stalemate (HP stable, stopping)'; break; }
            } else {
                flatSince = 0;
            }
            lastTotalHp = snap.totalHp;
        }
    }
    if (!winner) winner = `tick cap (${MAX_TICKS}) reached, still active`;

    const final = await page.evaluate(() => {
        const defenders = window.__simDefenders;
        const attackers = window.__simAttackers;
        const defAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged);
        const atkAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged);
        return {
            defAliveCount: defAlive.length, defAliveNames: defAlive.map(e => e.name),
            atkAliveCount: atkAlive.length,
            defDead: defenders.filter(e => !e.alive).length,
            defFled: defenders.filter(e => e.fled).length,
            atkDead: attackers.filter(e => !e.alive).length,
            atkFled: attackers.filter(e => e.fled).length,
            commanderAlive: defenders.find(e => e.name === 'Commander Ysolde Hart')?.alive,
        };
    });

    console.log(`\n=== RESULT: ${winner} at tick ${ticks} ===`);
    console.log(`Defenders: ${final.defAliveCount}/31 alive, ${final.defDead} dead, ${final.defFled} fled. Commander alive: ${final.commanderAlive}`);
    console.log(`Attackers: ${final.atkAliveCount}/62 alive, ${final.atkDead} dead, ${final.atkFled} fled.`);
    if (final.defAliveCount > 0 && final.defAliveCount <= 15) console.log(`Surviving defenders: ${final.defAliveNames.join(', ')}`);

    await browser.close();
    if (serverProc) serverProc.kill();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
