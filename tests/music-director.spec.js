// tests/music-director.spec.js
// musicDirector.js: the adaptive layered-music decision logic. All of these
// exercise the pure context->weights surface (computeMusicContext /
// computeStemTargets / computeFactionDominance) — no actual .wav stems need
// to exist, which is also the shipping state until the audio assets land.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('music director: scene + state -> stem weights', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('near the village origin the scene is village; far out it is wilderness', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: 0, r: 2 };
            const near = window.computeMusicContext().scene;
            player.hex = { q: 80, r: 80 };
            const far = window.computeMusicContext().scene;
            return { near, far };
        });
        expect(result.near).toBe('village');
        expect(result.far).toBe('wilderness');
    });

    test('day/night stems crossfade with lightLevel, and combat raises the combat stem while ducking color layers', async ({ page }) => {
        const result = await page.evaluate(() => {
            const base = { scene: 'wilderness', inCombat: false, daylight: 1, threat: 1, security: 50, stealthed: false, enemiesVisible: false, factions: { crown: 0, guild: 0, church: 0, greenskin: 0, necro: 0 } };
            const day = window.computeStemTargets('wilderness', base);
            const night = window.computeStemTargets('wilderness', { ...base, daylight: 0 });
            const combat = window.computeStemTargets('wilderness', { ...base, inCombat: true });
            return { day, night, combat };
        });
        expect(result.day.wild_day).toBe(1);
        expect(result.day.wild_night).toBe(0);
        expect(result.night.wild_day).toBe(0);
        expect(result.night.wild_night).toBe(1);
        expect(result.day.wild_combat).toBe(0);
        expect(result.combat.wild_combat).toBe(1);
        expect(result.combat.wild_day).toBeLessThan(result.day.wild_day); // ducked, not just unchanged
        expect(result.combat.wild_base).toBe(1); // the bed never ducks
    });

    test('wilderness threat layer tracks wildernessThreatMult and the danger layer tracks visible enemies', async ({ page }) => {
        const result = await page.evaluate(() => {
            const base = { scene: 'wilderness', inCombat: false, daylight: 1, threat: 1, security: 50, stealthed: false, enemiesVisible: false, factions: {} };
            const calm = window.computeStemTargets('wilderness', base);
            const threatened = window.computeStemTargets('wilderness', { ...base, threat: 1.8 });
            const watched = window.computeStemTargets('wilderness', { ...base, enemiesVisible: true });
            return { calm, threatened, watched };
        });
        expect(result.calm.wild_threat).toBe(0);
        expect(result.threatened.wild_threat).toBeGreaterThan(0.5);
        expect(result.calm.wild_danger).toBe(0);
        expect(result.watched.wild_danger).toBeGreaterThan(0);
    });

    test('faction dominance: lichdom drags the town toward the necro layer and silences the church', async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = window.computeFactionDominance(null);
            window.playerIsLich = true;
            const after = window.computeFactionDominance(null);
            window.playerIsLich = false;
            return { before, after };
        });
        expect(result.before.necro).toBe(0);
        expect(result.after.necro).toBeGreaterThan(0.5);
        expect(result.after.church).toBe(0);
        expect(result.after.crown).toBeLessThan(result.before.crown);
    });

    test('a goblin alliance raises the greenskin layer', async ({ page }) => {
        const result = await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({ id: 'goblin_threat', resolution: 'goblin_alliance', status: 'completed' });
            const f = window.computeFactionDominance(null);
            window.questLog = window.questLog.filter(q => q.id !== 'goblin_threat');
            return f;
        });
        expect(result.greenskin).toBeGreaterThan(0.4);
    });

    test('proximity to a registered faction POI leans the mix toward that faction', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.musicPOIs.church = { q: 40, r: 40 };
            const atDoor = window.computeFactionDominance({ q: 40, r: 41 });
            const acrossTown = window.computeFactionDominance({ q: 40, r: 90 });
            delete window.musicPOIs.church;
            return { atDoor: atDoor.church, acrossTown: acrossTown.church };
        });
        expect(result.atDoor).toBeGreaterThan(result.acrossTown);
        expect(result.atDoor).toBeGreaterThan(0.5);
    });

    test('village unrest layer fades in as security collapses', async ({ page }) => {
        const result = await page.evaluate(() => {
            const base = { scene: 'village', inCombat: false, daylight: 1, threat: 1, security: 50, stealthed: false, enemiesVisible: false, factions: { crown: 0.35, guild: 0, church: 0, greenskin: 0, necro: 0 } };
            const safe = window.computeStemTargets('village', base);
            const collapsing = window.computeStemTargets('village', { ...base, security: 10 });
            return { safe: safe.town_unrest, collapsing: collapsing.town_unrest };
        });
        expect(result.safe).toBe(0);
        expect(result.collapsing).toBeGreaterThan(0.5);
    });

    test('tickMusicDirector runs without error even with zero stem files on disk', async ({ page }) => {
        const result = await page.evaluate(async () => {
            try {
                window.tickMusicDirector(true);
                await new Promise(r => setTimeout(r, 100));
                window.tickMusicDirector(true);
                return { ok: true };
            } catch (e) {
                return { ok: false, err: String(e) };
            }
        });
        expect(result.ok).toBe(true);
    });
});
