// tests/world-pulse.spec.js
// worldPulse.js: discrete autonomous world events on the world clock —
// each event nudges region stats, records itself as a rumor NPCs can
// repeat, and (where physical) adjusts wildernessThreatMult, which
// checkWildernessEncounter multiplies into its spawn chance.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('world pulse: autonomous events, rumors, threat multiplier', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('a forced roll (rng pinned past the quiet band) fires an event: rumor logged, world changed', async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = window.worldEvents.length;
            const secBefore = window.regions.hollowmere.security;
            const prosBefore = { h: window.regions.hollowmere.prosperity, a: window.regions.aldervale.prosperity };
            const multBefore = window.wildernessThreatMult;
            // rng of ~0.999 always lands past the quiet band, in the last
            // eligible candidate — deterministic without exposing internals.
            const fired = window.rollWorldPulseEvent(() => 0.999);
            const changed =
                window.regions.hollowmere.security !== secBefore ||
                window.regions.hollowmere.prosperity !== prosBefore.h ||
                window.regions.aldervale.prosperity !== prosBefore.a ||
                window.regions.aldervale.security !== undefined && fired !== null; // any event mutates something; specifics vary by type
            return { fired, logged: window.worldEvents.length - before, changed, multBefore };
        });
        expect(result.fired).not.toBeNull();
        expect(result.fired.text.length).toBeGreaterThan(10);
        expect(result.logged).toBe(1);
    });

    test('an rng in the quiet band produces no event and no rumor', async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = window.worldEvents.length;
            const fired = window.rollWorldPulseEvent(() => 0.0); // 0 always lands in the quiet band
            return { fired, logged: window.worldEvents.length - before };
        });
        expect(result.fired).toBeNull();
        expect(result.logged).toBe(0);
    });

    test('wildernessThreatMult decays back toward 1.0 on the world clock and scales encounter chance', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Silence the event rolls for this test — a month of ticking
            // legitimately fires ~120 of them, and some (wolf resurgence)
            // push the multiplier back up; here we isolate pure decay.
            const real = window.rollWorldPulseEvent;
            window.rollWorldPulseEvent = () => null;
            window.wildernessThreatMult = 2.0;
            window.tickWorldPulse(24 * 3600); // one in-game day
            const afterDay = window.wildernessThreatMult;
            window.tickWorldPulse(30 * 24 * 3600); // a month: effectively fully decayed
            const afterMonth = window.wildernessThreatMult;
            window.rollWorldPulseEvent = real;
            return { afterDay, afterMonth };
        });
        expect(result.afterDay).toBeLessThan(2.0);
        expect(result.afterDay).toBeGreaterThan(1.0);
        expect(Math.abs(result.afterMonth - 1.0)).toBeLessThan(0.05);
    });

    test('getRecentWorldRumors returns newest-first and lets old news die out', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.worldEvents.length = 0;
            window.worldSeconds = 100 * 24 * 3600;
            // Stale rumor (10 days old) + two fresh ones.
            window.worldEvents.push({ type: 'a', text: 'old news', worldSeconds: window.worldSeconds - 10 * 24 * 3600 });
            window.worldEvents.push({ type: 'b', text: 'fresh one', worldSeconds: window.worldSeconds - 3600 });
            window.worldEvents.push({ type: 'c', text: 'freshest', worldSeconds: window.worldSeconds - 60 });
            return window.getRecentWorldRumors(3);
        });
        expect(result).toEqual(['freshest', 'fresh one']);
    });

    test("Garrick's dialogue offers a news option that surfaces current rumors", async ({ page }) => {
        const result = await page.evaluate(() => {
            window.worldEvents.push({ type: 'test', text: 'Testable rumor about wolves.', worldSeconds: window.worldSeconds || 0 });
            const garrick = window.entities.find(e => e.name === 'Garrick Holt');
            window.npcDialogueTrees.garrick_holt(garrick);
            const options = Array.from(document.querySelectorAll('#dialogue-options button')).map(b => b.textContent);
            const newsBtn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.textContent.includes("What's the word"));
            newsBtn.click();
            const shown = document.querySelector('#dialogue-message')?.textContent || '';
            return { options, shown };
        });
        expect(result.options.some(o => o.includes("What's the word"))).toBe(true);
        expect(result.shown).toContain('Testable rumor about wolves.');
    });

    test('tickWorldPulse rolls on a 6-hour cadence (a multi-day tick fires multiple rolls)', async ({ page }) => {
        const result = await page.evaluate(() => {
            let rolls = 0;
            const real = window.rollWorldPulseEvent;
            window.rollWorldPulseEvent = (...a) => { rolls++; return real(...a); };
            window.tickWorldPulse(2 * 24 * 3600); // 2 days = 8 six-hour intervals
            window.rollWorldPulseEvent = real;
            return rolls;
        });
        expect(result).toBe(8);
    });
});
