// tests/misc-skill-tree.spec.js
// The 'misc' skill tree (skills.js): everything that doesn't fit a combat
// attribute or the quest-only crafting specialties (runesmithing,
// leatherworking) — lockpicking, survival, appraisal/appraiser, persuasion,
// insight, intimidation, and the two new ones, smithing and cooking.
// Nothing ever grants a dedicated 'misc' point directly (same as the old
// 'social'/'practical' trees it replaces), so any misc skill is funded by
// whichever attribute pool has a spare point — and if more than one pool
// does, learnSkill (ui.js) asks which one via a chooser dialog instead of
// guessing.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('the misc tree itself', () => {
    test('every former social/practical skill, plus smithing and cooking, live in the misc tree', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const keys = ['appraiser', 'persuasion', 'insight', 'intimidation', 'lockpicking', 'survival', 'appraisal', 'smithing', 'cooking'];
            return keys.map(k => ({ key: k, tree: window.skills[k]?.tree }));
        });
        result.forEach(r => expect(r.tree).toBe('misc'));
    });
});

test.describe('spending a point on a misc skill', () => {
    test('funds itself from the only pool that has a spare point, with no chooser needed', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.player.attributes = { strength: 0, endurance: 0, agility: 2, weapons: 0, arcane: 0, divine: 0, nature: 0, wildcard: 0, misc: 0 };
            document.getElementById('dialogue-modal') && (document.getElementById('dialogue-modal').style.display = 'none');
            window.learnSkill('lockpicking');
            return {
                learned: window.player.skills.lockpicking,
                agilityLeft: window.player.attributes.agility,
                dialogueOpen: document.getElementById('dialogue-modal')?.style.display === 'block',
            };
        });
        expect(result.learned).toBe(1);
        expect(result.agilityLeft).toBe(1);
        expect(result.dialogueOpen).toBe(false);
    });

    test('asks which pool to spend when more than one has a point free, and only deducts once an option is chosen', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => {
            window.player.attributes = { strength: 1, endurance: 0, agility: 1, weapons: 0, arcane: 0, divine: 0, nature: 0, wildcard: 0, misc: 0 };
            window.learnSkill('survival');
            return {
                learnedYet: !!window.player.skills.survival,
                strength: window.player.attributes.strength,
                agility: window.player.attributes.agility,
                dialogueOpen: document.getElementById('dialogue-modal')?.style.display === 'block',
                options: Array.from(document.querySelectorAll('#dialogue-options button')).map(b => b.innerText),
            };
        });
        expect(before.learnedYet).toBe(false); // nothing spent yet — still waiting on the choice
        expect(before.strength).toBe(1);
        expect(before.agility).toBe(1);
        expect(before.dialogueOpen).toBe(true);
        expect(before.options.some(o => o.includes('Strength'))).toBe(true);
        expect(before.options.some(o => o.includes('Agility'))).toBe(true);

        const after = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.innerText.includes('Strength'));
            btn.click();
            return {
                learned: window.player.skills.survival,
                strength: window.player.attributes.strength,
                agility: window.player.attributes.agility,
            };
        });
        expect(after.learned).toBe(1);
        expect(after.strength).toBe(0); // spent
        expect(after.agility).toBe(1); // untouched
    });

    test('refuses when every pool is empty', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.player.attributes = { strength: 0, endurance: 0, agility: 0, weapons: 0, arcane: 0, divine: 0, nature: 0, wildcard: 0, misc: 0 };
            window.learnSkill('insight');
            return { learned: !!window.player.skills.insight };
        });
        expect(result.learned).toBe(false);
    });
});

test.describe('smithing and cooking effects', () => {
    test('smithing reduces craftWithSmith\'s fee multiplier, capped at 3 ranks', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const noSkill = window.getSmithingFeeMult();
            window.grantSkillRank(window.player, 'smithing');
            window.grantSkillRank(window.player, 'smithing');
            const twoRanks = window.getSmithingFeeMult();
            window.grantSkillRank(window.player, 'smithing');
            window.grantSkillRank(window.player, 'smithing'); // beyond max rank (3) — should have no further effect
            const capped = window.getSmithingFeeMult();
            return { noSkill, twoRanks, capped };
        });
        expect(result.noSkill).toBe(1.5);
        expect(result.twoRanks).toBeCloseTo(1.3, 5);
        expect(result.capped).toBeCloseTo(1.2, 5);
    });

    test('craftWithSmith actually charges the smithing-discounted fee', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.grantSkillRank(window.player, 'smithing');
            window.grantSkillRank(window.player, 'smithing');
            window.grantSkillRank(window.player, 'smithing'); // rank 3, 1.2x
            window.player.inventory.push('starmetal_ore', 'starmetal_ore');
            window.player.gold = 1000;
            const goldBefore = window.player.gold;
            window.craftWithSmith('starforged_blade');
            return { spent: goldBefore - window.player.gold, expected: Math.round(window.CRAFTING_RECIPES.starforged_blade.gold * 1.2) };
        });
        expect(result.spent).toBe(result.expected);
    });

    test('cooking extends the Well Fed duration by 2h per rank, capped at 2 ranks', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.worldSeconds = 1000;
            window.player.inventory.push('game_meat');
            window.eatFood('game_meat');
            const noSkillUntil = window.player.wellFedUntil;

            window.worldSeconds = 1000;
            window.player.wellFedUntil = 0;
            window.grantSkillRank(window.player, 'cooking');
            window.grantSkillRank(window.player, 'cooking');
            window.player.inventory.push('game_meat');
            window.eatFood('game_meat');
            const twoRanksUntil = window.player.wellFedUntil;

            return { noSkillHours: (noSkillUntil - 1000) / 3600, twoRanksHours: (twoRanksUntil - 1000) / 3600 };
        });
        expect(result.noSkillHours).toBe(4);
        expect(result.twoRanksHours).toBe(8);
    });
});
