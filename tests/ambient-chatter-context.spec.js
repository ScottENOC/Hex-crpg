const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => window.AmbientChatterContext?.installed, null, { timeout: 10000 });
}

test.describe('ambient chatter context', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('uses real player visibility as the chatter audibility gate', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.AmbientChatterContext;
            const npc = { hex: { q: 4, r: 4 } };
            const original = window.isVisibleToPlayer;
            window.isVisibleToPlayer = () => false;
            const blocked = api.canPlayerHearNpc(npc);
            window.isVisibleToPlayer = () => true;
            const visible = api.canPlayerHearNpc(npc);
            window.isVisibleToPlayer = original;
            return { blocked, visible };
        });
        expect(result.blocked).toBe(false);
        expect(result.visible).toBe(true);
    });

    test('active incidents suppress smalltalk and release into a bounded aftermath', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.AmbientChatterContext;
            api.resetForTests();
            api.beginIncident('__context_test');
            const during = api.shouldSuppress();
            api.endIncident('__context_test', {
                postSilenceSeconds: 0,
                aftermathSeconds: 60,
                mentions: 2,
            });
            const after = api.shouldSuppress();
            const fresh = api.freshIncidentForPlayer();
            api.clearIncident('__context_test');
            return { during, after, mentionsLeft: fresh?.mentionsLeft ?? null };
        });
        expect(result.during).toBe(true);
        expect(result.after).toBe(false);
        expect(result.mentionsLeft).toBe(2);
    });

    test('registers distinct fresh Hollowmere fight and peaceful aftermath beats', async ({ page }) => {
        const topics = await page.evaluate(() =>
            (window.AmbientChatterV2?.exchanges || [])
                .filter(ex => String(ex.id || '').startsWith('ambient_context_hollowmere_'))
                .map(ex => ex.topic)
        );
        expect(topics.filter(t => t.includes(':fight:')).length).toBe(4);
        expect(topics.filter(t => t.includes(':peace:')).length).toBe(4);
        expect(new Set(topics).size).toBe(8);
    });
});
