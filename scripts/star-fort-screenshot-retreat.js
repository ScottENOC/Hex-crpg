#!/usr/bin/env node
// Runs the same Northwatch assault sim, watches for the moment the retreat
// contingency first fires for any defender, then centers the camera on the
// fort and captures a screenshot of that instant — visual counterpart to
// the retreat diagnostics (star-fort-diagnose-q5.js).
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
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
    return page;
}

async function main() {
    await waitForServer(BASE_URL, 5000);
    const browser = await chromium.launch({ headless: true });
    const page = await bootPage(browser);

    const outDir = path.join(__dirname, '..', 'scratchpad-screens');
    await page.evaluate(async () => {
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
            return e;
        });
        defenders.forEach(e => { if (e.name === 'Commander Ysolde Hart') e.takeFallenArcherPostOnce = true; });

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
        // Rendering only draws hexes that are currently visible or already
        // in window.exploredHexes (fog of war) — the real player's vision
        // never reached this sim's fake fight, so nothing would render at
        // all without this. Force-explore a wide area around the fort so
        // screenshots actually show the battle instead of a black canvas.
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
        window.player = attackers[0];
        window.__simDefenders = defenders;
        window.__simAttackers = attackers;

        // Entity/tileObject rendering (renderEntities, gameEngine.js) is
        // separately gated on isVisibleToPlayer, which computes vision from
        // window.entities filtered to side==='player' — none exist in this
        // sim (defenders are 'neutral', attackers 'enemy'), so it always
        // returned false and nothing but bare terrain would ever draw.
        // Screenshot-only override: show everything, fog of war isn't the
        // point of these captures.
        window.isVisibleToPlayer = () => true;
    });

    console.log('Running sim, watching for first retreat trigger...');
    const maxTicks = 8000;
    let retreatTick = null;
    for (let ticks = 0; ticks < maxTicks; ticks++) {
        await page.evaluate(() => window.runTickInternal());
        await page.waitForTimeout(10);
        const status = await page.evaluate(() => {
            const defenders = window.__simDefenders;
            const attackers = window.__simAttackers;
            const anyRetreat = defenders.some(e => e.combatDirective?.mode === 'retreat');
            const defAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
            const atkAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
            return { anyRetreat, defAlive, atkAlive };
        });
        if (status.anyRetreat) { retreatTick = ticks; break; }
        if (status.defAlive === 0 || status.atkAlive === 0) break;
    }

    if (retreatTick === null) {
        console.log('Retreat never triggered within the tick cap — no screenshot to take.');
    } else {
        console.log(`Retreat first triggered at tick ${retreatTick}. Centering camera and capturing screenshot...`);
        await page.evaluate(() => {
            window.cameraZoom = 0.9;
            window.cameraFollowEnabled = false;
            window.centerCameraOn(window.campaign2NorthwatchCenter);
        });
        await page.waitForTimeout(200);
        const fs = require('fs');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const shotPath = path.join(outDir, 'retreat-triggered.png');
        await page.screenshot({ path: shotPath });
        console.log(`Screenshot saved: ${shotPath}`);

        // A second shot a bit later (200 more ticks), same camera, to see the
        // retreat actually playing out rather than just the instant it fired.
        for (let i = 0; i < 200; i++) {
            await page.evaluate(() => window.runTickInternal());
            await page.waitForTimeout(10);
        }
        await page.evaluate(() => window.centerCameraOn(window.campaign2NorthwatchCenter));
        await page.waitForTimeout(200);
        const shotPath2 = path.join(outDir, 'retreat-in-progress.png');
        await page.screenshot({ path: shotPath2 });
        console.log(`Screenshot saved: ${shotPath2}`);
    }

    await browser.close();
    console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
