const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('reaction requests never wait on a dead/unconscious reactor', () => {
    test('requestReaction auto-resolves immediately (no modal) if the reactor is already dead', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.name === window.party[0].name);
            player.alive = false;
            let called = false, callbackArg = 'unset';
            window.requestReaction(player, [{ id: 'parry', name: 'Parry', tpCost: 3 }], (choice) => { called = true; callbackArg = choice; });
            player.alive = true; // restore for cleanliness
            return { called, callbackArg, modalOpen: document.getElementById('reaction-modal').style.display === 'block', isPausedForReaction: window.isPausedForReaction };
        });
        expect(result.called).toBe(true);
        expect(result.callbackArg).toBe(null);
        expect(result.modalOpen).toBe(false);
        expect(result.isPausedForReaction).toBe(false);
    });

    test('requestReaction auto-resolves immediately if the reactor is unconscious', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.name === window.party[0].name);
            player.unconscious = true;
            let called = false;
            window.requestReaction(player, [{ id: 'parry', name: 'Parry', tpCost: 3 }], () => { called = true; });
            player.unconscious = false;
            return { called, modalOpen: document.getElementById('reaction-modal').style.display === 'block' };
        });
        expect(result.called).toBe(true);
        expect(result.modalOpen).toBe(false);
    });

    test('a reactor who dies while the modal is genuinely open gets detected within ~300ms, not the 4s generic watchdog', async ({ page }) => {
        await createCharacter(page);
        const start = await page.evaluate(() => {
            const player = window.entities.find(e => e.name === window.party[0].name);
            window._reactionResolved = null;
            window.requestReaction(player, [{ id: 'parry', name: 'Parry', tpCost: 3 }], (choice) => { window._reactionResolved = choice; });
            const modalOpenNow = document.getElementById('reaction-modal').style.display === 'block';
            // Kill the reactor AFTER the modal is already open, simulating a death that occurs during the wait.
            player.alive = false;
            return { modalOpenNow };
        });
        expect(start.modalOpenNow).toBe(true);
        await page.waitForTimeout(700); // well under the 4s generic watchdog
        const after = await page.evaluate(() => ({
            resolved: window._reactionResolved,
            modalOpen: document.getElementById('reaction-modal').style.display === 'block',
            isPausedForReaction: window.isPausedForReaction,
        }));
        expect(after.resolved).toBe(null);
        expect(after.modalOpen).toBe(false);
        expect(after.isPausedForReaction).toBe(false);
    });
});
