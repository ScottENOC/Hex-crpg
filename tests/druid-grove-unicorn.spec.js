// tests/druid-grove-unicorn.spec.js
// The Emberwood Grove / "The Old Faith" questline pays off the "someone
// less tied to a throne" hook in Thessaly's tome (readWizardTowerTome,
// campaign2World.js). Elder Nessa Wren gates a single trust-task (clear the
// feral den fouling the grove's spring) behind which sits learn_unicorn_summon
// — granted directly via grantSkillRank, never purchasable with skill points
// (see skills.js's prereq_eval). The unicorn itself is not a party member: it
// only ever answers as the player's ONE permanent Nature animal companion.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('The Emberwood Grove: unicorn animal companion', () => {
    test('learn_unicorn_summon is not purchasable with skill points, only quest-granted', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const skill = window.skills.learn_unicorn_summon;
            return { exists: !!skill, blockedByPrereqEval: skill.prereq_eval && skill.prereq_eval() === false };
        });
        expect(result.exists).toBe(true);
        expect(result.blockedByPrereqEval).toBe(true);
    });

    test('the unicorn is a real monster template, never a mount', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const t = window.monsterTemplates.unicorn;
            return { exists: !!t, mountSize: t?.mountSize, inSummonList: window.baseSpells.summon_animal.summons.includes('unicorn') };
        });
        expect(result.exists).toBe(true);
        expect(result.mountSize).toBe(0);
        expect(result.inSummonList).toBe(true);
    });

    test("resolveSpell refuses to summon a unicorn without the druid-granted skill, even if directly requested", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const caster = window.entities.find(e => e.side === 'player' && !e.rider);
            // Somewhere guaranteed open and unoccupied, away from any tavern
            // furniture/walls at spawn.
            const clickedHex = { q: caster.hex.q + 50, r: caster.hex.r + 50 };
            const before = window.entities.length;
            const handled = window.resolveSpell(caster, { type: 'summon', animalId: 'unicorn' }, null, clickedHex);
            return { handled, entitiesUnchanged: window.entities.length === before };
        });
        expect(result.handled).toBe(false);
        expect(result.entitiesUnchanged).toBe(true);
    });

    test("resolveSpell allows the unicorn once learn_unicorn_summon + animal_companion are both set and no companion exists yet", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const caster = window.entities.find(e => e.side === 'player' && !e.rider);
            caster.skills = caster.skills || {};
            caster.skills.learn_unicorn_summon = 1;
            caster.skills.animal_companion = 1;
            const clickedHex = { q: caster.hex.q + 50, r: caster.hex.r + 50 };
            const handled = window.resolveSpell(caster, { type: 'summon', animalId: 'unicorn' }, null, clickedHex);
            return { handled, companionName: caster.animalCompanion?.name };
        });
        expect(result.handled).toBe(true);
        expect(result.companionName).toBe('Unicorn');
    });

    test('Elder Nessa Wren offers the trust-task, and completing the den fight lets her grant the unicorn bond', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Elder Nessa Wren') || { name: 'Elder Nessa Wren' };
            const dialogueCalls = [];
            const originalShowDialogue = window.showDialogue;
            window.showDialogue = (n, text, options) => { dialogueCalls.push({ text, options }); };

            window.npcDialogueTrees.elder_nessa_wren(npc);
            const offer = dialogueCalls.find(c => c.options.some(o => o.label.includes("looking for the unicorn")));
            offer.options.find(o => o.label.includes("looking for the unicorn")).action();
            const accept = dialogueCalls.find(c => c.options.some(o => o.label.includes("clear the den")));
            accept.options.find(o => o.label.includes("clear the den")).action();

            const questActiveAfterAccept = window.questLog.find(q => q.id === 'druid_grove')?.status === 'active';
            const feralWolvesSpawned = window.entities.filter(e => e.isDruidGroveFeral).length;

            // Before the den is cleared, talking again should just nudge, not resolve.
            dialogueCalls.length = 0;
            window.npcDialogueTrees.elder_nessa_wren(npc);
            const stillFouled = dialogueCalls.some(c => c.text.includes('still runs foul'));

            // Clear the den, then talk again.
            window.entities.forEach(e => { if (e.isDruidGroveFeral) e.alive = false; });
            dialogueCalls.length = 0;
            window.npcDialogueTrees.elder_nessa_wren(npc);
            const grantOffer = dialogueCalls.find(c => c.options.some(o => o.label === 'What now?'));
            grantOffer.options.find(o => o.label === 'What now?').action();

            const questAfterGrant = window.questLog.find(q => q.id === 'druid_grove');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            return {
                questActiveAfterAccept,
                feralWolvesSpawned,
                stillFouled,
                questCompletedAfterGrant: questAfterGrant?.status === 'completed',
                hasUnicornSkill: player.skills?.learn_unicorn_summon === 1,
            };
        });
        expect(result.questActiveAfterAccept).toBe(true);
        expect(result.feralWolvesSpawned).toBeGreaterThan(0);
        expect(result.stillFouled).toBe(true);
        expect(result.questCompletedAfterGrant).toBe(true);
        expect(result.hasUnicornSkill).toBe(true);
    });

    test('companion/mount personality banter: a unicorn stamps impatiently in a city region, but not in the wilderness', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.animalCompanion = { name: 'Unicorn' };
            const entry = window.characterBanterLines.find(b => b.id === 'unicorn_uneasy_in_city');

            window.worldMapData = window.worldMapData || [];
            window.worldMapData[0] = window.worldMapData[0] || [];
            window.worldMapData[0][0] = { n: 'Silverhart' };
            window.playerWorldPos = { x: 0, y: 0 };
            const inCity = entry.condition();

            window.worldMapData[0][0] = { n: 'Hollowmere' };
            const inWilderness = entry.condition();

            return { inCity, inWilderness };
        });
        expect(result.inCity).toBe(true);
        expect(result.inWilderness).toBe(false);
    });
});
