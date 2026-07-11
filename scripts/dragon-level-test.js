#!/usr/bin/env node
// Standalone lean test: what level does the balanced party (wizard/rogue/
// fighter/cleric) need to reliably beat a young dragon, now that its mana
// and kiting AI are fixed? Split out of ai-balance-sim.js so a bad run
// doesn't burn 30+ minutes re-deriving data we already have.
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
            if (spec.spells && spec.spells.length) {
                ent.createdSpells = ent.createdSpells || [];
                spec.spells.forEach(s => {
                    const base = window.baseSpells[s.baseId];
                    if (!base) return;
                    ent.createdSpells.push({
                        name: base.name, school: base.school, baseId: s.baseId,
                        manaCost: base.baseMana, coreManaCost: base.baseMana,
                        tpCost: 10, magnitude: base.baseMagnitude, range: base.baseRange || 6,
                        radius: 0, extraTargets: 0, type: base.type,
                    });
                });
            }
            return ent;
        }
        window.aiSim2 = {
            async fightDragon(partySpecs, maxTicks) {
                window.entities = [];
                window.isInCombat = true;
                window.currentTurnEntity = null;
                window.isPausedForReaction = false;
                const party = partySpecs.map(s => buildCombatant(s, 'player'));
                const dragon = window.createMonster('dragon_young', { q: 6, r: 0 }, null, null, 'enemy');
                dragon.aiState = 'combat'; dragon.timePoints = 100; dragon.hasBeenSeenByPlayer = true;
                party.forEach((e, i) => { e.hex = { q: i, r: 0 }; e.visualQ = e.hex.q; e.visualR = e.hex.r; e.destination = null; });
                window.entities = [...party, dragon];
                window.player = party[0];
                const partyStartHp = party.reduce((a, e) => a + e.hp, 0);
                const sleep = (ms) => new Promise(r => setTimeout(r, ms));
                let ticks = 0;
                while (ticks < maxTicks) {
                    window.runTickInternal();
                    ticks++;
                    await sleep(12);
                    const pa = window.entities.filter(e => e.side === 'player' && e.alive);
                    if (pa.length === 0 || !dragon.alive) break;
                }
                window.isInCombat = false;
                const partyAlive = window.entities.filter(e => e.side === 'player' && e.alive);
                const partyEndHp = window.entities.filter(e => e.side === 'player').reduce((a, e) => a + Math.max(0, e.hp), 0);
                let winner;
                if (!dragon.alive && partyAlive.length > 0) winner = 'party';
                else if (partyAlive.length === 0) winner = 'dragon';
                else winner = 'timeout';
                return { winner, ticks, partyHpFractionRemaining: partyStartHp ? partyEndHp / partyStartHp : 0, dragonHpFractionRemaining: dragon.hp / dragon.maxHp };
            },
        };
    });
    return page;
}

const ARCHETYPES = {
    elf_wizard: {
        name: 'Elf Wizard', race: 'elf', classLevels: Array(5).fill('wizard'),
        skillPicks: ['learn_firebolt', 'arcane_mana', 'arcane_mana', 'health'],
        equipment: ['dagger'], spells: [{ baseId: 'firebolt' }],
    },
    goblin_rogue: {
        name: 'Goblin Rogue', race: 'goblin', classLevels: Array(5).fill('rogue'),
        skillPicks: ['stealth_rogue', 'stealth_rogue', 'dagger_hit', 'dagger_dmg', 'health'],
        equipment: ['dagger', 'light_armor'],
    },
    dwarf_fighter: {
        name: 'Dwarf Fighter', race: 'dwarf', classLevels: Array(5).fill('fighter'),
        skillPicks: ['sword_hit', 'sword_dmg', 'health', 'heavy_armor_training', 'health'],
        equipment: ['sword', 'medium_armor', 'wooden_shield'],
    },
    human_cleric: {
        name: 'Human Cleric', race: 'human', classLevels: Array(5).fill('cleric'),
        skillPicks: ['learn_heal', 'divine_mana', 'divine_mana', 'health'],
        equipment: ['club', 'medium_armor'], spells: [{ baseId: 'heal' }],
    },
};

function scaledBalancedParty(level) {
    const scale = (base, cls) => ({
        ...base,
        classLevels: Array(level).fill(cls),
        skillPicks: [...base.skillPicks, ...Array(Math.max(0, level - 5)).fill('health')],
    });
    return [
        scale(ARCHETYPES.elf_wizard, 'wizard'),
        scale(ARCHETYPES.goblin_rogue, 'rogue'),
        scale(ARCHETYPES.dwarf_fighter, 'fighter'),
        scale(ARCHETYPES.human_cleric, 'cleric'),
    ];
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
                console.log(`  [browser also died — relaunching]`);
                try { await browser.close(); } catch (e3) {}
                browser = await chromium.launch({ headless: true });
                page = await bootPage(browser);
            }
            return await page.evaluate(fn, arg);
        }
    }

    for (const level of [5, 10, 15, 20, 25, 30]) {
        const partySpecs = scaledBalancedParty(level);
        const outcomes = [];
        for (let t = 0; t < 5; t++) {
            outcomes.push(await evalWithRecovery(({ partySpecs, maxTicks }) => window.aiSim2.fightDragon(partySpecs, maxTicks), { partySpecs, maxTicks: 700 }));
        }
        const winRate = outcomes.filter(o => o.winner === 'party').length / outcomes.length;
        const avgHpLeft = outcomes.reduce((a, o) => a + o.partyHpFractionRemaining, 0) / outcomes.length;
        const avgDragonHpLeft = outcomes.reduce((a, o) => a + o.dragonHpFractionRemaining, 0) / outcomes.length;
        const avgTicks = outcomes.reduce((a, o) => a + o.ticks, 0) / outcomes.length;
        console.log(`balanced party @ lvl ${String(level).padEnd(3)} vs young dragon  winRate=${(winRate * 100).toFixed(0).padStart(3)}%  avgPartyHpLeft=${(avgHpLeft * 100).toFixed(0).padStart(3)}%  avgDragonHpLeft=${(avgDragonHpLeft * 100).toFixed(0).padStart(3)}%  avgTicks=${avgTicks.toFixed(0)}`);
        if (winRate >= 0.75) { console.log(`  -> reliably wins from level ${level}`); break; }
    }

    console.log('Done.');
    await browser.close();
    if (serverProc) { try { process.kill(-serverProc.pid); } catch (e) {} }
}

main().catch(e => { console.error(e); process.exit(1); });
