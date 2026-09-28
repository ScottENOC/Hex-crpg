const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.ProactiveQuestGivers, null, { timeout: 10000 });
}

test.describe('proactive quest giver timing', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('rumour-driven approaches wait a minute', async ({ page }) => {
        const lingerMs = await page.evaluate(() => window.ProactiveQuestGivers.constants.PUBLIC_LINGER_MS);
        expect(lingerMs).toBe(60_000);
    });

    test('a visible helpful quest giver can qualify immediately', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.ProactiveQuestGivers;
            api.reset();
            const player = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
            const crossroads = window.campaign2Landmarks.crossroads;
            player.hex = { q: crossroads.q, r: crossroads.r };
            player.destination = null;

            const visible = {
                id: 'timing:visible', name: 'Visible Giver', alive: true, isNPC: true,
                side: 'neutral', dialogueId: '__timing_visible', proactiveQuestGiver: true,
                reputation: { standing: 20, knowledge: 20 }, hex: { q: crossroads.q + 3, r: crossroads.r },
            };
            const hidden = {
                id: 'timing:hidden', name: 'Hidden Giver', alive: true, isNPC: true,
                side: 'neutral', dialogueId: '__timing_hidden', proactiveQuestGiver: true,
                reputation: { standing: 20, knowledge: 20 }, hex: { q: crossroads.q + 4, r: crossroads.r },
            };

            const originalVisible = window.isVisibleToPlayer;
            window.isVisibleToPlayer = hex => hex.q === visible.hex.q && hex.r === visible.hex.r;
            const immediate = api.chooseApproacher([hidden, visible], player, performance.now(), false);
            const hiddenBeforeRumour = api.chooseApproacher([hidden], player, performance.now(), false);
            const hiddenAfterRumour = api.chooseApproacher([hidden], player, performance.now(), true);
            window.isVisibleToPlayer = originalVisible;
            api.reset();

            return {
                immediate: immediate?.id || null,
                hiddenBeforeRumour: hiddenBeforeRumour?.id || null,
                hiddenAfterRumour: hiddenAfterRumour?.id || null,
            };
        });

        expect(result.immediate).toBe('timing:visible');
        expect(result.hiddenBeforeRumour).toBeNull();
        expect(result.hiddenAfterRumour).toBe('timing:hidden');
    });
});
