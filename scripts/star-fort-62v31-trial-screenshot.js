#!/usr/bin/env node
// Same 62-attacker vs the real 31-defender roster trial, but watches for
// the moment total HP goes flat (the stalemate found last run) and
// captures screenshots right around it, so we can actually see what the
// two sides are doing (or not doing) when the fight stops.
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
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

async function takeScreenshot(page, label, outDir) {
    await page.evaluate(() => {
        window.cameraZoom = 0.5;
        window.cameraFollowEnabled = false;
        window.centerCameraOn(window.campaign2NorthwatchCenter);
    });
    await page.waitForTimeout(200);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const shotPath = path.join(outDir, `${label}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`  Screenshot saved: ${shotPath}`);
}

async function main() {
    const serverProc = await ensureServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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

    const outDir = path.join(__dirname, '..', 'scratchpad-screens');

    console.log('Setting up 62 attackers vs the real 31-defender roster (no player)...');
    const setup = await page.evaluate(() => {
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

        const attackerCount = 62;
        const attackerTypes = [];
        for (let i = 0; i < attackerCount; i++) attackerTypes.push(i % 2 === 0 ? 'orc' : 'goblin');
        // Perfectly even ring deployment: one attacker every (360/62) degrees
        // around the fort at a fixed radius, instead of 6 clumped groups.
        const spawnRadius = 30;
        const attackers = attackerTypes.map((type, i) => {
            const angle = (i / attackerCount) * Math.PI * 2;
            const hex = window.hexRound(
                center.q + Math.cos(angle) * spawnRadius,
                center.r + Math.sin(angle) * spawnRadius
            );
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
        window.__simDefenders = defenders;
        window.__simAttackers = attackers;

        // Force-explore the fort area + always-visible entities, same fix
        // used for the retreat-trigger screenshots — otherwise fog of war
        // (no real 'player'-side entity exists in this sim) blanks the shot.
        const region = window.campaign2NorthwatchFortRegion;
        const keepRegion = window.campaign2NorthwatchKeepRegion;
        if (!window.exploredHexes) window.exploredHexes = new Set();
        [...region.floorHexes, ...region.wallHexes, ...keepRegion.floorHexes, ...keepRegion.wallHexes]
            .forEach(h => window.exploredHexes.add(`${h.q},${h.r}`));
        for (let dq = -40; dq <= 40; dq += 2) {
            for (let dr = -40; dr <= 40; dr += 2) {
                if (Math.abs(dq) + Math.abs(dr) <= 44) window.exploredHexes.add(`${center.q + dq},${center.r + dr}`);
            }
        }
        window.isVisibleToPlayer = () => true;

        return {
            defenderCount: defenders.length,
            attackerCount: attackers.length,
            defenderStartHp: defenders.reduce((a, e) => a + e.hp, 0),
            attackerStartHp: attackers.reduce((a, e) => a + e.hp, 0),
        };
    });
    console.log(`  Defenders: ${setup.defenderCount}. Attackers: ${setup.attackerCount}.`);
    console.log(`  Starting HP: defenders=${setup.defenderStartHp}, attackers=${setup.attackerStartHp}.\n`);

    const MAX_TICKS = 60000;
    const STABLE_TICKS_TO_STOP = 3000;
    let ticks = 0;
    let lastTotalHp = null;
    let flatSince = 0;
    let winner = null;
    let flatlineOnsetTick = null;
    const shotsToken = { before: false, onset: false, after: false };

    console.log('Running (checking every 500 ticks)...');
    while (ticks < MAX_TICKS) {
        await page.evaluate(() => window.runTickInternal());
        await page.waitForTimeout(8);
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
                if (!shotsToken.onset) {
                    flatlineOnsetTick = ticks;
                    console.log(`  >>> HP just went flat at tick ${ticks} — capturing screenshot`);
                    await takeScreenshot(page, `flatline-onset-tick${ticks}`, outDir);
                    shotsToken.onset = true;
                }
                flatSince += 500;
                if (flatSince === 1500 && !shotsToken.after) {
                    console.log(`  >>> Still flat 1000 ticks later (tick ${ticks}) — capturing confirmation screenshot`);
                    await takeScreenshot(page, `flatline-confirmed-tick${ticks}`, outDir);
                    shotsToken.after = true;
                }
                if (flatSince >= STABLE_TICKS_TO_STOP) { winner = 'stalemate (HP stable, stopping)'; break; }
            } else {
                if (!shotsToken.before) {
                    // Take one "still actively fighting" reference shot the
                    // first time we see real change, so there's a clear
                    // before/after contrast.
                    console.log(`  (still active at tick ${ticks} — capturing reference screenshot)`);
                    await takeScreenshot(page, `still-active-tick${ticks}`, outDir);
                    shotsToken.before = true;
                }
                flatSince = 0;
                shotsToken.onset = false; // HP moved again — any future flatline needs a fresh onset shot
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
            defAliveCount: defAlive.length,
            atkAliveCount: atkAlive.length,
            defDead: defenders.filter(e => !e.alive).length,
            defFled: defenders.filter(e => e.fled).length,
            atkDead: attackers.filter(e => !e.alive).length,
            atkFled: attackers.filter(e => e.fled).length,
            commanderAlive: defenders.find(e => e.name === 'Commander Ysolde Hart')?.alive,
        };
    });

    console.log(`\n=== RESULT: ${winner} at tick ${ticks} (flatline onset: ${flatlineOnsetTick ?? 'n/a'}) ===`);
    console.log(`Defenders: ${final.defAliveCount}/31 alive, ${final.defDead} dead, ${final.defFled} fled. Commander alive: ${final.commanderAlive}`);
    console.log(`Attackers: ${final.atkAliveCount}/62 alive, ${final.atkDead} dead, ${final.atkFled} fled.`);

    await browser.close();
    if (serverProc) serverProc.kill();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
