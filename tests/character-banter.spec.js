// tests/character-banter.spec.js
// Ambient personality lines (characterBanter.js): condition-gated barks,
// multi-line staggered exchanges between characters, once-only guards, and
// cooldowns.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('character banter', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    async function isolateAldricBanter(page) {
        await page.evaluate(() => {
            // Character creation can already satisfy Wren's earlier tavern
            // nostalgia bark. checkCharacterBanter intentionally emits only
            // one eligible bark per check, so consume unrelated earlier
            // content when a test specifically targets the Aldric exchange.
            window.firedBanterIds['wren_tavern_nostalgia'] = true;
        });
    }

    test('a multi-line exchange between two party members plays as a staggered back-and-forth', async ({ page }) => {
        await isolateAldricBanter(page);
        await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.characterBanterAccum = 999;
            window.checkCharacterBanter(0);
        });
        await page.waitForTimeout(6000); // 3 lines, 2.5s apart
        const log = await page.evaluate(() => Array.from(document.querySelectorAll('#message-log > div')).map(d => d.innerText));
        const wrenLine = log.find(l => l.includes('a real paladin'));
        const aldricLine = log.find(l => l.includes('go sideways'));
        const wrenReply = log.find(l => l.includes("can't hurt"));
        expect(wrenLine).toBeTruthy();
        expect(aldricLine).toBeTruthy();
        expect(wrenReply).toBeTruthy();
        // Order preserved: Wren, then Aldric, then Wren again.
        expect(log.indexOf(wrenLine)).toBeLessThan(log.indexOf(aldricLine));
        expect(log.indexOf(aldricLine)).toBeLessThan(log.indexOf(wrenReply));
    });

    test('a "once" bark never fires twice, even if its condition stays true', async ({ page }) => {
        await isolateAldricBanter(page);
        const result = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.characterBanterAccum = 999;
            window.checkCharacterBanter(0);
            const countAfterFirst = document.querySelectorAll('#message-log > div').length;
            window.characterBanterAccum = 999;
            window.checkCharacterBanter(0);
            const countAfterSecond = document.querySelectorAll('#message-log > div').length;
            return { countAfterFirst, countAfterSecond, fired: window.firedBanterIds['wren_aldric_banter_faith'] };
        });
        expect(result.fired).toBe(true);
        expect(result.countAfterSecond).toBe(result.countAfterFirst); // nothing new added on the second check
    });

    test('a bark whose condition is false never fires', async ({ page }) => {
        const fired = await page.evaluate(() => {
            // Ser Aldric isn't recruited in this test, so the two-party-member banter's condition is false.
            window.characterBanterAccum = 999;
            window.checkCharacterBanter(0);
            return window.firedBanterIds['wren_aldric_banter_faith'];
        });
        expect(fired).toBeFalsy();
    });

    test('the accumulator gates checks to roughly every 5 seconds, not every call', async ({ page }) => {
        await isolateAldricBanter(page);
        const result = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.characterBanterAccum = 0;
            window.checkCharacterBanter(1); // under the 5s threshold
            const firedTooSoon = window.firedBanterIds['wren_aldric_banter_faith'];
            window.checkCharacterBanter(10); // now well over threshold (1 + 10 = 11s accumulated)
            const firedOnceEnough = window.firedBanterIds['wren_aldric_banter_faith'];
            return { firedTooSoon, firedOnceEnough };
        });
        expect(result.firedTooSoon).toBeFalsy();
        expect(result.firedOnceEnough).toBe(true);
    });

    test('legacy and canonical Aldric approval keys stay synchronised', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.companionAttitude['Ser Aldric Thorne'] = 73;
            const legacyReadsCanonical = window.companionAttitude['Ser Aldric'];
            window.companionAttitude['Ser Aldric'] = 61;
            const canonicalReadsLegacyWrite = window.companionAttitude['Ser Aldric Thorne'];
            return { legacyReadsCanonical, canonicalReadsLegacyWrite };
        });
        expect(result.legacyReadsCanonical).toBe(73);
        expect(result.canonicalReadsLegacyWrite).toBe(61);
    });

    test('firedBanterIds persists through save/load', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.firedBanterIds['some_test_bark'] = true;
            window.saveGame('banter_test_save');
            window.firedBanterIds = {};
            window.loadGame('banter_test_save');
            return window.firedBanterIds['some_test_bark'];
        });
        expect(result).toBe(true);
    });
});
