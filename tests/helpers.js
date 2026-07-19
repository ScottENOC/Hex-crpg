// tests/helpers.js
// Shared setup for driving the game through Playwright. Most tests bypass
// real-time narrative pacing by calling the game's own exposed trigger
// functions (window.startHollowmereShakedown, window.resolveShakedown, etc.)
// directly via page.evaluate rather than waiting through setTimeout chains —
// see smoke.spec.js for the one test that plays the real timing instead.

/**
 * Creates a character and gets past the character-screen modal into the
 * running game. Defaults to a human fighter starting Campaign 2 (Hollowmere).
 */
async function createCharacter(page, { race = 'human', gender = 'male', cls = 'fighter', campaign = '2', difficulty = 'normal' } = {}) {
    await page.goto('/');
    await page.waitForSelector('#race-select', { state: 'visible' });
    await page.selectOption('#race-select', race);
    await page.selectOption('#gender-select', gender);
    await page.selectOption('#class-select', cls);
    await page.selectOption('#campaign-select', campaign);
    const difficultySelect = page.locator('#difficulty-select');
    if (await difficultySelect.count()) await difficultySelect.selectOption(difficulty);
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.entities && window.entities.length > 0);
}

/** Clicks the dialogue option button whose visible text contains `textFragment`. */
async function clickDialogueOption(page, textFragment) {
    await page.waitForSelector('#dialogue-options button', { state: 'visible' });
    const buttons = await page.$$('#dialogue-options button');
    for (const btn of buttons) {
        const text = await btn.innerText();
        if (text.includes(textFragment)) {
            await btn.click();
            return true;
        }
    }
    throw new Error(`No dialogue option found containing "${textFragment}"`);
}

/** Waits for the dialogue modal to be open and returns its speaker/message/options. */
async function readDialogue(page) {
    await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
    return page.evaluate(() => ({
        speaker: document.getElementById('dialogue-speaker').innerText,
        message: document.getElementById('dialogue-message').innerText,
        options: Array.from(document.getElementById('dialogue-options').children).map(b => b.innerText),
    }));
}

/**
 * Applies a shakedown branch's consequences directly (window.resolveShakedown
 * runs synchronously — reputation/side changes happen immediately, no
 * setTimeout chain to wait through) without playing the ~20s scripted
 * entrance/dialogue sequence first. This is what most tests should use;
 * smoke.spec.js plays the real sequence instead to cover the pacing itself.
 */
async function resolveShakedownDirectly(page, branch) {
    await page.evaluate((b) => {
        window.hollowmereEventFired = true; // mark the scene as "already happened" so state is consistent
        window.resolveShakedown(b);
    }, branch);
}

module.exports = { createCharacter, clickDialogueOption, readDialogue, resolveShakedownDirectly };
