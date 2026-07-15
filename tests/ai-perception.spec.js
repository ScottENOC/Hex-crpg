// tests/ai-perception.spec.js
// The hunter/prey AI rework (gameEngine.js: knownOpponents perception
// memory, computeForceBalance, resolveNoVisibleTargetAI) — see the plan's
// "AI perception, hunter/prey behavior, and the star-fort stalemate fix"
// section. These drive the new pieces directly, same style as
// combat-directive.spec.js.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('AI perception memory + hunter/prey behavior', () => {
    test('memory persists (ages in place, is not deleted) once a known target breaks line of sight', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const watcher = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy');
            watcher.aiState = 'combat';
            watcher.timePoints = 100;
            const target = window.createMonster('goblin', { q: 2, r: 0 }, null, null, 'player');
            target.timePoints = 100;
            window.entities = [watcher, target];
            window.currentTurnEntity = watcher;
            window.isInCombat = true;
            window.takeTurn(watcher);
            await new Promise(r => setTimeout(r, 600));
            const sawIt = watcher.knownOpponents?.get(target.id)?.alive === true;

            // Now hide the target behind a wall far away — canSee should fail.
            window.setTerrainAt(1, 0, 'Wall');
            target.hex = { q: 40, r: 40 };
            watcher.timePoints = 100;
            window.currentTurnEntity = watcher;
            window.takeTurn(watcher);
            await new Promise(r => setTimeout(r, 600));
            const stillRemembered = watcher.knownOpponents?.has(target.id);
            const stillMarkedAlive = watcher.knownOpponents?.get(target.id)?.alive === true;

            return { sawIt, stillRemembered, stillMarkedAlive };
        });
        expect(result.sawIt).toBe(true);
        expect(result.stillRemembered).toBe(true);
        expect(result.stillMarkedAlive).toBe(true);
    });

    test('a dead opponent is marked alive:false in every rememberer\'s map', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const watcherA = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'player');
            const watcherB = window.createMonster('goblin', { q: 5, r: 5 }, null, null, 'player');
            const target = window.createMonster('goblin', { q: 1, r: 0 }, null, null, 'enemy');
            watcherA.knownOpponents = new Map([[target.id, { hex: { ...target.hex }, tick: 0, alive: true }]]);
            watcherB.knownOpponents = new Map(); // never saw this target
            window.entities = [watcherA, watcherB, target];
            window.handleLethalDamage(target, watcherA);
            return {
                aKnowsDeadNow: watcherA.knownOpponents.get(target.id)?.alive,
                bMapUntouched: watcherB.knownOpponents.size,
            };
        });
        expect(result.aKnowsDeadNow).toBe(false);
        expect(result.bMapUntouched).toBe(0);
    });

    test('computeForceBalance applies combatDirective.outnumberWeight to same-side allies', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const defender = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'neutral');
            defender.aiState = 'combat';
            defender.combatDirective = { outnumberWeight: 2 };
            const ally = window.createMonster('goblin', { q: 1, r: 0 }, null, null, 'neutral');
            ally.aiState = 'combat';
            ally.combatDirective = { outnumberWeight: 2 };
            const raider = window.createMonster('goblin', { q: 10, r: 10 }, null, null, 'enemy');
            defender.knownOpponents = new Map([[raider.id, { hex: { ...raider.hex }, tick: 0, alive: true }]]);
            window.entities = [defender, ally, raider];
            return window.computeForceBalance(defender);
        });
        expect(result.mine).toBe(4); // 2 defenders x weight 2
        expect(result.theirs).toBe(1);
    });

    test('a severely outnumbered defender with no visible enemy flees; the same defender with a visible enemy does not', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const makeScene = () => {
                const defender = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'neutral');
                defender.aiState = 'combat';
                defender.timePoints = 100;
                defender.combatDirective = { hostileTo: 'enemy', outnumberWeight: 2 };
                // 9 known raiders so theirs=9 vastly exceeds mine=2 (1
                // defender * weight 2) -> severely outnumbered. Placed at
                // distance 27+ (beyond LIVE_VISION_RANGE=25, so not visible
                // this turn) but well under the 10x-threatRadius(3)=30
                // disengage-entirely distance, so the nearest one still
                // pulls the defender into "step away" rather than "leave
                // combat outright."
                defender.knownOpponents = new Map();
                for (let i = 0; i < 9; i++) {
                    const raider = window.createMonster('goblin', { q: 27 + i, r: 0 }, null, null, 'enemy');
                    defender.knownOpponents.set(raider.id, { hex: { ...raider.hex }, tick: 0, alive: true });
                }
                return defender;
            };

            // Case 1: nothing visible this turn -> should flee (move away).
            const fleeingDefender = makeScene();
            window.entities = [fleeingDefender];
            window.currentTurnEntity = fleeingDefender;
            window.isInCombat = true;
            const startHex = { ...fleeingDefender.hex };
            window.takeTurn(fleeingDefender);
            await new Promise(r => setTimeout(r, 600));
            const moved = fleeingDefender.hex.q !== startHex.q || fleeingDefender.hex.r !== startHex.r;

            // Case 2: one raider adjacent and visible -> fights, does not flee.
            const fightingDefender = makeScene();
            fightingDefender.timePoints = 100;
            const adjacentRaider = window.createMonster('goblin', { q: 1, r: 0 }, null, null, 'enemy');
            adjacentRaider.timePoints = 100;
            window.entities = [fightingDefender, adjacentRaider];
            window.currentTurnEntity = fightingDefender;
            window.takeTurn(fightingDefender);
            await new Promise(r => setTimeout(r, 600));
            const stayedAndFought = fightingDefender.hex.q === 0 && fightingDefender.hex.r === 0 && adjacentRaider.hp < adjacentRaider.maxHp;

            return { moved, stayedAndFought };
        });
        expect(result.moved).toBe(true);
        expect(result.stayedAndFought).toBe(true);
    });

    test('the search-illumination anti-oscillation cache stays untouched for a fight that never enters hunter/prey mode', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            delete window.__searchIllumCache;
            const attacker = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy');
            attacker.aiState = 'combat';
            attacker.timePoints = 100;
            const target = window.createMonster('goblin', { q: 1, r: 0 }, null, null, 'player');
            target.timePoints = 100;
            window.entities = [attacker, target];
            window.currentTurnEntity = attacker;
            window.isInCombat = true;
            window.takeTurn(attacker); // normal adjacent-target fight, never reaches resolveNoVisibleTargetAI
            await new Promise(r => setTimeout(r, 600));
            return { cacheTouched: !!window.__searchIllumCache };
        });
        expect(result.cacheTouched).toBe(false);
    });

    test('markFled treats a fled entity as defeated: grants XP, excludes it from checkCombatEnd, and is one-shot', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.gainExp ? (window.player.exp || 0) : 0;
            const runner = window.createMonster('goblin', { q: 5, r: 5 }, null, null, 'enemy');
            runner.expValue = 42;
            window.entities = [runner];
            window.markFled(runner);
            const afterFirst = window.player.exp || 0;
            window.markFled(runner); // one-shot: calling again must not double-grant XP
            const afterSecond = window.player.exp || 0;
            const excludedFromCombatEnd = window.entities.filter(e => e.side === 'enemy' && e.alive && !e.fled).length;
            return { before, afterFirst, afterSecond, fled: runner.fled, disengaged: runner.disengaged, excludedFromCombatEnd };
        });
        expect(result.afterFirst).toBe(result.before + 42);
        expect(result.afterSecond).toBe(result.afterFirst); // no double grant
        expect(result.fled).toBe(true);
        expect(result.disengaged).toBe(true);
        expect(result.excludedFromCombatEnd).toBe(0);
    });

    test('a chase that never closes (hunter matches fleeing prey\'s speed) times out into markFled rather than running forever', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            // Simulate the timeout directly rather than actually running 200
            // turns through takeTurn (slow) — pre-set the stuck counter one
            // short of the threshold and confirm the next aiProcess call
            // (with the same severe-outnumbered, non-adjacent conditions)
            // crosses it and resolves via markFled.
            const runner = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy');
            runner.combatDirective = { hostileTo: 'neutral' };
            runner.aiState = 'combat';
            runner.timePoints = 100;
            runner._chaseStuckTurns = 19;
            const hunters = [];
            for (let i = 0; i < 6; i++) {
                const h = window.createMonster('goblin', { q: 20 + i, r: 0 }, null, null, 'neutral');
                h.aiState = 'combat';
                hunters.push(h);
            }
            // knownOpponents populated directly (rather than relying on a
            // real canSee this turn) — computeForceBalance reads memory,
            // not raw visibility, and the point of this test is the
            // stuck-counter/timeout mechanism, not perception itself.
            runner.knownOpponents = new Map(hunters.map(h => [h.id, { hex: { ...h.hex }, tick: 0, alive: true }]));
            window.entities = [runner, ...hunters];
            window.currentTurnEntity = runner;
            window.isInCombat = true;
            window.takeTurn(runner);
            await new Promise(r => setTimeout(r, 600));
            return { fled: runner.fled };
        });
        expect(result.fled).toBe(true);
    });
});
