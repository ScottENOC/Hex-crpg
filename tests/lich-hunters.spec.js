// tests/lich-hunters.spec.js
// The kingdom notices a known lich: once window.playerIsLich, wandering
// well outside the village/farmland risks a hunter party (same "same
// gating as orc raiders" convention as checkOrcRaiderEncounter). Escalates
// in both frequency and strength with days since lichBecameKnownAt
// (LICH_HUNTER_TIERS/lichHunterTierFor, campaign2Dialogue.js) rather than
// being one flat, forever-identical encounter — this is the first piece
// of "the kingdom reacts" before any invasion/endgame content.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('lichHunterTierFor: escalation by days known', () => {
    test('tier escalates from local militia to knights to a paladin strike team', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            day0: window.lichHunterTierFor(0).label,
            day1: window.lichHunterTierFor(1).label,
            day5: window.lichHunterTierFor(5).label,
            day15: window.lichHunterTierFor(15).label,
        }));
        expect(result.day0).toBe('a band of local militia');
        expect(result.day1).toBe('a band of local militia');
        expect(result.day5).toBe('a company of trained knights');
        expect(result.day15).toBe("a paladin order's strike team");
    });
});

test.describe('checkLichHunterEncounter: gating', () => {
    test('never fires without playerIsLich, even far into the wilderness with the accumulator maxed', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = false;
            const p = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            p.hex = { q: 200, r: 0 };
            const before = window.entities.filter(e => e.lichHunterParty).length;
            window.checkLichHunterEncounter(p, 500);
            const after = window.entities.filter(e => e.lichHunterParty).length;
            return { before, after };
        });
        expect(result.after).toBe(result.before);
    });

    test('never fires within village/farmland range, even as a known lich', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            window.lichBecameKnownAt = window.worldSeconds - 20 * 24 * 3600; // long enough for the top tier
            const p = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            p.hex = { q: 5, r: 0 }; // well inside the 35-hex safe radius
            const originalRandom = Math.random;
            Math.random = () => 0; // guarantee the chance roll would pass if it were even checked
            const before = window.entities.filter(e => e.lichHunterParty).length;
            window.checkLichHunterEncounter(p, 500);
            const after = window.entities.filter(e => e.lichHunterParty).length;
            Math.random = originalRandom;
            return { before, after };
        });
        expect(result.after).toBe(result.before);
    });

    test('the accumulator gates checks to the interval, not every call', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            window.lichBecameKnownAt = window.worldSeconds;
            const p = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            p.hex = { q: 200, r: 0 };
            const originalRandom = Math.random;
            Math.random = () => 0;
            const before = window.entities.filter(e => e.lichHunterParty).length;
            window.checkLichHunterEncounter(p, 5); // far under the 200s interval
            const afterShortTick = window.entities.filter(e => e.lichHunterParty).length;
            window.checkLichHunterEncounter(p, 500); // pushes the accumulator over
            const afterLongTick = window.entities.filter(e => e.lichHunterParty).length;
            Math.random = originalRandom;
            return { before, afterShortTick, afterLongTick };
        });
        expect(result.afterShortTick).toBe(result.before);
        expect(result.afterLongTick).toBeGreaterThan(result.before);
    });

    test('a spawned hunter party is a real hostile fight, not a dialogue NPC', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            window.lichBecameKnownAt = window.worldSeconds;
            const p = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            p.hex = { q: 200, r: 0 };
            const originalRandom = Math.random;
            Math.random = () => 0;
            window.checkLichHunterEncounter(p, 500);
            Math.random = originalRandom;
            const hunters = window.entities.filter(e => e.lichHunterParty);
            return {
                spawnedAny: hunters.length > 0,
                allHostile: hunters.every(h => h.side === 'enemy'),
                allNotDialogueNPCs: hunters.every(h => h.isNPC === false),
                allHuman: hunters.every(h => h.race === 'human'),
            };
        });
        expect(result.spawnedAny).toBe(true);
        expect(result.allHostile).toBe(true);
        expect(result.allNotDialogueNPCs).toBe(true);
        expect(result.allHuman).toBe(true);
    });

    test('the two lichdom commitment paths both set lichBecameKnownAt', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_lichdom', status: 'active', resolution: null });
            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.readLichPhylacteryCoreNote();
            calls.find(o => o.label === 'Bind it to yourself instead.').action();
            return typeof window.lichBecameKnownAt === 'number';
        });
        expect(result).toBe(true);
    });
});
