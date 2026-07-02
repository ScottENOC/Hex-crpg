// tests/hollowmere-plotlines.spec.js
// Three early-game breadcrumbs added for the wider plot arcs: Wren's missing
// parents (foreshadowing the abandoned-house skeletons), a body-disposal
// quest + delayed Ironbond investigator after the tavern fight, and a note
// at the goblin camp hinting the tribe is scouting for a larger power.
const { test, expect } = require('@playwright/test');
const { createCharacter, resolveShakedownDirectly, readDialogue, clickDialogueOption } = require('./helpers');

test.describe('Wren/Aldric missing-parents banter', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('banter entries exist and fire once their conditions are met', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.hollowmereEventFired = true;
            window.party.push({ name: 'Ser Aldric Thorne' });

            const entryIds = window.characterBanterLines.map(b => b.id);
            const hasParents = entryIds.includes('wren_parents_north');
            const hasComfort = entryIds.includes('wren_aldric_parents_comfort');

            const parentsEntry = window.characterBanterLines.find(b => b.id === 'wren_parents_north');
            const parentsConditionMet = parentsEntry.condition();

            // Fire it directly (bypassing the 5s accumulation gate) and confirm
            // it flips the once-only tracking flag.
            window.playBanterLines(parentsEntry.lines);
            window.firedBanterIds[parentsEntry.id] = true;

            const comfortEntry = window.characterBanterLines.find(b => b.id === 'wren_aldric_parents_comfort');
            const comfortConditionMet = comfortEntry.condition();

            return { hasParents, hasComfort, parentsConditionMet, comfortConditionMet };
        });
        expect(result.hasParents).toBe(true);
        expect(result.hasComfort).toBe(true);
        expect(result.parentsConditionMet).toBe(true);
        expect(result.comfortConditionMet).toBe(true); // only true once the parents line has fired first
    });

    test('the comfort exchange does not fire before the parents line has', async ({ page }) => {
        const conditionMet = await page.evaluate(() => {
            window.hollowmereEventFired = true;
            window.party.push({ name: 'Ser Aldric Thorne' });
            window.firedBanterIds['wren_parents_north'] = false;
            const entry = window.characterBanterLines.find(b => b.id === 'wren_aldric_parents_comfort');
            return entry.condition();
        });
        expect(conditionMet).toBe(false);
    });
});

test.describe('Loose Ends: body disposal + Ironbond investigator', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('is only offered after the fight branch actually kills the soldiers', async ({ page }) => {
        // encourage_pay lets the soldiers leave alive — nothing to hide.
        await resolveShakedownDirectly(page, 'encourage_pay');
        const offeredWithoutDeaths = await page.evaluate(() => {
            window.offerBodyDisposalQuest();
            return !!(window.questLog || []).find(q => q.id === 'hidden_bodies');
        });
        expect(offeredWithoutDeaths).toBe(false);
    });

    test('hiding the bodies logs the quest as hidden and the investigator confronts you about it weeks later', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        await page.evaluate(() => {
            const dray = window.entities.find(e => e.name === 'Dray Coltayne');
            dray.alive = false;
            window.offerBodyDisposalQuest();
        });
        await clickDialogueOption(page, 'hide the bodies');

        const afterHiding = await page.evaluate(() => {
            const q = (window.questLog || []).find(q => q.id === 'hidden_bodies');
            return { exists: !!q, hidden: q?.hidden, status: q?.status };
        });
        expect(afterHiding.exists).toBe(true);
        expect(afterHiding.hidden).toBe(true);
        expect(afterHiding.status).toBe('completed');

        // Jump the clock forward 15 in-game days and let the investigator arrive.
        const investigator = await page.evaluate(() => {
            const q = (window.questLog || []).find(q => q.id === 'hidden_bodies');
            q.offeredAt = window.worldSeconds - 15 * 24 * 3600;
            window.triggerGuildInvestigatorEncounter();
            return window.entities.find(e => e.name === 'Renn Ashby');
        });
        expect(investigator).toBeTruthy();
        expect(investigator.dialogueId).toBe('guild_investigator');

        const dialogue = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Renn Ashby');
            window.npcDialogueTrees.guild_investigator(npc);
        });
        const opened = await readDialogue(page);
        expect(opened.message).toMatch(/went quiet|You wouldn't know/i);
    });

    test('leaving the bodies still brings the investigator, but with different dialogue', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        await page.evaluate(() => {
            const dray = window.entities.find(e => e.name === 'Dray Coltayne');
            dray.alive = false;
            window.offerBodyDisposalQuest();
        });
        await clickDialogueOption(page, 'Leave them');

        const quest = await page.evaluate(() => (window.questLog || []).find(q => q.id === 'hidden_bodies'));
        expect(quest.hidden).toBe(false);

        await page.evaluate(() => {
            const q = (window.questLog || []).find(q => q.id === 'hidden_bodies');
            q.offeredAt = window.worldSeconds - 15 * 24 * 3600;
            window.triggerGuildInvestigatorEncounter();
            const npc = window.entities.find(e => e.name === 'Renn Ashby');
            window.npcDialogueTrees.guild_investigator(npc);
        });
        const opened = await readDialogue(page);
        expect(opened.message).toMatch(/enough behind|know what happened/i);
    });

    test('the investigator does not arrive before 14 in-game days have passed', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        await page.evaluate(() => {
            const dray = window.entities.find(e => e.name === 'Dray Coltayne');
            dray.alive = false;
            window.offerBodyDisposalQuest();
        });
        await clickDialogueOption(page, 'hide the bodies');

        const stillNoInvestigator = await page.evaluate(() => {
            const q = (window.questLog || []).find(q => q.id === 'hidden_bodies');
            q.offeredAt = window.worldSeconds - 5 * 24 * 3600; // only 5 days
            window.triggerGuildInvestigatorEncounter();
            return !window.entities.find(e => e.name === 'Renn Ashby');
        });
        expect(stillNoInvestigator).toBe(true);
    });
});

test.describe('Goblin scout note (invasion breadcrumb)', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('a journal-type tileObject with readId goblin_scout_note is placed at the goblin camp', async ({ page }) => {
        const found = await page.evaluate(() => {
            const center = window.campaign2GoblinCampCenter;
            const obj = window.tileObjects[`${center.q + 1},${center.r - 2}`];
            return obj;
        });
        expect(found).toMatchObject({ type: 'journal', readId: 'goblin_scout_note' });
    });

    test('reading it sets goblinScoutNoteRead and dips regional security once', async ({ page }) => {
        const result = await page.evaluate(() => {
            const before = window.regions.hollowmere.security;
            window.readGoblinScoutNote();
            const afterFirst = window.regions.hollowmere.security;
            window.readGoblinScoutNote(); // reading again should not double-dip
            const afterSecond = window.regions.hollowmere.security;
            return { before, afterFirst, afterSecond, flag: window.goblinScoutNoteRead };
        });
        expect(result.flag).toBe(true);
        expect(result.afterFirst).toBeLessThan(result.before);
        expect(result.afterSecond).toBe(result.afterFirst);
    });

    test('Nix Sharpear has a dialogue option hinting the tribe is scouting for someone else', async ({ page }) => {
        const options = await page.evaluate(() => {
            const nix = window.entities.find(e => e.name === 'Nix Sharpear');
            window.npcDialogueTrees.nix_sharpear(nix);
        });
        const opened = await readDialogue(page);
        expect(opened.options.some(o => /why are you really/i.test(o))).toBe(true);
    });
});
