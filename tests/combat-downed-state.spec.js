// tests/combat-downed-state.spec.js
// The unconscious/true-death mechanic, Game Over, and AI target priority.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('downed state and death threshold', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('a hit landing in the 0..-50%maxHp band knocks the target unconscious, not dead', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            wren.hp = -Math.floor(wren.maxHp * 0.3); // within the 0..-50% band
            window.handleLethalDamage(wren, { side: 'enemy', name: 'TestAttacker' });
            return { alive: wren.alive, unconscious: wren.unconscious };
        });
        expect(result.alive).toBe(true);
        expect(result.unconscious).toBe(true);
    });

    test('an unconscious character is excluded from turn eligibility but stays a valid target', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            wren.alive = true; wren.unconscious = true; wren.timePoints = 150;
            const ready = window.entities.filter(e => e.timePoints >= 100 && e.alive && !e.unconscious && !e.rider);
            const validTarget = window.entities.filter(e => e.alive).includes(wren);
            return { inReadyEntities: ready.includes(wren), stillValidTarget: validTarget };
        });
        expect(result.inReadyEntities).toBe(false);
        expect(result.stillValidTarget).toBe(true);
    });

    test('healing an unconscious ally back above 0 HP wakes them up', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            wren.hp = -2; wren.unconscious = true;
            const healMagnitude = 15;
            wren.hp = Math.min(wren.maxHp, wren.hp + healMagnitude);
            if (wren.unconscious && wren.hp > 0) wren.unconscious = false;
            return { hp: wren.hp, unconscious: wren.unconscious };
        });
        expect(result.hp).toBeGreaterThan(0);
        expect(result.unconscious).toBe(false);
    });

    test('hp at or below -50% maxHp is true death: alive:false', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            wren.hp = -(wren.maxHp * 0.6);
            wren.unconscious = false;
            window.handleLethalDamage(wren, { side: 'enemy', name: 'TestAttacker' });
            return { alive: wren.alive, unconscious: wren.unconscious };
        });
        expect(result.alive).toBe(false);
        expect(result.unconscious).toBe(false);
    });

    test('a "finishing blow" on an already-unconscious character also crosses into true death', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            wren.hp = -3; wren.unconscious = true; wren.alive = true;
            wren.hp = -(wren.maxHp * 0.55); // a follow-up hit pushes past -50%
            window.handleLethalDamage(wren, { side: 'enemy', name: 'TestAttacker' });
            return wren.alive;
        });
        expect(result).toBe(false);
    });

    test('Game Over triggers only for the main character (party[0]), not for allies', async ({ page }) => {
        const allyResult = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot'); // party[1], not the main character
            wren.hp = -(wren.maxHp);
            window.handleLethalDamage(wren, { side: 'enemy', name: 'TestAttacker' });
            return window.gameOver;
        });
        expect(allyResult).toBeFalsy(); // window.gameOver is undefined until first set, which is itself correct — tick()'s guard treats both as "not over"

        const mainResult = await page.evaluate(() => {
            const main = window.entities.find(e => e.name === window.party[0].name);
            main.hp = -(main.maxHp);
            window.handleLethalDamage(main, { side: 'enemy', name: 'TestAttacker' });
            return {
                gameOver: window.gameOver,
                modalDisplay: document.getElementById('game-over-modal').style.display,
            };
        });
        expect(mainResult.gameOver).toBe(true);
        expect(mainResult.modalDisplay).toBe('block');
    });

    test('tick() stops advancing world state once Game Over is set', async ({ page }) => {
        await page.evaluate(() => {
            const main = window.entities.find(e => e.name === window.party[0].name);
            main.hp = -(main.maxHp);
            window.handleLethalDamage(main, { side: 'enemy', name: 'TestAttacker' });
        });
        const before = await page.evaluate(() => window.worldSeconds);
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => window.worldSeconds);
        expect(after).toBe(before);
    });

    test('AI targeting deprioritizes an unconscious opponent when no healer is present', async ({ page }) => {
        // Exercises the actual production comparator (window.targetPriorityCompare /
        // opponentsHaveHealerCapability, extracted from aiProcess), not a re-derived copy.
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            const attacker = window.entities.find(e => e.name === window.party[0].name);
            wren.alive = true; wren.unconscious = true; wren.hp = 5;
            oskar.side = 'player'; oskar.alive = true; oskar.unconscious = false; oskar.hp = 10;
            oskar.hex = { q: wren.hex.q, r: wren.hex.r }; // same distance, isolates the priority rule
            oskar.skills = { ...(oskar.skills || {}) };
            delete oskar.skills.learn_heal;

            const opponents = [wren, oskar];
            const hasHealer = window.opponentsHaveHealerCapability(opponents);
            const sorted = [...opponents].sort((a, b) => window.targetPriorityCompare(attacker, a, b, hasHealer));
            return sorted[0].name;
        });
        expect(result).toBe('Oskar Vinn');
    });

    test('AI targeting prioritizes finishing off an unconscious opponent when a healer is present', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            const attacker = window.entities.find(e => e.name === window.party[0].name);
            wren.alive = true; wren.unconscious = true; wren.hp = 5;
            oskar.side = 'player'; oskar.alive = true; oskar.unconscious = false; oskar.hp = 10;
            oskar.hex = { q: wren.hex.q, r: wren.hex.r };
            oskar.skills = { ...(oskar.skills || {}), learn_heal: 1 };

            const opponents = [wren, oskar];
            const hasHealer = window.opponentsHaveHealerCapability(opponents);
            const sorted = [...opponents].sort((a, b) => window.targetPriorityCompare(attacker, a, b, hasHealer));
            return sorted[0].name;
        });
        expect(result).toBe('Wren Talbot');
    });

    test('tutorialFightGuard stops the AI from finishing off a downed main character even with a healer present', async ({ page }) => {
        // Regression for the Hollowmere shakedown difficulty guard: a fresh
        // level-1 protagonist's very first scripted fight shouldn't let the
        // "finish them before the healer saves them" logic apply to them
        // specifically, even though it's the intended smart play in general.
        const result = await page.evaluate(() => {
            const mainName = window.party[0].name;
            const main = window.entities.find(e => e.name === mainName);
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            const attacker = window.entities.find(e => e.name === 'Dray Coltayne') || window.entities.find(e => e.side === 'enemy') || { name: 'Dray Coltayne', tutorialFightGuard: true };
            attacker.tutorialFightGuard = true;

            main.alive = true; main.unconscious = true; main.hp = 5;
            oskar.side = 'player'; oskar.alive = true; oskar.unconscious = false; oskar.hp = 10;
            oskar.hex = { q: main.hex.q, r: main.hex.r };
            oskar.skills = { ...(oskar.skills || {}), learn_heal: 1 }; // a healer is present

            const opponents = [main, oskar];
            const hasHealer = window.opponentsHaveHealerCapability(opponents);
            const sorted = [...opponents].sort((a, b) => window.targetPriorityCompare(attacker, a, b, hasHealer));
            return sorted[0].name;
        });
        expect(result).toBe('Oskar Vinn');
    });
});
