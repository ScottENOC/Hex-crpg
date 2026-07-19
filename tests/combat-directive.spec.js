// tests/combat-directive.spec.js
// entity.combatDirective (constraints/priorities/contingencies — see the
// plan's "Layered combat AI" section) is opt-in and additive: an entity
// without one takes the exact same aiProcess/targetPriorityCompare path as
// before it existed. These tests drive the three wiring points directly.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('layered combat AI: combatDirective', () => {
    test('priorities: a target near the directive-designated hex outranks a merely-closer one', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const entity = { combatDirective: { priorities: [{ type: 'nearHex', hex: { q: 20, r: 20 }, radius: 3 }] } };
            const nearGateTarget = { hex: { q: 20, r: 21 }, unconscious: false };   // far from entity, but near the gate hex
            const closerTarget = { hex: { q: 1, r: 0 }, unconscious: false };        // much closer to entity, not near the gate
            const cmp = window.targetPriorityCompare(entity, nearGateTarget, closerTarget, false);
            return { cmp };
        });
        expect(result.cmp).toBeLessThan(0); // nearGateTarget sorts first
    });

    test('an entity with no combatDirective falls through to the original distance-based comparator unchanged', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const entity = { hex: { q: 0, r: 0 }, getAllHexes() { return [this.hex]; } }; // no combatDirective at all
            const far = { hex: { q: 20, r: 20 }, unconscious: false, getAllHexes() { return [this.hex]; } };
            const near = { hex: { q: 1, r: 0 }, unconscious: false, getAllHexes() { return [this.hex]; } };
            const cmp = window.targetPriorityCompare(entity, near, far, false);
            return { cmp };
        });
        expect(result.cmp).toBeLessThan(0); // nearest still wins, exactly as before
    });

    test('constraint: a defender never steps outside its allowed area chasing a target beyond it', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const allowed = new Set(['0,0', '1,0', '-1,0', '0,1', '0,-1', '1,-1', '-1,1']);
            const defender = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy');
            defender.combatDirective = { constraints: { stayWithinHexes: allowed } };
            defender.aiState = 'combat';
            defender.timePoints = 100;
            const farTarget = window.createMonster('goblin', { q: 10, r: 0 }, null, null, 'player');
            farTarget.timePoints = 100;
            window.entities = [defender, farTarget];
            window.currentTurnEntity = defender;
            window.isInCombat = true;
            window.takeTurn(defender);
            await new Promise(r => setTimeout(r, 600));
            return { finalHexKey: `${defender.hex.q},${defender.hex.r}`, stillInBounds: allowed.has(`${defender.hex.q},${defender.hex.r}`) };
        });
        expect(result.stillInBounds).toBe(true);
    });

    test('contingency: retreat mode triggers once the hostile count inside the guarded area is reached, and redirects movement', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const guardedArea = new Set(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '-1,0']);
            const defender = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'enemy');
            defender.aiState = 'combat';
            defender.timePoints = 100;
            defender.combatDirective = {
                constraints: { stayWithinHexes: guardedArea },
                retreatTo: { q: -1, r: 0 },
                contingencies: [{
                    id: 'retreat_if_overrun',
                    when: (e) => window.entities.filter(en => en.alive && en.side === 'player' && guardedArea.has(`${en.hex.q},${en.hex.r}`)).length >= 5,
                }],
            };
            // Nearest hostile at q=2 — not adjacent to the defender's q=0
            // start, so this exercises the "nothing on top of me yet, just
            // fall back" path distinctly from the fighting-withdrawal path
            // (an adjacent opponent instead makes it stand and fight this
            // turn, covered by the northwatch-defenders.spec.js suite).
            const hostiles = [2, 3, 4, 5, 6].map(i => {
                const h = window.createMonster('goblin', { q: i, r: 0 }, null, null, 'player');
                h.timePoints = 100;
                return h;
            });
            window.entities = [defender, ...hostiles];
            window.currentTurnEntity = defender;
            window.isInCombat = true;
            window.takeTurn(defender);
            await new Promise(r => setTimeout(r, 600));
            return { mode: defender.combatDirective.mode, hexKey: `${defender.hex.q},${defender.hex.r}` };
        });
        expect(result.mode).toBe('retreat');
        expect(result.hexKey).toBe('-1,0'); // stepped toward retreatTo instead of engaging
    });

    test('hostileToPlayer is independent of hostileTo: a directed neutral ignores the player until flipped, then targets them like any other opponent', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const defender = window.createMonster('goblin', { q: 0, r: 0 }, null, null, 'neutral');
            defender.aiState = 'combat';
            defender.timePoints = 100;
            defender.combatDirective = { hostileTo: 'enemy', hostileToPlayer: false };
            const playerEntity = window.entities.find(e => e.side === 'player' && !e.rider);
            playerEntity.hex = { q: 1, r: 0 }; // adjacent
            window.entities = [defender, playerEntity];
            window.currentTurnEntity = defender;
            window.isInCombat = true;

            window.takeTurn(defender);
            await new Promise(r => setTimeout(r, 600));
            const targetedPlayerWhileFlagOff = defender.lastSeenTargetHex?.q === playerEntity.hex.q && defender.lastSeenTargetHex?.r === playerEntity.hex.r;

            defender.combatDirective.hostileToPlayer = true;
            defender.timePoints = 100;
            window.currentTurnEntity = defender;
            window.takeTurn(defender);
            await new Promise(r => setTimeout(r, 600));
            const targetedPlayerWhileFlagOn = defender.lastSeenTargetHex?.q === playerEntity.hex.q && defender.lastSeenTargetHex?.r === playerEntity.hex.r;

            return { targetedPlayerWhileFlagOff, targetedPlayerWhileFlagOn };
        });
        expect(result.targetedPlayerWhileFlagOff).toBe(false);
        expect(result.targetedPlayerWhileFlagOn).toBe(true);
    });
});
