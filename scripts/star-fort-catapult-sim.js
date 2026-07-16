#!/usr/bin/env node
// Full siege sim: the real 31-defender garrison, the greenskin catapult
// + its 3 goblin crew + 2 orc guards, the 5 elite knights, and a 62-unit
// ring of greenskin attackers holding position until the catapult does
// its work. Captures screenshots at the key story beats (catapult opens
// fire, catapult destroyed, assault triggered) plus a final state, and
// reports a full breakdown at the end.
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
        window.cameraZoom = 0.18;
        window.cameraFollowEnabled = false;
        window.centerCameraOn({ q: window.campaign2NorthwatchCenter.q + 30, r: window.campaign2NorthwatchCenter.r });
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
    await page.waitForFunction(() => window.campaign2NorthwatchFortRegion && window.campaign2NorthwatchGateHex, { timeout: 30000 });

    const outDir = path.join(__dirname, '..', 'scratchpad-screens');

    console.log('Setting up full siege: 31 defenders, catapult+crew+guards, 5 knights, 62 ring attackers...');
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
        // The real player character + Wren (spawned by character creation,
        // sitting in Hollowmere village 260+ hexes from Northwatch) would
        // otherwise trip checkPlayerCombatDisengage's "party got far from
        // every hostile and stayed that way" rule after 150 ticks, mass-
        // marking every attacker `disengaged` even though this fight has
        // nothing to do with the player. borderWarSallyActive is the
        // existing, real exclusion for exactly this — a scripted siege
        // encounter, not a wandering random fight the player walked away
        // from.
        window.borderWarSallyActive = true;
        window.coverFireZones = [];

        // Activate the catapult siege force (spawned idle by buildNorthwatchFort).
        const catapult = window.campaign2NorthwatchCatapult;
        catapult.hp = catapult.maxHp; catapult.alive = true;
        catapult.firesRemaining = 10;
        catapult.aiState = 'combat';
        catapult.timePoints = 100;
        window.catapultHasFired = false;
        window.greenskinAssaultTriggered = false;

        const crew = window.entities.filter(e => e.isCatapultCrew);
        crew.forEach(e => { e.hp = e.maxHp; e.alive = true; e.aiState = 'combat'; e.timePoints = 100 + Math.random() * 0.9; });
        const guards = window.entities.filter(e => e.factionTag === 'greenskin_assault' && !e.isCatapultCrew && !e.isCatapult);
        guards.forEach(e => { e.hp = e.maxHp; e.alive = true; e.aiState = 'combat'; e.timePoints = 100 + Math.random() * 0.9; });

        const knights = window.campaign2NorthwatchKnights || [];
        knights.forEach(k => {
            k.hp = k.maxHp; k.alive = true; k.aiState = 'combat'; k.timePoints = 100 + Math.random() * 0.9;
            k._knightDecided = false;
            if (k.riding) { k.riding.hp = k.riding.maxHp; k.riding.alive = true; }
        });

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
            ent.combatDirective = { hostileTo: 'neutral', holdPosition: true, homeHex: { ...hex }, holdRadius: 18 };
            ent.aiControlled = true;
            ent.hasBeenSeenByPlayer = true;
            ent.timePoints = 100 + Math.random() * 0.9;
            ent.aiState = 'combat';
            ent.parriesRemaining = 3;
            ent.factionTag = ent.factionTag || 'greenskin_horde';
            return ent;
        });

        // Defenders/catapult/crew/guards/knights/horses are all already in
        // window.entities from buildNorthwatchFort's own world-gen — only
        // the ring attackers are new.
        window.entities.push(...attackers);
        window.isInCombat = true;
        window.currentTurnEntity = null;
        window.isPausedForReaction = false;
        window.player = attackers[0];
        window.__simDefenders = defenders;
        window.__simAttackers = attackers;
        window.__simCrew = crew;
        window.__simGuards = guards;
        window.__simKnights = knights;

        const region = window.campaign2NorthwatchFortRegion;
        const keepRegion = window.campaign2NorthwatchKeepRegion;
        if (!window.exploredHexes) window.exploredHexes = new Set();
        [...region.floorHexes, ...region.wallHexes, ...keepRegion.floorHexes, ...keepRegion.wallHexes]
            .forEach(h => window.exploredHexes.add(`${h.q},${h.r}`));
        for (let dq = -110; dq <= 110; dq += 2) {
            for (let dr = -110; dr <= 110; dr += 2) {
                if (Math.abs(dq) + Math.abs(dr) <= 120) window.exploredHexes.add(`${center.q + dq},${center.r + dr}`);
            }
        }
        window.isVisibleToPlayer = () => true;

        return {
            defenderCount: defenders.length, attackerCount: attackers.length,
            crewCount: crew.length, guardCount: guards.length, knightCount: knights.length,
            totalEntities: window.entities.length,
        };
    });
    console.log(`  Defenders: ${setup.defenderCount}. Attackers: ${setup.attackerCount}. Crew: ${setup.crewCount}. Guards: ${setup.guardCount}. Knights: ${setup.knightCount}. Total entities: ${setup.totalEntities}.\n`);

    const MAX_TICKS = 90000;
    let ticks = 0;
    let winner = null;
    const shots = { firstShot: false, catapultDown: false, assaultTriggered: false };

    console.log('Running (status every 1000 ticks)...');
    while (ticks < MAX_TICKS) {
        await page.evaluate(() => window.runTickInternal());
        await page.waitForTimeout(8);
        ticks++;

        // WORKAROUND: the game's passive TP-regen sweep filters entities by
        // distance from the real player party (isCombatDormant/restless-set
        // machinery, gameEngine.js) — built around "one active fight near
        // the camera," not a 200+-entity siege the real player character is
        // 260+ hexes away from the whole time. Confirmed directly (a
        // throwaway diagnostic, not committed) that regen for this siege's
        // own roster stops dead after ~250 ticks in that scenario. This is
        // an NPC-only balance harness, not real gameplay, so bypassing the
        // passive system and topping TP up directly for just this fight's
        // participants is the pragmatic fix — matches the ~2.5/tick rate
        // observed from the passive sweep before it stalled.
        if (ticks % 20 === 0) {
            await page.evaluate(() => {
                const roster = [
                    ...window.__simDefenders, ...window.__simAttackers,
                    ...window.__simCrew, ...window.__simGuards, ...window.__simKnights,
                    window.campaign2NorthwatchCatapult,
                ].filter(Boolean);
                roster.forEach(e => { if (e.alive && e.timePoints < 150) e.timePoints = Math.min(150, e.timePoints + 50); });
            });
        }

        if (ticks % 200 === 0) {
            const snap = await page.evaluate(() => ({
                catapultFired: !!window.catapultHasFired,
                catapultAlive: !!window.campaign2NorthwatchCatapult?.alive,
                assaultTriggered: !!window.greenskinAssaultTriggered,
            }));
            if (snap.catapultFired && !shots.firstShot) {
                shots.firstShot = true;
                console.log(`  >>> Catapult opened fire at tick ${ticks}`);
                await takeScreenshot(page, `catapult-first-shot-tick${ticks}`, outDir);
            }
            if (!snap.catapultAlive && !shots.catapultDown) {
                shots.catapultDown = true;
                console.log(`  >>> Catapult destroyed at tick ${ticks}`);
                await takeScreenshot(page, `catapult-destroyed-tick${ticks}`, outDir);
            }
            if (snap.assaultTriggered && !shots.assaultTriggered) {
                shots.assaultTriggered = true;
                console.log(`  >>> Greenskin assault triggered at tick ${ticks}`);
                await takeScreenshot(page, `assault-triggered-tick${ticks}`, outDir);
            }
        }

        if (ticks % 1000 === 0) {
            const snap = await page.evaluate(() => {
                const defAlive = window.__simDefenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
                const atkAlive = window.__simAttackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
                const crewAlive = window.__simCrew.filter(e => e.alive).length;
                const guardAlive = window.__simGuards.filter(e => e.alive).length;
                const knightAlive = window.__simKnights.filter(e => e.alive).length;
                return {
                    defAlive, atkAlive, crewAlive, guardAlive, knightAlive,
                    catapultHp: window.campaign2NorthwatchCatapult?.hp ?? 0,
                    catapultFires: window.campaign2NorthwatchCatapult?.firesRemaining ?? 0,
                };
            });
            console.log(`  tick ${ticks}: defenders ${snap.defAlive}/31 | attackers ${snap.atkAlive}/62 | crew ${snap.crewAlive}/3 | guards ${snap.guardAlive}/2 | knights ${snap.knightAlive}/5 | catapult hp ${snap.catapultHp} (${snap.catapultFires} shots left)`);

            if (snap.defAlive === 0 && snap.atkAlive > 0) { winner = 'attackers'; break; }
            if (snap.atkAlive === 0 && snap.defAlive > 0) { winner = 'defenders'; break; }
            if (snap.defAlive === 0 && snap.atkAlive === 0) { winner = 'mutual wipe'; break; }
        }
    }
    if (!winner) winner = `tick cap (${MAX_TICKS}) reached, still active`;

    const final = await page.evaluate(() => ({
        defAlive: window.__simDefenders.filter(e => e.alive && !e.fled && !e.disengaged).length,
        atkAlive: window.__simAttackers.filter(e => e.alive && !e.fled && !e.disengaged).length,
        crewAlive: window.__simCrew.filter(e => e.alive).length,
        guardAlive: window.__simGuards.filter(e => e.alive).length,
        knightAlive: window.__simKnights.filter(e => e.alive).length,
        commanderAlive: window.__simDefenders.find(e => e.name === 'Commander Ysolde Hart')?.alive,
        catapultAlive: !!window.campaign2NorthwatchCatapult?.alive,
        catapultHasFired: !!window.catapultHasFired,
        assaultTriggered: !!window.greenskinAssaultTriggered,
    }));
    await takeScreenshot(page, `final-state-tick${ticks}`, outDir);

    console.log(`\n=== RESULT: ${winner} at tick ${ticks} ===`);
    console.log(`Defenders: ${final.defAlive}/31 alive. Commander alive: ${final.commanderAlive}`);
    console.log(`Attackers: ${final.atkAlive}/62 alive.`);
    console.log(`Catapult crew: ${final.crewAlive}/3 alive. Catapult guards: ${final.guardAlive}/2 alive. Knights: ${final.knightAlive}/5 alive.`);
    console.log(`Catapult alive: ${final.catapultAlive}. Ever fired: ${final.catapultHasFired}. Assault triggered: ${final.assaultTriggered}.`);

    await browser.close();
    if (serverProc) serverProc.kill();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
