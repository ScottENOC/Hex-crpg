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

test.describe('ambient NPC-to-NPC chatter (no player click involved)', () => {
    test('two nearby neutral NPCs exchange lines via speech bubbles on their own', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            const a = new window.Entity('Chatty Villager A', 'white', { q: p.hex.q + 1, r: p.hex.r }, 5);
            a.isNPC = true; a.side = 'neutral'; a.alive = true;
            const b = new window.Entity('Chatty Villager B', 'white', { q: p.hex.q + 2, r: p.hex.r }, 5);
            b.isNPC = true; b.side = 'neutral'; b.alive = true;
            window.entities = [p, a, b]; // isolate from the rest of the world's NPCs so the random pair pick can't land on someone else

            window.speechBubbles = [];
            window.ambientChatterCooldowns = {};
            window.ambientChatterAccum = 0;
            window.isInCombat = false;
            window.checkAmbientNpcChatter(17); // one tick over the 16s threshold

            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(window.speechBubbles.some(bub => bub.speakerName === 'Chatty Villager A' || bub.speakerName === 'Chatty Villager B'));
                }, 100);
            });
        });
        expect(result).toBe(true);
    });

    test('does not fire during combat', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            const a = new window.Entity('Combat Villager A', 'white', { q: p.hex.q + 1, r: p.hex.r }, 5);
            a.isNPC = true; a.side = 'neutral'; a.alive = true;
            const b = new window.Entity('Combat Villager B', 'white', { q: p.hex.q + 2, r: p.hex.r }, 5);
            b.isNPC = true; b.side = 'neutral'; b.alive = true;
            window.entities = [p, a, b]; // isolate from the rest of the world's NPCs so the random pair pick can't land on someone else

            window.speechBubbles = [];
            window.ambientChatterCooldowns = {};
            window.ambientChatterAccum = 0;
            window.isInCombat = true;
            window.checkAmbientNpcChatter(17);

            return new Promise(resolve => {
                setTimeout(() => {
                    window.isInCombat = false;
                    resolve(window.speechBubbles.length);
                }, 100);
            });
        });
        expect(result).toBe(0);
    });

    test('the same pair does not chat again within the cooldown window', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            const a = new window.Entity('Cooldown Villager A', 'white', { q: p.hex.q + 1, r: p.hex.r }, 5);
            a.isNPC = true; a.side = 'neutral'; a.alive = true;
            const b = new window.Entity('Cooldown Villager B', 'white', { q: p.hex.q + 2, r: p.hex.r }, 5);
            b.isNPC = true; b.side = 'neutral'; b.alive = true;
            window.entities = [p, a, b]; // isolate from the rest of the world's NPCs so the random pair pick can't land on someone else

            window.ambientChatterCooldowns = {};
            window.ambientChatterAccum = 0;
            window.isInCombat = false;
            window.checkAmbientNpcChatter(17);
            const key = ['Cooldown Villager A', 'Cooldown Villager B'].sort().join('|');
            const firedAt = window.ambientChatterCooldowns[key];

            window.ambientChatterAccum = 0;
            window.checkAmbientNpcChatter(17); // immediately again — should be blocked by the 90s cooldown
            const stillSameTimestamp = window.ambientChatterCooldowns[key] === firedAt;

            return { firedAt: !!firedAt, stillSameTimestamp };
        });
        expect(result.firedAt).toBe(true);
        expect(result.stillSameTimestamp).toBe(true);
    });

    test('two NPCs standing far apart never chat with each other', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            const a = new window.Entity('Far Villager A', 'white', { q: p.hex.q + 1, r: p.hex.r }, 5);
            a.isNPC = true; a.side = 'neutral'; a.alive = true;
            const b = new window.Entity('Far Villager B', 'white', { q: p.hex.q + 10, r: p.hex.r }, 5);
            b.isNPC = true; b.side = 'neutral'; b.alive = true;
            window.entities = [p, a, b]; // isolate from the rest of the world's NPCs so the random pair pick can't land on someone else

            window.speechBubbles = [];
            window.ambientChatterCooldowns = {};
            window.ambientChatterAccum = 0;
            window.isInCombat = false;
            window.checkAmbientNpcChatter(17);

            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(window.speechBubbles.some(bub => bub.speakerName === 'Far Villager A' || bub.speakerName === 'Far Villager B'));
                }, 100);
            });
        });
        expect(result).toBe(false);
    });
});
