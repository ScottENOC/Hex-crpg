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

    test('Elder Nessa Wren offers the trust-task; clearing the den starts unicorn_tracking instead of granting the skill directly', async ({ page }) => {
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

            const druidGroveAfter = window.questLog.find(q => q.id === 'druid_grove');
            const trackingQuest = window.questLog.find(q => q.id === 'unicorn_tracking');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);

            // Talking again once tracking has started should point at the
            // wilderness, not repeat the den offer.
            dialogueCalls.length = 0;
            window.npcDialogueTrees.elder_nessa_wren(npc);
            const pointsAtWilderness = dialogueCalls.some(c => c.text.includes('southwest'));

            return {
                questActiveAfterAccept,
                feralWolvesSpawned,
                stillFouled,
                druidGroveCompleted: druidGroveAfter?.status === 'completed',
                trackingQuestActive: trackingQuest?.status === 'active',
                hasUnicornSkillAlready: player.skills?.learn_unicorn_summon === 1,
                pointsAtWilderness,
            };
        });
        expect(result.questActiveAfterAccept).toBe(true);
        expect(result.feralWolvesSpawned).toBeGreaterThan(0);
        expect(result.stillFouled).toBe(true);
        expect(result.druidGroveCompleted).toBe(true);
        expect(result.trackingQuestActive).toBe(true);
        expect(result.hasUnicornSkillAlready).toBe(false); // not granted yet — still has to find the unicorn
        expect(result.pointsAtWilderness).toBe(true);
    });

    test('finding and approaching the wild unicorn only grants the skill once unicorn_tracking is active', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = window.campaign2UnicornEntity || { name: 'Unicorn' };
            const dialogueCalls = [];
            const originalShowDialogue = window.showDialogue;
            window.showDialogue = (n, text, options) => { dialogueCalls.push({ text, options }); };

            // Stumbling onto it before the druid ever sent the player there.
            window.npcDialogueTrees.wild_unicorn(npc);
            const fleesWithoutQuest = dialogueCalls.some(c => c.text.includes('turns and is gone'));
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const noSkillYet = player.skills?.learn_unicorn_summon !== 1;

            // Now with the quest active.
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'unicorn_tracking', title: 'The Silver Trail', status: 'active', resolution: null });
            dialogueCalls.length = 0;
            window.npcDialogueTrees.wild_unicorn(npc);
            const approach = dialogueCalls.find(c => c.options.some(o => o.label === 'Approach slowly.'));
            approach.options.find(o => o.label === 'Approach slowly.').action();

            const quest = window.questLog.find(q => q.id === 'unicorn_tracking');
            return {
                fleesWithoutQuest,
                noSkillYet,
                questCompletedAfterApproach: quest?.status === 'completed',
                hasSkillAfterApproach: player.skills?.learn_unicorn_summon === 1,
            };
        });
        expect(result.fleesWithoutQuest).toBe(true);
        expect(result.noSkillYet).toBe(true);
        expect(result.questCompletedAfterApproach).toBe(true);
        expect(result.hasSkillAfterApproach).toBe(true);
    });

    test('Knowledge: Nature rank gates both how much of the unicorn trail is visible and how much detail it reveals', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.skills = player.skills || {};

            const sampleQ = 500, sampleR = 500; // arbitrary hex, far from any real content
            const results = {};
            [0, 1, 2, 3].forEach(rank => {
                delete player.skills.druid_knowledge_nature;
                delete player.skills.elf_knowledge_nature;
                if (rank > 0) player.skills.druid_knowledge_nature = rank;
                // Count how many of a broad sample of hexes are "visible" at this rank.
                let visibleCount = 0;
                for (let i = 0; i < 500; i++) {
                    if (window.isUnicornTrackVisible(sampleQ + i, sampleR)) visibleCount++;
                }
                results[rank] = visibleCount;
            });
            return results;
        });
        expect(result[0]).toBe(0);
        expect(result[1]).toBeGreaterThan(0);
        expect(result[2]).toBeGreaterThan(result[1]);
        expect(result[3]).toBeGreaterThan(result[2]);
    });

    test('showUnicornTrackDetail reveals nothing at rank 0-1, direction at rank 2, direction+age at rank 3', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.skills = player.skills || {};

            // Pick a hex visible at rank 1 (the strictest/lowest threshold) —
            // visibility is monotonic with rank, so this hex stays visible
            // at rank 2 and 3 too, letting the same object be reused across
            // all three checks below.
            player.skills.druid_knowledge_nature = 1;
            let hex = null;
            for (let i = 0; i < 2000 && !hex; i++) {
                if (window.isUnicornTrackVisible(900 + i, 900)) hex = { q: 900 + i, r: 900 };
            }
            const obj = { dirQ: 1, dirR: 0, segmentIndex: 0 };

            const messages = [];
            const originalShowMessage = window.showMessage;
            window.showMessage = (msg) => messages.push(msg);

            player.skills.druid_knowledge_nature = 1;
            window.showUnicornTrackDetail(obj, hex.q, hex.r);
            const rank1Msg = messages[messages.length - 1];

            player.skills.druid_knowledge_nature = 2;
            window.showUnicornTrackDetail(obj, hex.q, hex.r);
            const rank2Msg = messages[messages.length - 1];

            player.skills.druid_knowledge_nature = 3;
            window.showUnicornTrackDetail(obj, hex.q, hex.r);
            const rank3Msg = messages[messages.length - 1];

            window.showMessage = originalShowMessage;
            return { rank1Msg, rank2Msg, rank3Msg };
        });
        expect(result.rank1Msg).toContain('hard to say which way');
        expect(result.rank2Msg).toContain('Hoofprints lead');
        expect(result.rank2Msg).not.toContain('old');
        expect(result.rank3Msg).toContain('Hoofprints lead');
    });

    test('the unicorn wander tick advances it along its fixed patrol loop', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const path = window.campaign2UnicornPatrolPath;
            const startIndex = window.campaign2UnicornPathIndex;
            window.campaign2UnicornEntity.destination = null;
            window.tickUnicornWander();
            const newIndex = window.campaign2UnicornPathIndex;
            const dest = window.campaign2UnicornEntity.destination;
            return {
                pathLength: path?.length,
                indexAdvanced: newIndex !== startIndex,
                destinationMatchesPath: dest && path && dest.q === path[newIndex].q && dest.r === path[newIndex].r,
            };
        });
        expect(result.pathLength).toBeGreaterThan(0);
        expect(result.indexAdvanced).toBe(true);
        expect(result.destinationMatchesPath).toBe(true);
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
