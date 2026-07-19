// tests/arena-scenarios.spec.js
// Arena scenario variety (see the plan's "Arena scenario variety" section):
// window.arenaScenario carries an objective beyond "clear the field", read
// by tickArenaScenario (called once per player turn from finalizePlayerAction)
// and endArenaScenario (the shared early-exit path for objectives that can
// resolve before/without every enemy dying). These tests drive the
// scenario logic directly, the same style as tests/northwatch-siege.spec.js.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Arena scenario variety', () => {
    test('flag defense (player holds): an attacker reaching the flag hex ends the fight in defeat', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInArena = true;
            const flagHex = { q: 5, r: 5 };
            window.arenaScenario = { type: 'flag_defend', turnsElapsed: 3, turnsToHold: 15, flagHex };
            const attacker = window.createMonster('goblin', flagHex, null, null, 'enemy');
            window.entities = [attacker];
            window.tickArenaScenario();
            return { isInArena: window.isInArena, scenarioCleared: window.arenaScenario === null };
        });
        expect(result.isInArena).toBe(false);
        expect(result.scenarioCleared).toBe(true);
    });

    test('flag defense (player holds): surviving to turnsToHold with no attacker on the flag ends the fight in victory', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInArena = true;
            const flagHex = { q: 5, r: 5 };
            window.arenaScenario = { type: 'flag_defend', turnsElapsed: 15, turnsToHold: 15, flagHex };
            const attacker = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy'); // far from the flag
            window.entities = [attacker];
            window.tickArenaScenario();
            return { isInArena: window.isInArena };
        });
        expect(result.isInArena).toBe(false);
    });

    test('flag defense (player holds): neither win nor loss condition met keeps the fight going', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInArena = true;
            const flagHex = { q: 5, r: 5 };
            window.arenaScenario = { type: 'flag_defend', turnsElapsed: 3, turnsToHold: 15, flagHex };
            const attacker = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy');
            window.entities = [attacker];
            window.tickArenaScenario();
            return { isInArena: window.isInArena, scenario: window.arenaScenario };
        });
        expect(result.isInArena).toBe(true);
        expect(result.scenario.type).toBe('flag_defend');
    });

    test('flag defense (player attacks): reaching the flag hex ends the fight in victory', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInArena = true;
            const flagHex = { q: 8, r: 0 };
            window.arenaScenario = { type: 'flag_attack', turnsElapsed: 2, flagHex };
            const playerEnt = window.entities.find(e => e.side === 'player');
            playerEnt.hex = { ...flagHex };
            window.tickArenaScenario();
            return { isInArena: window.isInArena };
        });
        expect(result.isInArena).toBe(false);
    });

    test('periodic lava flood: toggles on at the interval and damages whoever is standing on a lava hex', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInArena = true;
            const lavaHex = { q: 3, r: 3 };
            window.arenaScenario = { type: 'lava_flood', turnsElapsed: 6, floodInterval: 6, flooded: false, lavaHexes: [lavaHex] };
            const victim = window.createMonster('goblin', lavaHex, null, null, 'enemy');
            victim.hp = 50; victim.maxHp = 50;
            window.entities = [victim];
            window.tickArenaScenario();
            return { flooded: window.arenaScenario.flooded, hpAfter: victim.hp };
        });
        expect(result.flooded).toBe(true);
        expect(result.hpAfter).toBe(42); // 50 - 8 flood damage
    });

    test('periodic lava flood: does not damage anyone while dormant (off-interval turn)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInArena = true;
            const lavaHex = { q: 3, r: 3 };
            window.arenaScenario = { type: 'lava_flood', turnsElapsed: 3, floodInterval: 6, flooded: false, lavaHexes: [lavaHex] };
            const victim = window.createMonster('goblin', lavaHex, null, null, 'enemy');
            victim.hp = 50; victim.maxHp = 50;
            window.entities = [victim];
            window.tickArenaScenario();
            return { flooded: window.arenaScenario.flooded, hpAfter: victim.hp };
        });
        expect(result.flooded).toBe(false);
        expect(result.hpAfter).toBe(50);
    });

    test('three-way hostile parties: a rivalGroup enemy attacks a plain enemy standing next to it', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            window.isInArena = true;
            window.arenaScenario = { type: 'three_way', turnsElapsed: 0 };
            const rival = window.createMonster('orc', { q: 0, r: 0 }, null, null, 'enemy');
            rival.rivalGroup = true;
            rival.aiState = 'combat';
            rival.timePoints = 100;
            const plainEnemy = window.createMonster('goblin', { q: 1, r: 0 }, null, null, 'enemy');
            plainEnemy.hp = 200; plainEnemy.maxHp = 200; // survive several swings so we can just check it was hit
            window.entities = [rival, plainEnemy];
            window.currentTurnEntity = rival;
            window.isInCombat = true;
            window.takeTurn(rival);
            await new Promise(r => setTimeout(r, 600));
            return { plainEnemyHp: plainEnemy.hp, plainEnemyAlive: plainEnemy.alive };
        });
        expect(result.plainEnemyAlive).toBe(true);
        expect(result.plainEnemyHp).toBeLessThan(200);
    });

    test('three-way hostile parties: without the scenario flag, one enemy never targets another enemy', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            window.isInArena = true;
            window.arenaScenario = { type: 'standard', turnsElapsed: 0 };
            const rival = window.createMonster('orc', { q: 0, r: 0 }, null, null, 'enemy');
            rival.rivalGroup = true;
            rival.aiState = 'combat';
            rival.timePoints = 100;
            const plainEnemy = window.createMonster('goblin', { q: 1, r: 0 }, null, null, 'enemy');
            plainEnemy.hp = 200; plainEnemy.maxHp = 200;
            window.entities = [rival, plainEnemy];
            window.currentTurnEntity = rival;
            window.isInCombat = true;
            window.takeTurn(rival);
            await new Promise(r => setTimeout(r, 600));
            return { plainEnemyHp: plainEnemy.hp };
        });
        expect(result.plainEnemyHp).toBe(200); // untouched — no opponent without the scenario flag
    });
});
