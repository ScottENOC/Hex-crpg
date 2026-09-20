const { test, expect } = require('@playwright/test');

test.describe('Playable orc and goblin appearance', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => typeof window.raceSkinToneFromSlider === 'function');
        await page.waitForFunction(() => window.getRecoloredSkinSprite?.__raceAwareSkinWrapper === true);
    });

    test('orc and goblin remain selectable playable races with player render configs', async ({ page }) => {
        const result = await page.evaluate(() => ({
            races: Array.from(document.querySelectorAll('#race-select option')).map(o => o.value),
            orcMale: !!window.CHAR_CONFIG?.orc_male,
            orcFemale: !!window.CHAR_CONFIG?.orc_female,
            goblinMale: !!window.CHAR_CONFIG?.goblin_male,
            goblinFemale: !!window.CHAR_CONFIG?.goblin_female,
            orcData: window.createCharacterData?.('orc', 'fighter', 'Test Orc', 'male'),
            goblinData: window.createCharacterData?.('goblin', 'rogue', 'Test Goblin', 'female'),
        }));
        expect(result.races).toEqual(expect.arrayContaining(['orc', 'goblin']));
        expect(result.orcMale && result.orcFemale && result.goblinMale && result.goblinFemale).toBe(true);
        expect(result.orcData.race).toBe('orc');
        expect(result.orcData.riderSize).toBe(3);
        expect(result.goblinData.race).toBe('goblin');
        expect(result.goblinData.riderSize).toBe(3);
    });

    test('natural skin slider switches from human tones to an orc grey-green-blue palette', async ({ page }) => {
        const tones = await page.evaluate(() => ({
            humanMid: window.raceSkinToneFromSlider('human', 50),
            orcStart: window.raceSkinToneFromSlider('orc', 0),
            orcMid: window.raceSkinToneFromSlider('orc', 50),
            orcEnd: window.raceSkinToneFromSlider('orc', 100),
        }));
        expect(tones.humanMid.hue).toBeLessThan(40);
        expect(tones.orcStart.saturation).toBeLessThan(0.15); // deliberately grey/ashy
        expect(tones.orcMid.hue).toBeGreaterThan(100);
        expect(tones.orcMid.hue).toBeLessThan(160);
        expect(tones.orcEnd.hue).toBeGreaterThan(190); // blue-grey end of slider
    });

    test('goblin natural palette stays in yellow-green through blue-grey rather than human skin hues', async ({ page }) => {
        const tones = await page.evaluate(() => ({
            start: window.raceSkinToneFromSlider('goblin', 0),
            mid: window.raceSkinToneFromSlider('goblin', 50),
            end: window.raceSkinToneFromSlider('goblin', 100),
        }));
        expect(tones.start.hue).toBeGreaterThan(80);
        expect(tones.mid.hue).toBeGreaterThan(110);
        expect(tones.end.hue).toBeGreaterThan(190);
    });

    test('character creator uses the selected race when resolving natural skin tone', async ({ page }) => {
        const result = await page.evaluate(() => {
            const race = document.getElementById('race-select');
            const slider = document.getElementById('skin-tone-slider');
            const fantasy = document.getElementById('fantasy-skin-check');
            fantasy.checked = false;
            slider.value = '50';

            race.value = 'orc';
            race.dispatchEvent(new Event('change', { bubbles:true }));
            const orc = window.getPlayerSkinToneFromControls();
            const orcLabel = document.querySelector('label[for="skin-tone-slider"]').textContent;

            race.value = 'goblin';
            race.dispatchEvent(new Event('change', { bubbles:true }));
            const goblin = window.getPlayerSkinToneFromControls();
            const goblinLabel = document.querySelector('label[for="skin-tone-slider"]').textContent;

            race.value = 'human';
            race.dispatchEvent(new Event('change', { bubbles:true }));
            const human = window.getPlayerSkinToneFromControls();

            return { orc, goblin, human, orcLabel, goblinLabel };
        });
        expect(result.orc.hue).toBeGreaterThan(100);
        expect(result.goblin.hue).toBeGreaterThan(110);
        expect(result.human.hue).toBeLessThan(40);
        expect(result.orcLabel).toContain('grey / green / blue');
        expect(result.goblinLabel).toContain('yellow-green');
    });

    test('fantasy colour remains an explicit any-hue override for greenskins', async ({ page }) => {
        const tone = await page.evaluate(() => {
            document.getElementById('race-select').value = 'orc';
            document.getElementById('fantasy-skin-check').checked = true;
            document.getElementById('skin-hue-slider').value = '315';
            return window.getPlayerSkinToneFromControls();
        });
        expect(tone.hue).toBe(315);
    });
});
