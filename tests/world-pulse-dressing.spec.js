// tests/world-pulse-dressing.spec.js
// Living-world roadmap items A3-A5: Elder Marta's daily schedule, rumor
// surfaces beyond Garrick (Corran Vale / the Reddale innkeeper filtered by
// region), and applyRegionDressing (beggar/peddler + Garrick's wary
// greeting reacting to Hollowmere's actual security/prosperity numbers).
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('A3: Elder Marta daily schedule', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('Elder Marta is home at night and out during the day', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Push the party far away so the schedule's "unobserved" branch
            // snaps Marta directly to her scheduled hex instead of just
            // setting a destination for the (unrun) real-time movement loop
            // to walk toward — see isDormantAmbientNpc/updateNpcSchedules.
            window.entities.filter(e => e.side === 'player').forEach(p => { p.hex = { q: 500, r: 500 }; });
            const dayS = 24 * 3600;
            window.worldSeconds = 2 * dayS + 3 * 3600; // 03:00
            window.updateNpcSchedules();
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            const nightPos = { q: marta.hex.q, r: marta.hex.r };

            window.worldSeconds = 2 * dayS + 12 * 3600; // 12:00
            window.updateNpcSchedules();
            const dayPos = { q: marta.hex.q, r: marta.hex.r };
            return { nightPos, dayPos };
        });
        expect(result.nightPos).toEqual({ q: 0, r: -12 });
        expect(result.dayPos).not.toEqual({ q: 0, r: -12 });
    });
});

test.describe('A4: rumor surfaces beyond Garrick', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test("Corran Vale's news option only repeats emberlode-tagged rumors", async ({ page }) => {
        const result = await page.evaluate(() => {
            window.worldEvents.push({ type: 'mine_trouble', text: 'Emberlode ore rumor.', regionId: 'emberlode', worldSeconds: window.worldSeconds || 0 });
            window.worldEvents.push({ type: 'wolf_resurgence', text: 'Hollowmere wolf rumor.', regionId: 'hollowmere', worldSeconds: window.worldSeconds || 0 });
            return window.getRecentWorldRumors(5, 'emberlode');
        });
        expect(result).toContain('Emberlode ore rumor.');
        expect(result).not.toContain('Hollowmere wolf rumor.');
    });

    test("the Reddale innkeeper's news option surfaces hollowmere-tagged rumors", async ({ page }) => {
        const result = await page.evaluate(() => {
            window.worldEvents.push({ type: 'patrol_sweep', text: 'Silverhart riders swept the roads.', regionId: 'hollowmere', worldSeconds: window.worldSeconds || 0 });
            const innkeeper = window.entities.find(e => e.dialogueId === 'reddale_innkeeper') ||
                { name: 'Nella Brook', dialogueId: 'reddale_innkeeper' };
            window.npcDialogueTrees.reddale_innkeeper(innkeeper);
            const newsBtn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.textContent.includes('Hollowmere way'));
            newsBtn.click();
            return document.querySelector('#dialogue-message')?.textContent || '';
        });
        expect(result).toContain('Silverhart riders swept the roads.');
    });
});

test.describe('A5: region-state visible in the village', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('low prosperity spawns a beggar and high prosperity spawns a peddler, mutually exclusive', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.regions.hollowmere.prosperity = 10;
            window.applyRegionDressing();
            const hasBeggarLow = !!window.entities.find(e => e.name === 'Weary Beggar');
            const hasPeddlerLow = !!window.entities.find(e => e.name === 'Traveling Peddler');

            window.regions.hollowmere.prosperity = 80;
            window.applyRegionDressing();
            const hasBeggarHigh = !!window.entities.find(e => e.name === 'Weary Beggar');
            const hasPeddlerHigh = !!window.entities.find(e => e.name === 'Traveling Peddler');

            window.regions.hollowmere.prosperity = 45;
            window.applyRegionDressing();
            const hasEitherMid = !!window.entities.find(e => e.name === 'Weary Beggar' || e.name === 'Traveling Peddler');

            return { hasBeggarLow, hasPeddlerLow, hasBeggarHigh, hasPeddlerHigh, hasEitherMid };
        });
        expect(result.hasBeggarLow).toBe(true);
        expect(result.hasPeddlerLow).toBe(false);
        expect(result.hasBeggarHigh).toBe(false);
        expect(result.hasPeddlerHigh).toBe(true);
        expect(result.hasEitherMid).toBe(false);
    });

    test("Garrick's greeting turns wary once Hollowmere security drops below 30", async ({ page }) => {
        const result = await page.evaluate(() => {
            const garrick = window.entities.find(e => e.name === 'Garrick Holt');
            window.regions.hollowmere.security = 60;
            window.npcDialogueTrees.garrick_holt(garrick);
            const safeText = document.querySelector('#dialogue-message')?.textContent || '';

            window.regions.hollowmere.security = 15;
            window.npcDialogueTrees.garrick_holt(garrick);
            const waryText = document.querySelector('#dialogue-message')?.textContent || '';

            return { safeText, waryText };
        });
        expect(result.waryText).toContain('mind the roads');
        expect(result.safeText).not.toContain('mind the roads');
    });
});
