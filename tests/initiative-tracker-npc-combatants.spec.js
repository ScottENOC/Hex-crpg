// updateTurnIndicator (ui.js) deliberately excludes any entity with
// isNPC:true, so background flavor NPCs don't clutter the tracker — every
// scripted world NPC is built via buildNPC (npcBuilder.js), which always
// sets isNPC:true. A handful of scripted encounters (Oskar's duel,
// Northwatch's defenders, arena bosses...) already flip isNPC back to false
// by hand once the fight actually starts. A plain hostile spawn with no such
// script (e.g. Nix the Cutpurse, the Silverhart Commons bounty target) never
// got that treatment and silently never showed in the tracker despite
// fighting — fixed generically in wakeUp() (gameEngine.js), which now clears
// isNPC for whichever entity's own wakeUp() call enters combat.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('any entity that actually enters combat shows in the initiative tracker', () => {
    test('a plain buildNPC-built hostile (Nix the Cutpurse) has isNPC cleared once it wakes into combat', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const nix = window.entities.find(e => e.name === 'Nix the Cutpurse');
            const before = nix.isNPC;
            window.wakeUp(nix);
            return { before, after: nix.isNPC, aiState: nix.aiState };
        });
        expect(result.before).toBe(true);
        expect(result.after).toBe(false);
        expect(result.aiState).toBe('combat');
    });

    test('a woken combatant with hasBeenSeenByPlayer passes the initiative-tracker filter', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const goblin = window.createMonster('goblin', { q: 5, r: 5 }, null, null, 'enemy');
            goblin.isNPC = true; // simulate a buildNPC-built hostile, not createMonster's own default
            window.entities.push(goblin);
            window.wakeUp(goblin);
            goblin.hasBeenSeenByPlayer = true;
            const passesFilter = goblin.alive && (goblin.side === 'player' || goblin.hasBeenSeenByPlayer) && !goblin.rider && !goblin.isNPC;
            return { passesFilter, isNPC: goblin.isNPC };
        });
        expect(result.isNPC).toBe(false);
        expect(result.passesFilter).toBe(true);
    });
});
