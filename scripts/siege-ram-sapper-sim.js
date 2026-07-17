#!/usr/bin/env node
// Verifies the new scripted-siege content end to end, through the real game
// functions (not a hand-rolled spawner): cheatTestNorthwatchSiege('stay')
// -> catapult fires alone -> first wave + battering ram + sapper spawn ->
// ram/sapper only progress once defendersDistracted() -> gate/rear-wall
// breach -> second wave. Reports the whole timeline.
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
        spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: true });
        await waitForServer(BASE_URL, 15000);
        return null;
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

async function main() {
    await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(BASE_URL);
    await page.waitForSelector('#race-select', { state: 'visible' });
    await page.selectOption('#race-select', 'human');
    await page.selectOption('#gender-select', 'male');
    await page.selectOption('#class-select', 'fighter');
    await page.selectOption('#campaign-select', '2');
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.entities && window.entities.length > 0);

    const started = await page.evaluate(() => {
        window.cheatTestNorthwatchSiege('stay');
        // aiControlled: the real player character otherwise waits for real
        // UI input on its own turn (isSentientAlly branch, takeTurn) — with
        // no one to click anything in a headless run, currentTurnEntity
        // gets stuck on it forever, and runTickInternal's own top-of-
        // function guard (currentTurnEntity && !isSleepCycle -> return)
        // then halts EVERY entity's processing, not just the player's.
        // Marking the party aiControlled routes them through aiProcess
        // like any other NPC instead.
        window.entities.forEach(e => { if (e.side === 'player') e.aiControlled = true; });
        return { catapultExists: !!window.campaign2NorthwatchCatapult };
    });
    console.log('Started stay-in-fort siege:', JSON.stringify(started));

    const outDir = path.join(__dirname, '..', 'scratchpad-screens');
    let ticks = 0;
    const maxTicks = 20000;
    const checkEvery = 250;
    let lastReport = '';
    let sawWave1 = false, sawRamSapper = false, sawGateBreach = false, sawRearBreach = false, sawWave2 = false;

    while (ticks < maxTicks) {
        await page.evaluate(() => window.runTickInternal());
        await page.waitForTimeout(4);
        ticks++;

        // Safety top-up every 20 ticks: keep all combat-relevant entities
        // (defenders + any greenskin_assault-tagged entity) alive to their
        // turn, same fled/parked-turn/TP-floor patches as the earlier sim,
        // scanned fresh each time since the roster grows as waves spawn.
        if (ticks % 20 === 0) {
            await page.evaluate(() => {
                window.entities.forEach(e => {
                    if (!e || !e.alive) return;
                    const relevant = e.factionTag === 'northwatch_human' || e.factionTag === 'greenskin_assault';
                    if (!relevant) return;
                    if (e.timePoints < 150) e.timePoints = Math.min(150, e.timePoints + 50);
                    if (e.disengaged || e.fled) {
                        e.disengaged = false; e.fled = false;
                        if (e.combatDirective) e.combatDirective.mode = null;
                    }
                    e._chaseStuckTurns = 0; e._parkedTurns = 0; e._parkedAtHex = null;
                });
            });
        }

        if (ticks % checkEvery === 0) {
            const snap = await page.evaluate(() => {
                const catapult = window.campaign2NorthwatchCatapult;
                const ram = window.campaign2NorthwatchRam;
                const sapper = window.campaign2NorthwatchSapper;
                const gateHex = window.campaign2NorthwatchGateHex;
                const defenders = window.entities.filter(e => e.factionTag === 'northwatch_human');
                const wave1 = window.entities.filter(e => e.factionTag === 'greenskin_assault' && e.side === 'enemy' && !e.isBatteringRam && !e.isSiegeSapper && !e.name?.includes('II-'));
                const wave2 = window.entities.filter(e => e.name?.includes('II-'));
                return {
                    catapultAlive: catapult ? catapult.alive : null,
                    catapultFiresRemaining: catapult ? catapult.firesRemaining : null,
                    wave1Spawned: window.greenskinAssaultTriggered === true,
                    wave1Alive: wave1.filter(e => e.alive).length,
                    wave1Total: wave1.length,
                    ramAlive: ram ? ram.alive : null,
                    ramRounds: ram ? ram.roundsRemaining : null,
                    sapperAlive: sapper ? sapper.alive : null,
                    sapperRounds: sapper ? sapper.roundsRemaining : null,
                    gateBreached: gateHex ? window.getTerrainAt(gateHex.q, gateHex.r).name === 'Rubble' : null,
                    wave2Spawned: window.greenskinSecondWaveSpawned === true,
                    wave2Alive: wave2.filter(e => e.alive).length,
                    wave2Total: wave2.length,
                    defendersAlive: defenders.filter(e => e.alive).length,
                    defendersTotal: defenders.length,
                    distracted: window.defendersDistracted ? window.defendersDistracted() : null,
                };
            });
            const report = `tick ${ticks}: catapult alive=${snap.catapultAlive} shots=${snap.catapultFiresRemaining} | wave1 ${snap.wave1Alive}/${snap.wave1Total} spawned=${snap.wave1Spawned} | ram alive=${snap.ramAlive} rounds=${snap.ramRounds} | sapper alive=${snap.sapperAlive} rounds=${snap.sapperRounds} | gateBreached=${snap.gateBreached} | distracted=${snap.distracted} | wave2 ${snap.wave2Alive}/${snap.wave2Total} spawned=${snap.wave2Spawned} | defenders ${snap.defendersAlive}/${snap.defendersTotal}`;
            if (report !== lastReport) { console.log('  ' + report); lastReport = report; }

            if (!sawWave1 && snap.wave1Spawned) { sawWave1 = true; await takeScreenshot(page, 'ram-sapper-wave1', outDir); }
            if (!sawRamSapper && (snap.ramAlive !== null || snap.sapperAlive !== null)) { sawRamSapper = true; }
            if (!sawGateBreach && snap.gateBreached) { sawGateBreach = true; console.log('  >>> GATE BREACHED'); }
            if (!sawWave2 && snap.wave2Spawned) { sawWave2 = true; await takeScreenshot(page, 'ram-sapper-wave2', outDir); }
            if (snap.defendersAlive === 0 || (snap.wave1Total > 0 && snap.wave1Alive === 0 && snap.wave2Spawned && snap.wave2Alive === 0)) {
                console.log('Combat resolved, stopping.');
                break;
            }
        }
    }

    const final = await page.evaluate(() => {
        const defenders = window.entities.filter(e => e.factionTag === 'northwatch_human');
        return {
            defendersAlive: defenders.filter(e => e.alive).length,
            defendersTotal: defenders.length,
            gateBreached: window.getTerrainAt(window.campaign2NorthwatchGateHex.q, window.campaign2NorthwatchGateHex.r).name === 'Rubble',
        };
    });
    console.log('FINAL:', JSON.stringify(final));
    await takeScreenshot(page, 'ram-sapper-final', outDir);
    await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
