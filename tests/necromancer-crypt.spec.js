// tests/necromancer-crypt.spec.js
// The Vessel-Seeker's Crypt: a real dungeon crawl expansion of the existing
// necromancer breadcrumb (abandoned house + phylactery altar + Mirella
// Thorn). Captain Rennick offers "The Vessel-Seeker's Crypt" once Mirella's
// exposed; the crypt itself (buildNecromancerCrypt, campaign2World.js) is
// three rooms of undead culminating in Malachar, a named boss built off the
// revenant template. Defeating him resolves the quest through the same
// "all enemies dead" gate every other Campaign 2 scripted fight uses.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe("The Vessel-Seeker's Crypt", () => {
    test('the crypt is built with three rooms and populated with tagged undead, including the named boss', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const cryptMinions = window.entities.filter(e => e.cryptMinion);
            const boss = window.entities.find(e => e.isNecromancerBoss);
            return {
                entranceCenter: window.campaign2NecromancerCryptCenter,
                ritualCenter: window.campaign2NecromancerRitualCenter,
                cryptMinionCount: cryptMinions.length,
                bossExists: !!boss,
                bossName: boss?.name,
                bossHp: boss?.maxHp,
                bossAlive: boss?.alive,
                undeadTypesPresent: [...new Set(cryptMinions.map(e => e.name))].sort(),
            };
        });
        expect(result.entranceCenter).toBeTruthy();
        expect(result.ritualCenter).toBeTruthy();
        expect(result.cryptMinionCount).toBeGreaterThanOrEqual(6); // 2 entrance + 3 ossuary + boss + 1 escort
        expect(result.bossExists).toBe(true);
        expect(result.bossName).toBe('Malachar, the Vessel-Seeker');
        expect(result.bossHp).toBe(90);
        expect(result.bossAlive).toBe(true);
        expect(result.undeadTypesPresent).toContain('Skeleton');
        expect(result.undeadTypesPresent).toContain('Zombie');
        expect(result.undeadTypesPresent).toContain('Wraith');
    });

    test('killing a cryptMinion lowers necromancer_cult standing but does NOT count toward isAbandonedHouseCleared', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.factions.necromancer_cult.standing;
            const clearedBefore = window.isAbandonedHouseCleared();
            const cryptSkeleton = window.entities.find(e => e.cryptMinion && e.name === 'Skeleton');
            window.handleLethalDamage(cryptSkeleton, { side: 'player', name: 'Test' });
            return {
                standingDropped: window.factions.necromancer_cult.standing < before,
                // The abandoned house's own skeletons are untouched, so it
                // should still read as "not cleared" — the crypt kill must
                // not be conflated with the house's necromancerMinion tag.
                stillNotClearedAfterCryptKill: !window.isAbandonedHouseCleared(),
                clearedBefore,
            };
        });
        expect(result.clearedBefore).toBe(false);
        expect(result.standingDropped).toBe(true);
        expect(result.stillNotClearedAfterCryptKill).toBe(true);
    });

    test('Captain Rennick only offers the crypt quest once Mirella is exposed, then tracks it through completion', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Captain Ilsa Rennick') || { name: 'Captain Ilsa Rennick', reputation: { standing: 0, knowledge: 0 } };
            const dialogueCalls = [];
            const originalShowDialogue = window.showDialogue;
            window.showDialogue = (n, text, options) => { dialogueCalls.push({ text, options }); };

            // Before exposing Mirella: should never mention the crypt.
            window.npcDialogueTrees.reddale_captain(npc);
            const mentionsCryptBefore = dialogueCalls.some(c => c.text.includes('crypts north'));

            // Expose Mirella.
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'disciple_exposed', title: "The Herbalist's Secret", status: 'completed' });

            dialogueCalls.length = 0;
            window.npcDialogueTrees.reddale_captain(npc);
            const offer = dialogueCalls.find(c => c.options.some(o => o.label.includes("find it and end this")));
            offer.options.find(o => o.label.includes("find it and end this")).action();
            const questActiveAfterAccept = window.questLog.find(q => q.id === 'necromancer_hunt')?.status === 'active';

            return { mentionsCryptBefore, offeredAfterExposing: !!offer, questActiveAfterAccept };
        });
        expect(result.mentionsCryptBefore).toBe(false);
        expect(result.offeredAfterExposing).toBe(true);
        expect(result.questActiveAfterAccept).toBe(true);
    });

    test('defeating Malachar resolves the crypt quest with rewards, once no other enemies remain alive', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_hunt', title: "The Vessel-Seeker's Crypt", status: 'active', resolution: null });

            const goldBefore = window.party[0].gold || 0;
            const standingBefore = window.factions.necromancer_cult.standing;

            // Clear every other enemy on the map first (matches the "all
            // enemies dead" gate every other Campaign 2 fight resolves
            // through) so only the boss kill triggers the resolution.
            window.entities.forEach(e => { if (e.side === 'enemy' && e !== window.entities.find(x => x.isNecromancerBoss)) e.alive = false; });

            const boss = window.entities.find(e => e.isNecromancerBoss);
            window.handleLethalDamage(boss, { side: 'player', name: 'Test' });

            const quest = window.questLog.find(q => q.id === 'necromancer_hunt');
            return {
                questCompleted: quest?.status === 'completed',
                necromancerDefeatedFlag: window.necromancerDefeated === true,
                goldGained: (window.party[0].gold || 0) > goldBefore,
                standingDropped: window.factions.necromancer_cult.standing < standingBefore,
            };
        });
        expect(result.questCompleted).toBe(true);
        expect(result.necromancerDefeatedFlag).toBe(true);
        expect(result.goldGained).toBe(true);
        expect(result.standingDropped).toBe(true);
    });
});
