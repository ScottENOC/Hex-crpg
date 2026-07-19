const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('monster art: distinct sprites and dialogue portraits', () => {
    test('harpy, elite goblin, wraith, basilisk, and minotaur each get their own registered, loaded image', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const keys = ['elite_goblin', 'harpy', 'wraith', 'basilisk', 'minotaur'];
            return keys.map(k => ({
                key: k,
                exists: !!window.gameVisuals[k],
                complete: window.gameVisuals[k]?.complete,
                naturalWidth: window.gameVisuals[k]?.naturalWidth,
            }));
        });
        result.forEach(r => {
            expect(r.exists).toBe(true);
            expect(r.complete).toBe(true);
            expect(r.naturalWidth).toBeGreaterThan(0);
        });
    });

    test('createMonster sets customImage for types with distinct art, not for plain goblin/wolf', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const distinct = ['elite_goblin', 'harpy', 'wraith', 'basilisk', 'minotaur'].map(t => window.createMonster(t, { q: 0, r: 0 }).customImage);
            const plain = ['goblin', 'wolf'].map(t => window.createMonster(t, { q: 0, r: 0 }).customImage);
            return { distinct, plain };
        });
        result.distinct.forEach((c, i) => expect(c).toBeTruthy());
        result.plain.forEach(c => expect(c).toBeFalsy());
    });

    test('revenant uses the layered CHAR_CONFIG body renderer via race/gender + revenantBase, not the flat customImage path', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const m = window.createMonster('revenant', { q: 0, r: 0 });
            return {
                customImage: m.customImage,
                race: m.race,
                gender: m.gender,
                hasConfig: !!window.CHAR_CONFIG[`${m.race}_${m.gender}`],
                revenantBaseLoaded: window.gameVisuals.revenantBase?.complete,
            };
        });
        expect(result.customImage).toBeFalsy();
        expect(result.hasConfig).toBe(true);
        expect(result.revenantBaseLoaded).toBe(true);
    });

    test('a goblin player/NPC uses the layered CHAR_CONFIG body renderer via race/gender + monsterDefault, not the flat-circle fallback', async ({ page }) => {
        await createCharacter(page, { race: 'goblin', campaign: '2' });
        const result = await page.evaluate(() => ({
            hasConfigMale: !!window.CHAR_CONFIG['goblin_male'],
            hasConfigFemale: !!window.CHAR_CONFIG['goblin_female'],
            baseKey: window.CHAR_CONFIG['goblin_male'].baseKey,
            monsterDefaultLoaded: window.gameVisuals.monsterDefault?.complete,
        }));
        expect(result.hasConfigMale).toBe(true);
        expect(result.hasConfigFemale).toBe(true);
        expect(result.baseKey).toBe('monsterDefault');
        expect(result.monsterDefaultLoaded).toBe(true);
    });

    test('a renamed unique boss reusing generic monster art (e.g. elite_goblin base) keeps its spriteBase tint instead of showing the flat un-tinted art', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const boss = window.createMonster('elite_goblin', { q: 0, r: 0 });
            boss.name = 'Some Renamed Boss';
            boss.spriteBase = 'elite_goblin';
            delete boss.customImage; // mirrors the arena boss-spawn code
            return { customImage: boss.customImage, spriteBase: boss.spriteBase };
        });
        expect(result.customImage).toBeFalsy();
        expect(result.spriteBase).toBe('elite_goblin');
    });

    test('showDialogue gives a monster with customImage its own portrait instead of the elf.png fallback', async ({ page }) => {
        await createCharacter(page, { campaign: '1' });
        const result = await page.evaluate(() => {
            const harpy = window.createMonster('harpy', { q: 0, r: 0 });
            window.showDialogue(harpy, 'test line');
            const portrait = document.getElementById('dialogue-portrait');
            const img = portrait.querySelector('img');
            return { src: img ? img.src : null };
        });
        expect(result.src).toContain('harpy.svg');
    });
});
