const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('PC-style humanoid NPC progression', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.NPCProgression && !!window.NPCProgressionPolicy);
    });

    test('goblin population uses discrete weighted class packages, not independent per-level rolls', async ({ page }) => {
        const result = await page.evaluate(() => {
            const profile = window.NPCProgression.RACE_PROFILES.goblin.packages;
            const level3 = window.NPCProgression.expandClassPackage(
                { id: 'rogue/wizard', classes: ['rogue', 'wizard'], primary: 'rogue' }, 3
            );
            const seen = new Set();
            for (let i = 0; i < 80; i++) {
                const g = window.createMonster('goblin', { q: 100 + i, r: -100 - i }, null, [], 'enemy');
                seen.add(g.npcClassPackage?.id);
            }
            return { profile, level3, seen: [...seen] };
        });

        expect(result.profile).toEqual([
            ['rogue', 25],
            ['rogue/fighter', 25],
            ['rogue/wizard', 25],
            ['wizard', 12.5],
            ['fighter/cleric', 12.5],
        ]);
        expect(result.level3).toEqual(['rogue', 'wizard', 'rogue']);
        expect(result.seen.length).toBeGreaterThan(2);
        expect(result.seen).toContain('rogue/wizard');
        expect(result.seen).toContain('fighter/cleric');
    });

    test('races without racial trees convert the racial point into a second primary-class point', async ({ page }) => {
        const result = await page.evaluate(() => {
            const human = window.NPCProgression.buildAttributes('human', ['fighter']);
            const goblin = window.NPCProgression.buildAttributes('goblin', ['rogue']);
            const ogre = window.NPCProgression.buildAttributes('ogre', ['fighter']);
            return {
                humanFighter: human.fighter,
                humanWildcard: human.wildcard,
                goblinRacial: goblin.goblin,
                goblinRogue: goblin.rogue,
                goblinBudget: window.NPCProgression.totalAttributePoints(goblin),
                ogreBudget: window.NPCProgression.totalAttributePoints(ogre),
            };
        });

        expect(result.humanFighter).toBe(2);
        expect(result.humanWildcard).toBe(0);
        expect(result.goblinRacial).toBe(1);
        expect(result.goblinRogue).toBe(1);
        expect(result.ogreBudget).toBeGreaterThan(result.goblinBudget);
    });

    test('equipment drives legal skill choices rather than free proficiency', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = window.buildNPC({
                name: 'Regression Swordguard',
                race: 'human', gender: 'male', hex: { q: 210, r: 210 },
                classLevels: ['rogue'],
                skillPicks: ['stealth_rogue'],
                equipment: ['sword', 'heavy_armor'],
                side: 'enemy',
            });
            return window.NPCProgression.describeBuild(npc);
        });

        expect(result.classPackage).toBe('rogue/fighter');
        expect(result.classLevels).toContain('fighter');
        expect(result.skills.light_armor_training).toBe(1);
        expect(result.skills.medium_armor_training).toBe(1);
        expect(result.skills.heavy_armor_training).toBe(1);
        expect(result.skills.sword_hit).toBeGreaterThan(0);
        expect(result.skills.axe_hit || 0).toBe(0);
        expect(result.equipmentWarnings).toEqual([]);
    });

    test('caster classes buy a spell as a must-have', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wizard = window.buildNPC({
                name: 'Regression Wizard',
                race: 'human', gender: 'female', hex: { q: 220, r: 220 },
                classLevels: ['wizard'],
                skillPicks: [], equipment: ['dagger'], side: 'enemy',
            });
            const cleric = window.buildNPC({
                name: 'Regression Cleric',
                race: 'human', gender: 'male', hex: { q: 221, r: 220 },
                classLevels: ['cleric'],
                skillPicks: [], equipment: ['club'], side: 'enemy',
            });
            return {
                wizardSpell: wizard.skills.learn_firebolt || 0,
                clericSpell: cleric.skills.learn_heal || 0,
                wizardBook: (wizard.createdSpells || []).map(s => s.baseId),
                clericBook: (cleric.createdSpells || []).map(s => s.baseId),
            };
        });

        expect(result.wizardSpell).toBe(1);
        expect(result.clericSpell).toBe(1);
        expect(result.wizardBook).toContain('firebolt');
        expect(result.clericBook).toContain('heal');
    });

    test('legacy authored class counts collapse to the nearest legal skill-point level', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = window.buildNPC({
                name: 'Regression Veteran',
                race: 'human', gender: 'male', hex: { q: 230, r: 230 },
                classLevels: ['fighter', 'fighter', 'fighter'],
                skillPicks: ['health', 'sword_hit', 'sword_dmg'],
                equipment: ['sword'], side: 'enemy',
            });
            return window.NPCProgression.describeBuild(npc);
        });

        expect(result.legacySkillPointTarget).toBe(3);
        expect(result.level).toBe(1);
        expect(result.classLevels).toEqual(['fighter']);
        expect(result.generatedSkillPointBudget).toBeGreaterThanOrEqual(result.legacySkillPointTarget);
    });

    test('generic ogres and other humanoid monsters now carry real race/class histories', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ogre = window.createMonster('ogre', { q: 240, r: 240 }, null, null, 'enemy');
            const goblin = window.createMonster('goblin', { q: 241, r: 240 }, null, [], 'enemy');
            return {
                ogre: window.NPCProgression.describeBuild(ogre),
                goblin: window.NPCProgression.describeBuild(goblin),
            };
        });

        expect(result.ogre.race).toBe('ogre');
        expect(result.ogre.classLevels.length).toBeGreaterThan(0);
        expect(result.ogre.generatedSkillPointBudget).toBeGreaterThan(result.goblin.generatedSkillPointBudget);
        expect(result.goblin.race).toBe('goblin');
        expect(result.goblin.classLevels.length).toBeGreaterThan(0);
    });
});
