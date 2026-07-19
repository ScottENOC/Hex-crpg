#!/usr/bin/env node
// Standalone lean test: does 3 dwarf fighters + 1 defensive/healing human
// cleric out-scale 4 fighters against escalating goblin counts? Split out
// of ai-balance-sim.js for a fast, targeted run (see that file's
// bootPage/evalWithRecovery for the reasoning behind the crash-recovery
// and console-silencing bits duplicated here).
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
    await page.selectOption('#campaign-select', '1');
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.entities && window.entities.length > 0);
    await page.evaluate(() => {
        function buildCombatant(spec, side) {
            const ent = window.buildNPC({
                name: spec.name, race: spec.race, gender: 'male',
                hex: spec.hex, classLevels: spec.classLevels, skillPicks: spec.skillPicks || [],
                equipment: spec.equipment || [], side, factionId: null, color: 'white',
            });
            ent.aiControlled = true; ent.hasBeenSeenByPlayer = true; ent.timePoints = 100; ent.aiState = 'combat'; ent.parriesRemaining = 3;
            // buildNPC (called above) already auto-builds this entity's
            // spellbook from any learn_<spell> skill in skillPicks — see
            // spellPlanner.js's autoBuildSpellsForEntity, wired into buildNPC.
            return ent;
        }
        window.aiSim3 = {
            async runFight(partySpecs, enemyType, enemyCount, healthRank, maxTicks) {
                window.entities = [];
                window.isInCombat = true;
                window.currentTurnEntity = null;
                window.isPausedForReaction = false;
                const party = partySpecs.map(s => buildCombatant(s, 'player'));
                const enemies = Array.from({ length: enemyCount }, (_, i) =>
                    window.createMonster(enemyType, { q: 6 + i, r: 0 }, { health: healthRank, meleeDamage: healthRank }, null, 'enemy'));
                enemies.forEach(e => { e.aiState = 'combat'; e.timePoints = 100; e.hasBeenSeenByPlayer = true; });
                party.forEach((e, i) => { e.hex = { q: i, r: 0 }; e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null; });
                enemies.forEach((e, i) => { e.hex = { q: 6 + i, r: 0 }; e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null; });
                window.entities = [...party, ...enemies];
                window.player = party[0];
                const partyStartHp = party.reduce((a, e) => a + e.hp, 0);
                const sleep = (ms) => new Promise(r => setTimeout(r, ms));
                let ticks = 0;
                while (ticks < maxTicks) {
                    window.runTickInternal();
                    ticks++;
                    await sleep(12);
                    const pa = window.entities.filter(e => e.side === 'player' && e.alive);
                    const ea = window.entities.filter(e => e.side === 'enemy' && e.alive);
                    if (pa.length === 0 || ea.length === 0) break;
                }
                window.isInCombat = false;
                const partyAlive = window.entities.filter(e => e.side === 'player' && e.alive);
                const enemiesAlive = window.entities.filter(e => e.side === 'enemy' && e.alive);
                const partyEndHp = window.entities.filter(e => e.side === 'player').reduce((a, e) => a + Math.max(0, e.hp), 0);
                let winner;
                if (partyAlive.length > 0 && enemiesAlive.length === 0) winner = 'party';
                else if (enemiesAlive.length > 0 && partyAlive.length === 0) winner = 'enemy';
                else winner = 'timeout';
                return { winner, ticks, partyHpFractionRemaining: partyStartHp ? partyEndHp / partyStartHp : 0, partySurvivors: partyAlive.length };
            },
        };
    });
    return page;
}

const dwarf_fighter = {
    name: 'Dwarf Fighter', race: 'dwarf', classLevels: Array(5).fill('fighter'),
    skillPicks: ['sword_hit', 'sword_dmg', 'health', 'heavy_armor_training', 'health'],
    equipment: ['sword', 'medium_armor', 'wooden_shield'],
};

// Defensive/healing human cleric — human's +1 wildcard (race bonus, on top
// of the cleric class's own per-level 'divine'/'endurance'/'strength'/
// 'weapons' bonuses) covers the extra armor-progression pick beyond what a
// straight cleric budget would otherwise stretch to. Medium armor (per the
// ask) + heal + a couple of extra mana/health ranks, club for a modest,
// unfussy weapon rather than investing in offense.
const defensive_cleric = {
    name: 'Defensive Cleric', race: 'human', classLevels: Array(5).fill('cleric'),
    skillPicks: ['learn_heal', 'divine_mana', 'divine_mana', 'light_armor_training', 'medium_armor_training', 'health', 'health', 'club_hit'],
    equipment: ['club', 'medium_armor', 'wooden_shield'],
    spells: [{ baseId: 'heal' }],
};

const compositions = {
    '4 fighters': [dwarf_fighter, dwarf_fighter, dwarf_fighter, dwarf_fighter],
    '3 fighters + defensive cleric': [dwarf_fighter, dwarf_fighter, dwarf_fighter, defensive_cleric],
};

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
                console.log(`  [browser also died — relaunching]`);
                try { await browser.close(); } catch (e3) {}
                browser = await chromium.launch({ headless: true });
                page = await bootPage(browser);
            }
            return await page.evaluate(fn, arg);
        }
    }

    async function run(label, partySpecs, count, trials) {
        const outcomes = [];
        for (let t = 0; t < trials; t++) {
            outcomes.push(await evalWithRecovery(
                ({ partySpecs, count, maxTicks }) => window.aiSim3.runFight(partySpecs, 'goblin', count, 1, maxTicks),
                { partySpecs, count, maxTicks: 500 }
            ));
        }
        const winRate = outcomes.filter(o => o.winner === 'party').length / outcomes.length;
        const avgHpLeft = outcomes.reduce((a, o) => a + o.partyHpFractionRemaining, 0) / outcomes.length;
        const avgTicks = outcomes.reduce((a, o) => a + o.ticks, 0) / outcomes.length;
        console.log(`${label.padEnd(45)} winRate=${(winRate * 100).toFixed(0).padStart(3)}%  avgPartyHpLeft=${(avgHpLeft * 100).toFixed(0).padStart(3)}%  avgTicks=${avgTicks.toFixed(0)}`);
        return winRate;
    }

    for (const [label, party] of Object.entries(compositions)) {
        let lastGood = 0, consecutiveZero = 0;
        for (const count of [2, 4, 6, 8, 10, 12]) {
            const winRate = await run(`${label} vs ${count} goblins`, party, count, 4);
            if (winRate >= 0.5) { lastGood = count; consecutiveZero = 0; }
            else { consecutiveZero++; if (consecutiveZero >= 2) break; }
        }
        console.log(`  -> ${label}: can reliably beat up to ~${lastGood} goblins\n`);
    }

    console.log('Done.');
    await browser.close();
    if (serverProc) { try { process.kill(-serverProc.pid); } catch (e) {} }
}

main().catch(e => { console.error(e); process.exit(1); });
