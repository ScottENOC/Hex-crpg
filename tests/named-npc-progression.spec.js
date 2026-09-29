const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Authored named humanoid progression', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.NPCProgression && !!window.AUTHORED_NAMED_NPC_BUILDS);
    });

    test('Arena bosses have stable authored race/class identities', async ({ page }) => {
        const result = await page.evaluate(() => {
            const names = ['Grishnak', 'Sir Alistair', 'Viper', 'Krog the Unstoppable', 'Sylvara the Huntress'];
            const configs = {};
            for (const name of names) {
                const c = arenaBosses[name];
                configs[name] = {
                    race: c.race,
                    gender: c.gender,
                    classLevels: [...(c.classLevels || [])],
                    skillPicks: [...(c.skillPicks || [])],
                    expValue: c.expValue,
                };
            }
            return configs;
        });

        expect(result.Grishnak.race).toBe('orc');
        expect(result.Grishnak.classLevels).toEqual(['wizard']);
        expect(result['Sir Alistair'].classLevels).toEqual(['fighter', 'fighter', 'cleric']);
        expect(result.Viper.race).toBe('goblin');
        expect(result.Viper.classLevels).toEqual(['rogue', 'fighter']);
        expect(result['Krog the Unstoppable'].race).toBe('troll');
        expect(result['Krog the Unstoppable'].classLevels).toEqual(['fighter']);
        expect(result['Sylvara the Huntress'].race).toBe('goblin');
        expect(result['Sylvara the Huntress'].classLevels).toEqual(['druid']);
        expect(result['Sylvara the Huntress'].skillPicks).not.toContain('elf_bow_range');
        expect(result.Grishnak.expValue).toBeGreaterThan(0);
    });

    test('Grishnak legally learns his magic and light armour', async ({ page }) => {
        const result = await page.evaluate(() => {
            const c = arenaBosses.Grishnak;
            const boss = window.buildNPC({
                name: 'Grishnak', race: c.race, gender: c.gender,
                hex: { q: 300, r: 300 }, classLevels: c.classLevels,
                skillPicks: c.skillPicks, equipment: c.equipment,
                side: 'enemy', color: c.color, expValue: c.expValue,
            });
            return window.NPCProgression.describeBuild(boss);
        });

        expect(result.race).toBe('orc');
        expect(result.classLevels).toEqual(['wizard']);
        expect(result.skills.learn_firebolt).toBe(1);
        expect(result.skills.learn_counterspell).toBe(1);
        expect(result.skills.light_armor_training).toBe(1);
        expect(result.equipmentWarnings).toEqual([]);
    });

    test('Viper is a Rogue-priority Rogue/Fighter and pays for armour', async ({ page }) => {
        const result = await page.evaluate(() => {
            const c = arenaBosses.Viper;
            const boss = window.buildNPC({
                name: 'Viper', race: c.race, gender: c.gender,
                hex: { q: 301, r: 300 }, classLevels: c.classLevels,
                skillPicks: c.skillPicks, equipment: c.equipment,
                side: 'enemy', color: c.color, expValue: c.expValue,
            });
            return window.NPCProgression.describeBuild(boss);
        });

        expect(result.classPackage).toBe('rogue/fighter');
        expect(result.classLevels).toEqual(['rogue', 'fighter']);
        expect(result.skills.light_armor_training).toBe(1);
        expect(result.skills.dagger_hit || 0).toBeGreaterThan(0);
        expect(result.skills.stealth_rogue || 0).toBeGreaterThan(0);
        expect(result.equipmentWarnings).toEqual([]);
    });

    test('Krog keeps troll regeneration as innate while using Fighter progression', async ({ page }) => {
        const result = await page.evaluate(() => {
            const c = arenaBosses['Krog the Unstoppable'];
            const boss = window.buildNPC({
                name: 'Krog the Unstoppable', race: c.race, gender: c.gender,
                hex: { q: 302, r: 300 }, classLevels: c.classLevels,
                skillPicks: c.skillPicks, equipment: c.equipment,
                side: 'enemy', color: c.color, expValue: c.expValue,
            });
            return {
                build: window.NPCProgression.describeBuild(boss),
                innate: { ...(boss.npcInnateSkills || {}) },
                riderSize: boss.riderSize,
                extraHexes: boss.extraHexes?.length || 0,
            };
        });

        expect(result.build.race).toBe('troll');
        expect(result.build.classLevels).toEqual(['fighter']);
        expect(result.innate.regeneration).toBe(1);
        expect(result.riderSize).toBe(6);
        expect(result.extraHexes).toBe(2);
    });

    test('Sylvara is a legal goblin druid rather than borrowing an elf racial skill', async ({ page }) => {
        const result = await page.evaluate(() => {
            const c = arenaBosses['Sylvara the Huntress'];
            const boss = window.buildNPC({
                name: 'Sylvara the Huntress', race: c.race, gender: c.gender,
                hex: { q: 303, r: 300 }, classLevels: c.classLevels,
                skillPicks: c.skillPicks, equipment: c.equipment,
                side: 'enemy', color: c.color, expValue: c.expValue,
            });
            return window.NPCProgression.describeBuild(boss);
        });

        expect(result.race).toBe('goblin');
        expect(result.classLevels).toEqual(['druid']);
        expect(result.skills.learn_summon_animal).toBe(1);
        expect(result.skills.learn_tiger_summon).toBe(1);
        expect(result.skills.riding_druid).toBe(1);
        expect(result.skills.riding || 0).toBe(0);
        expect(result.skills.elf_bow_range || 0).toBe(0);
        expect(result.skills.light_armor_training).toBe(1);
        expect(result.equipmentWarnings).toEqual([]);
    });

    test('named campaign greenskins expose explicit race/class data and rebuild from it', async ({ page }) => {
        const result = await page.evaluate(() => {
            const specs = {
                chief: window.campaign2GoblinChief,
                nix: window.campaign2GoblinLieutenant,
                shaman: window.campaign2GoblinShaman,
                warlord: window.campaign2OrcWarlord,
            };
            const spawned = {};
            let i = 0;
            for (const [key, spec] of Object.entries(specs)) {
                const ent = window.createMonster(
                    spec.monsterType,
                    { q: 320 + i++, r: 320 },
                    spec.customSkills,
                    spec.customEquipment,
                    'neutral'
                );
                spawned[key] = window.NPCProgression.describeBuild(ent);
            }
            return {
                specs: Object.fromEntries(Object.entries(specs).map(([key, spec]) => [key, {
                    race: spec.race,
                    classLevels: [...spec.classLevels],
                    skillPicks: [...spec.skillPicks],
                    authoredProgression: spec.authoredProgression,
                }])),
                spawned,
            };
        });

        expect(result.specs.chief.race).toBe('goblin');
        expect(result.specs.chief.classLevels).toEqual(['fighter']);
        expect(result.specs.nix.classLevels).toEqual(['rogue', 'fighter']);
        expect(result.specs.shaman.classLevels).toEqual(['cleric']);
        expect(result.specs.warlord.race).toBe('orc');
        expect(result.specs.warlord.classLevels).toEqual(['fighter']);
        expect(result.specs.chief.authoredProgression).toBe(true);

        expect(result.spawned.chief.classLevels).toEqual(['fighter']);
        expect(result.spawned.nix.classLevels).toEqual(['rogue', 'fighter']);
        expect(result.spawned.shaman.classLevels).toEqual(['cleric']);
        expect(result.spawned.shaman.skills.learn_heal).toBe(1);
        expect(result.spawned.warlord.classLevels).toEqual(['fighter']);
        expect(result.spawned.warlord.skills.heavy_armor_training).toBe(1);
        expect(result.spawned.warlord.equipmentWarnings).toEqual([]);
    });
});
