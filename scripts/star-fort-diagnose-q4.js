#!/usr/bin/env node
// Q4: how many wall-garrison archers actually exist, how many shots do
// they fire on average, and does equipping every defender with bow (primary)
// + sword/shield (reserve) change the outcome?
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

async function runDiagnostic(page, { spawnRadius, forceAllArchers, attackerMultiplier, maxTicks }) {
    return page.evaluate(async ({ spawnRadius, forceAllArchers, attackerMultiplier, maxTicks }) => {
        const center = window.campaign2NorthwatchCenter;
        function getDefenders() {
            return window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive !== undefined);
        }
        const defenderBaseline = getDefenders().map(d => ({ ref: d, hex: { ...d.hex }, maxHp: d.maxHp }));
        const defenders = defenderBaseline.map(d => {
            const e = d.ref;
            e.hp = d.maxHp; e.alive = true; e.unconscious = false;
            e.simKills = 0;
            e.shotsF = 0; e.meleeF = 0; // fired counts, test-only
            e.timePoints = 100 + Math.random() * 0.9;
            e.hex = { ...d.hex };
            e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null;
            if (e.combatDirective) e.combatDirective.mode = null;
            e.fled = false; e.disengaged = false;
            e.knownOpponents = new Map();
            e._chaseStuckTurns = 0; e._parkedTurns = 0; e._parkedAtHex = null;
            e.climbing = null;

            if (forceAllArchers && e.name !== 'Commander Ysolde Hart') {
                // Give every defender a bow as primary + sword/shield as
                // reserve (mirrors how the commander/archer specs already
                // carry a backup — equipToMonster's "last equipped wins the
                // weapon slot" convention, see campaign2Content.js).
                window.equipToMonster(e, 'sword');
                window.equipToMonster(e, 'wooden_shield');
                window.equipToMonster(e, 'bow');
            }
            return e;
        });
        defenders.forEach(e => { if (e.name === 'Commander Ysolde Hart') e.takeFallenArcherPostOnce = true; });

        const archersAtStart = defenders.filter(e => {
            const w = e.equipped?.weapon ? window.items[e.equipped.weapon] : null;
            return w?.subType === 'ranged';
        });

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

        // Count shots fired, test-only: wrap resolveAttack once, attribute
        // by whether the attacking entity currently has a ranged weapon
        // equipped at the moment of the call.
        const origResolveAttack = window.resolveAttack;
        window.resolveAttack = function (attacker, target, ...rest) {
            if (defenders.includes(attacker)) {
                const w = attacker.equipped?.weapon ? window.items[attacker.equipped.weapon] : null;
                if (w?.subType === 'ranged') attacker.shotsF++; else attacker.meleeF++;
            }
            return origResolveAttack(attacker, target, ...rest);
        };

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
        window.resolveAttack = origResolveAttack;

        const defendersAlive = defenders.filter(e => e.alive && !e.fled && !e.disengaged).length;
        const attackersAlive = attackers.filter(e => e.alive && !e.fled && !e.disengaged).length;
        let winner;
        if (defendersAlive > 0 && attackersAlive === 0) winner = 'defenders';
        else if (attackersAlive > 0 && defendersAlive === 0) winner = 'attackers';
        else winner = 'timeout';

        return {
            winner, ticks, defendersAlive, defendersTotal: defenders.length, attackersAlive, attackersTotal: attackers.length,
            archerCountAtStart: archersAtStart.length,
            totalShots: defenders.reduce((a, e) => a + e.shotsF, 0),
            totalMelee: defenders.reduce((a, e) => a + e.meleeF, 0),
            shotsPerArcher: archersAtStart.length ? +(defenders.reduce((a, e) => a + e.shotsF, 0) / archersAtStart.length).toFixed(1) : 0,
        };
    }, { spawnRadius, forceAllArchers, attackerMultiplier, maxTicks });
}

async function main() {
    await waitForServer(BASE_URL, 5000);
    const browser = await chromium.launch({ headless: true });
    const page = await bootPage(browser);

    console.log('=== Q4a: archer count + shots fired (current roster, retreat ON) ===');
    for (let t = 0; t < 2; t++) {
        const r = await runDiagnostic(page, { spawnRadius: 30, forceAllArchers: false, attackerMultiplier: 1, maxTicks: 8000 });
        console.log(`  trial ${t + 1}: archers=${r.archerCountAtStart}/${r.defendersTotal}  totalShots=${r.totalShots}  shotsPerArcher=${r.shotsPerArcher}  totalMeleeSwings=${r.totalMelee}  winner=${r.winner} ticks=${r.ticks} defAlive=${r.defendersAlive} atkAlive=${r.attackersAlive}`);
    }

    console.log('\n=== Q4b: all defenders bow+sword/shield (retreat ON), same spawn ===');
    for (let t = 0; t < 3; t++) {
        const r = await runDiagnostic(page, { spawnRadius: 30, forceAllArchers: true, attackerMultiplier: 1, maxTicks: 8000 });
        console.log(`  trial ${t + 1}: archers=${r.archerCountAtStart}/${r.defendersTotal}  totalShots=${r.totalShots}  shotsPerArcher=${r.shotsPerArcher}  totalMeleeSwings=${r.totalMelee}  winner=${r.winner} ticks=${r.ticks} defAlive=${r.defendersAlive} atkAlive=${r.attackersAlive}`);
    }

    await browser.close();
    console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
