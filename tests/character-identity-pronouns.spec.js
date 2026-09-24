const { test, expect } = require('@playwright/test');

test.describe('character identity, body presentation and pronouns', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#body-presentation-select', { state:'visible' });
        await page.waitForSelector('#pronoun-select', { state:'visible' });
    });

    test('gender supplies editable body and pronoun defaults without locking either', async ({ page }) => {
        await expect(page.locator('#gender-select option')).toHaveCount(3);
        await expect(page.locator('#gender-select option').nth(2)).toHaveText('Other');
        await expect(page.locator('#body-presentation-select option')).toHaveCount(2);
        await expect(page.locator('#body-presentation-select option').nth(0)).toHaveText('Feminine');
        await expect(page.locator('#body-presentation-select option').nth(1)).toHaveText('Masculine');
        await expect(page.locator('label[for="body-type-select"]')).toHaveText('Build');

        await page.selectOption('#gender-select', 'male');
        await expect(page.locator('#body-presentation-select')).toHaveValue('male');
        await expect(page.locator('#pronoun-select')).toHaveValue('he');

        await page.selectOption('#gender-select', 'female');
        await expect(page.locator('#body-presentation-select')).toHaveValue('female');
        await expect(page.locator('#pronoun-select')).toHaveValue('she');

        const otherDefaults = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0.999;
            const select = document.getElementById('gender-select');
            select.value = 'other';
            select.dispatchEvent(new Event('change', { bubbles:true }));
            Math.random = original;
            return {
                body:document.getElementById('body-presentation-select').value,
                pronouns:document.getElementById('pronoun-select').value
            };
        });
        expect(otherDefaults).toEqual({ body:'male', pronouns:'they' });

        await page.selectOption('#body-presentation-select', 'female');
        await page.selectOption('#pronoun-select', 'he');
        await expect(page.locator('#gender-select')).toHaveValue('other');
        await expect(page.locator('#body-presentation-select')).toHaveValue('female');
        await expect(page.locator('#pronoun-select')).toHaveValue('he');
    });

    test('Other can use the existing race-specific random-name pools', async ({ page }) => {
        await page.selectOption('#race-select', 'human');
        const names = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0;
            const first = window.getRandomName('human', 'other');
            Math.random = () => 0.999;
            const last = window.getRandomName('human', 'other');
            Math.random = original;
            return { first, last };
        });
        expect(names.first).toBe('Adela');
        expect(names.last).toBe('Tobias');
    });

    test('pronoun tokens and full grammar variants resolve from the selected pronouns', async ({ page }) => {
        await page.selectOption('#pronoun-select', 'they');
        const result = await page.evaluate(() => ({
            tokenText:window.formatPlayerPronouns('{Subject} found {possessive} sword and kept it for {reflexive}.'),
            variantText:window.resolvePronounDialogueText({
                dialogue:'Fallback',
                pronounVariants:{ he:'He is ready.', she:'She is ready.', they:'They are ready.' }
            })
        }));
        expect(result.tokenText).toBe('They found their sword and kept it for themselves.');
        expect(result.variantText).toBe('They are ready.');
    });

    test('pronoun-aware keyed dialogue produces an authoring checklist and audio suffixes', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.dialogueData.dialogue_171 = {
                speaker:'Narrator',
                dialogue:'{Subject} has earned {possessive} place here.',
                pronounAware:true
            };
            return {
                report:window.getPronounDialogueAuthoringReport().find(row => row.key === 'dialogue_171'),
                he:window.getPronounDialogueAudioKey('dialogue_171', 'he'),
                she:window.getPronounDialogueAudioKey('dialogue_171', 'she'),
                they:window.getPronounDialogueAudioKey('dialogue_171', 'they')
            };
        });
        expect(result.he).toBe('dialogue_171_he');
        expect(result.she).toBe('dialogue_171_she');
        expect(result.they).toBe('dialogue_171_they');
        expect(result.report).toMatchObject({
            he:'audio/dialogue/dialogue_171_he.m4a',
            she:'audio/dialogue/dialogue_171_she.m4a',
            they:'audio/dialogue/dialogue_171_they.m4a'
        });
    });

    test('appearance randomise changes body presentation but leaves identity and pronouns alone', async ({ page }) => {
        await page.selectOption('#gender-select', 'other');
        await page.selectOption('#pronoun-select', 'she');
        const result = await page.evaluate(() => {
            const original = Math.random;
            Math.random = () => 0.999;
            window.randomizeCharacterAppearance({ sync:false });
            Math.random = original;
            return {
                gender:document.getElementById('gender-select').value,
                pronouns:document.getElementById('pronoun-select').value,
                body:document.getElementById('body-presentation-select').value
            };
        });
        expect(result).toEqual({ gender:'other', pronouns:'she', body:'male' });
    });
});
