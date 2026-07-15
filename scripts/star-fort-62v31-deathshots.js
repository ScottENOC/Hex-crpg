#!/usr/bin/env node
// Same 62-ring-attackers vs the real 31-defender roster trial, but instead
// of watching for a flatline, takes a zoomed-out screenshot every time the
// defender death count crosses a new multiple of 3 (3, 6, 9, ...), so we
// can see the fort's shape and both sides' positions as the wall falls.
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
        window.cameraZoom = 0.28; // zoomed well out — whole fort + attacker ring in frame
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
    await page.waitForFunction(() => window.campaign2NorthwatchFortRegion && window.campaign2NorthwatchGateHex);

    const outDir = path.join(__dirname, '..', 'scratchpad-screens');

    console.log('Setting up 62 ring-deployed attackers vs the real 31-defender roster (no player)...');
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
    let ticks = 0;
    let winner = null;
    let lastDefDeadCount = 0;
    let nextDeathShotThreshold = 3;
    const CHECK_EVERY = 50;

    console.log('Running (checking every 50 ticks for defender deaths, every 500 for status)...');
    while (ticks < MAX_TICKS) {
        await page.evaluate(() => window.runTickInternal());
        await page.waitForTimeout(8);
        ticks++;

        if (ticks % CHECK_EVERY === 0) {
            const snap = await page.evaluate(() => {
                const defenders = window.__simDefenders;
                const attackers = window.__simAttackers;
                const defAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged);
                const atkAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged);
                return {
                    defAliveCount: defAlive.length, atkAliveCount: atkAlive.length,
                    defDead: defenders.filter(e => !e.alive).length,
                    atkDead: attackers.filter(e => !e.alive).length,
                };
            });

            if (snap.defDead > lastDefDeadCount) {
                lastDefDeadCount = snap.defDead;
                while (lastDefDeadCount >= nextDeathShotThreshold) {
                    console.log(`  >>> Defender death #${nextDeathShotThreshold} reached at tick ${ticks} — capturing screenshot`);
                    await takeScreenshot(page, `defender-deaths-${nextDeathShotThreshold}-tick${ticks}`, outDir);
                    nextDeathShotThreshold += 3;
                }
            }

            if (snap.defAliveCount === 0 && snap.atkAliveCount > 0) { winner = 'attackers'; break; }
            if (snap.atkAliveCount === 0 && snap.defAliveCount > 0) { winner = 'defenders'; break; }
            if (snap.defAliveCount === 0 && snap.atkAliveCount === 0) { winner = 'mutual wipe'; break; }

            if (ticks % 500 === 0) {
                console.log(`  tick ${ticks}: defenders ${snap.defAliveCount}/31 alive (${snap.defDead} dead) | attackers ${snap.atkAliveCount}/62 alive (${snap.atkDead} dead)`);
            }
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

    console.log(`\n=== RESULT: ${winner} at tick ${ticks} ===`);
    console.log(`Defenders: ${final.defAliveCount}/31 alive, ${final.defDead} dead, ${final.defFled} fled. Commander alive: ${final.commanderAlive}`);
    console.log(`Attackers: ${final.atkAliveCount}/62 alive, ${final.atkDead} dead, ${final.atkFled} fled.`);

    await browser.close();
    if (serverProc) serverProc.kill();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
