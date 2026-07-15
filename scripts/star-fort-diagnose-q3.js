#!/usr/bin/env node
const path = require('path');
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

async function runDiagnostic(page, { spawnRadius, disableRetreat, attackerMultiplier, maxTicks }) {
    return page.evaluate(async ({ spawnRadius, disableRetreat, attackerMultiplier, maxTicks }) => {
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
            return ent;
        });

        window.entities = [...defenders, ...attackers];
        window.isInCombat = true;
        window.currentTurnEntity = null;
        window.isPausedForReaction = false;
        window.player = attackers[0];

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        let ticks = 0;
        while (ticks < maxTicks) {
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
        return { winner, ticks, defendersAlive, defendersTotal: defenders.length, attackersAlive, attackersTotal: attackers.length };
    }, { spawnRadius, disableRetreat, attackerMultiplier, maxTicks });
}

async function main() {
    await waitForServer(BASE_URL, 5000);
    const browser = await chromium.launch({ headless: true });
    const page = await bootPage(browser);
    console.log('=== Q3: retreat contingency ON vs OFF ===');
    for (const disableRetreat of [false, true]) {
        const results = [];
        for (let t = 0; t < 3; t++) {
            const r = await runDiagnostic(page, { spawnRadius: 30, disableRetreat, attackerMultiplier: 1, maxTicks: 10000 });
            results.push(r);
            console.log(`  [retreat ${disableRetreat ? 'OFF' : 'ON '}] trial ${t + 1}: winner=${r.winner} ticks=${r.ticks} defendersAlive=${r.defendersAlive}/${r.defendersTotal} attackersAlive=${r.attackersAlive}/${r.attackersTotal}`);
        }
        const defWins = results.filter(r => r.winner === 'defenders').length;
        console.log(`  [retreat ${disableRetreat ? 'OFF' : 'ON '}] defender win rate: ${defWins}/${results.length}`);
    }
    await browser.close();
    console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
