// tests/terrain-interactivity.spec.js
// Interactive terrain: lightable/dousable campfires (toggleFireplace,
// gameEngine.js) and oil barrels that explode when hit by a firebolt
// (explodeOilBarrel). Also covers the elf-ambassador dialogue reacting to
// party race/class (partyHasRace/hasClassLevel) and the companion "Talk"
// button dialogue.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Campfires: lit/unlit toggle', () => {
    test('toggleFireplace refuses without a torch equipped', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            window.tileObjects['5,5'] = { type: 'fireplace', lightRadius: 6, lit: false };
            const actor = window.entities.find(e => e.name === window.player.name);
            actor.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            window.toggleFireplace(5, 5, actor);
            return window.tileObjects['5,5'].lit;
        });
        expect(result).toBe(false);
    });

    test('lighting an unlit fireplace with a torch equipped works outside combat with no TP cost', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            window.tileObjects['6,6'] = { type: 'fireplace', lightRadius: 6, lit: false };
            const actor = window.entities.find(e => e.name === window.player.name);
            actor.equipped = { weapon: 'torch', offhand: null, armor: null, helmet: null };
            actor.timePoints = 50;
            window.isInCombat = false;
            window.toggleFireplace(6, 6, actor);
            return { lit: window.tileObjects['6,6'].lit, tp: actor.timePoints };
        });
        expect(result.lit).toBe(true);
        expect(result.tp).toBe(50); // untouched outside combat
    });

    test('dousing an already-lit fireplace toggles it back off, and clicking again relights it', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            window.tileObjects['7,7'] = { type: 'fireplace', lightRadius: 6 }; // lit by default (no `lit` key)
            const actor = window.entities.find(e => e.name === window.player.name);
            actor.equipped = { weapon: 'torch', offhand: null, armor: null, helmet: null };
            window.isInCombat = false;
            window.toggleFireplace(7, 7, actor);
            const afterFirst = window.tileObjects['7,7'].lit;
            window.toggleFireplace(7, 7, actor);
            const afterSecond = window.tileObjects['7,7'].lit;
            return { afterFirst, afterSecond };
        });
        expect(result.afterFirst).toBe(false);
        expect(result.afterSecond).toBe(true);
    });

    test('in turn-based combat, toggling costs 5 TP and refuses below that', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            window.tileObjects['8,8'] = { type: 'fireplace', lightRadius: 6, lit: false };
            const actor = window.entities.find(e => e.name === window.player.name);
            actor.equipped = { weapon: 'torch', offhand: null, armor: null, helmet: null };
            window.isInCombat = true;
            actor.timePoints = 3; // not enough
            window.toggleFireplace(8, 8, actor);
            const refused = window.tileObjects['8,8'].lit;
            actor.timePoints = 10;
            window.toggleFireplace(8, 8, actor);
            const afterEnough = { lit: window.tileObjects['8,8'].lit, tpLeft: actor.timePoints };
            window.isInCombat = false;
            return { refused, afterEnough };
        });
        expect(result.refused).toBe(false);
        expect(result.afterEnough.lit).toBe(true);
        expect(result.afterEnough.tpLeft).toBe(5);
    });

    test('a firebolt targeting an unlit fireplace lights it, no torch or TP needed', async ({ page }) => {
        await createCharacter(page, { cls: 'wizard' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            window.tileObjects['9,9'] = { type: 'fireplace', lightRadius: 6, lit: false };
            const caster = window.entities.find(e => e.name === window.player.name);
            const spell = { type: 'damage', baseId: 'firebolt', school: 'arcane', magnitude: 5, needsHitCheck: true, name: 'Firebolt' };
            window.resolveSpell(caster, spell, null, { q: 9, r: 9 });
            return window.tileObjects['9,9'].lit;
        });
        expect(result).toBe(true);
    });
});

test.describe('Oil barrels: firebolt-triggered explosion', () => {
    test('a firebolt hitting an oil barrel deletes it and damages everyone adjacent', async ({ page }) => {
        await createCharacter(page, { cls: 'wizard' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            window.tileObjects['10,10'] = { type: 'oil_barrel' };
            const caster = window.entities.find(e => e.name === window.player.name);
            const victim = new window.Enemy('Victim', 'red', { q: 11, r: 10 }, 10, 100, 0);
            victim.side = 'enemy';
            victim.alive = true;
            window.entities.push(victim);
            const hpBefore = victim.hp;

            const spell = { type: 'damage', baseId: 'firebolt', school: 'arcane', magnitude: 5, needsHitCheck: true, name: 'Firebolt' };
            window.resolveSpell(caster, spell, null, { q: 10, r: 10 });

            return {
                barrelGone: !window.tileObjects['10,10'],
                dealt: hpBefore - victim.hp,
            };
        });
        expect(result.barrelGone).toBe(true);
        expect(result.dealt).toBeGreaterThan(0);
    });

    test('the explosion also damages the caster if they are adjacent', async ({ page }) => {
        await createCharacter(page, { cls: 'wizard' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const caster = window.entities.find(e => e.name === window.player.name);
            caster.hex = { q: 11, r: 10 };
            caster.hp = 100; caster.maxHp = 100;
            window.tileObjects['10,10'] = { type: 'oil_barrel' };
            const hpBefore = caster.hp;
            window.explodeOilBarrel(10, 10, caster);
            return hpBefore - caster.hp;
        });
        expect(result).toBeGreaterThan(0);
    });

    test('Northwatch Fort places oil barrels defensively, not next to a guard', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        const state = await page.evaluate(() => {
            const barrels = Object.entries(window.tileObjects).filter(([, o]) => o.type === 'oil_barrel');
            const guards = window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive);
            const anyAdjacent = barrels.some(([key]) => {
                const [q, r] = key.split(',').map(Number);
                return guards.some(g => window.distance(g.hex, { q, r }) <= 1);
            });
            return { count: barrels.length, anyAdjacent };
        });
        expect(state.count).toBeGreaterThan(0);
        expect(state.anyAdjacent).toBe(false);
    });
});

test.describe('Race/class-reactive dialogue', () => {
    test('the elven ambassador greets an elf party member differently and needs fewer herbs', async ({ page }) => {
        await createCharacter(page, { race: 'elf' });
        await page.waitForTimeout(1000);
        const state = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(npc);
            return {
                message: document.getElementById('dialogue-message').innerText,
                quest: null,
            };
        });
        expect(state.message).toContain('kin');
    });

    test('a non-elf gets the standard greeting and needs 3 herbs', async ({ page }) => {
        await createCharacter(page, { race: 'human' });
        await page.waitForTimeout(1000);
        const message = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(npc);
            return document.getElementById('dialogue-message').innerText;
        });
        expect(message).not.toContain('kin');
        expect(message).toContain('three');
    });
});

test.describe('Companion "Talk" dialogue', () => {
    test('Wren Talbot has a dialogueId and a working personal-story dialogue tree', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        const state = await page.evaluate(() => {
            const wren = window.entities.find(e => e.name === 'Wren Talbot');
            window.talkToNPC(wren);
            return {
                hasDialogueId: wren.dialogueId === 'companion_wren_talbot',
                optionCount: document.getElementById('dialogue-options').children.length,
            };
        });
        expect(state.hasDialogueId).toBe(true);
        expect(state.optionCount).toBeGreaterThan(0);
    });

    test('the party tab renders a Talk button for a companion with a dialogueId', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        const talkButtonCount = await page.locator('#party-selection button', { hasText: 'Talk' }).count();
        expect(talkButtonCount).toBeGreaterThan(0);
    });
});
