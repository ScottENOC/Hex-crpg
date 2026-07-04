const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('party banter speech bubbles', () => {
    test('spawnSpeechBubble pushes an entry that expires after its duration', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.speechBubbles = [];
            window.spawnSpeechBubble('Wren Talbot', 'Hello there', 50);
            const countAfterSpawn = window.speechBubbles.length;
            return new Promise(resolve => {
                setTimeout(() => {
                    window.renderSpeechBubbles(window.mapCtx, window.hexToPixel, window.cameraZoom);
                    resolve({ countAfterSpawn, countAfterExpiry: window.speechBubbles.length });
                }, 120);
            });
        });
        expect(result.countAfterSpawn).toBe(1);
        expect(result.countAfterExpiry).toBe(0);
    });

    test('playBanterLines spawns a speech bubble for a real party member', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            return new Promise(resolve => {
                window.speechBubbles = [];
                window.playBanterLines([{ speaker: 'Wren Talbot', mood: 'idle', text: 'Test banter line' }]);
                setTimeout(() => {
                    resolve(window.speechBubbles.some(b => b.speakerName === 'Wren Talbot' && b.text === 'Test banter line'));
                }, 50);
            });
        });
        expect(result).toBe(true);
    });
});
