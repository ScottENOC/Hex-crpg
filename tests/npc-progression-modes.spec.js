const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('NPC progression modes and canonical companions', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.NPC_PROGRESSION_MODES && !!window.CANONICAL_COMPANION_BUILDS);
    });

    test('explicit empty class history means civilian, not a random adventurer', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = window.buildNPC({
                name: 'Regression Civilian', title: 'Clerk', race: 'human', gender: 'male',
                hex: { q: 400, r: 400 }, classLevels: [], skillPicks: [], equipment: [], side: 'neutral',
            });
            return {
                mode: npc.npcProgressionMode,
                classLevels: npc.classLevels,
                classPackage: npc.npcClassPackage,
                skills: npc.skills,
                unspent: Object.values(npc.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0),
            };
        });

        expect(result.mode).toBe('civilian');
        expect(result.classLevels).toEqual([]);
        expect(result.classPackage).toBeNull();
        expect(result.skills).toEqual({});
        expect(result.unspent).toBe(0);
    });

    test('authored combatants spend every available point while keeping legal equipment', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = window.buildNPC({
                name: 'Regression Veteran', race: 'human', gender: 'female', hex: { q: 410, r: 410 },
                progressionMode: 'authored', level: 4,
                classLevels: ['fighter', 'fighter', 'fighter', 'fighter'],
                skillPicks: ['health', 'health', 'sword_hit', 'sword_dmg', 'sword_parry'],
                equipment: ['sword', 'heavy_armor', 'wooden_shield'], side: 'enemy',
            });
            return window.NPCProgression.describeBuild(npc);
        });

        expect(result.level).toBe(4);
        expect(result.unspentTotal).toBe(0);
        expect(result.equipmentWarnings).toEqual([]);
        expect(result.skills.light_armor_training).toBe(1);
        expect(result.skills.medium_armor_training).toBe(1);
        expect(result.skills.heavy_armor_training).toBe(1);
        expect(result.skills.sword_hit).toBeGreaterThan(0);
        expect(result.skills.axe_hit || 0).toBe(0);
    });

    test('population humanoids also finish with zero unspent points', async ({ page }) => {
        const result = await page.evaluate(() => {
            const builds = [];
            for (let i = 0; i < 20; i++) {
                const goblin = window.createMonster('goblin', { q: 500 + i, r: -500 - i }, null, [], 'enemy');
                builds.push({
                    mode: goblin.npcProgressionMode,
                    classes: [...(goblin.classLevels || [])],
                    unspent: Object.values(goblin.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0),
                    warnings: goblin.npcProgressionWarnings || [],
                });
            }
            return builds;
        });

        expect(result.every(b => b.mode === 'population')).toBe(true);
        expect(result.every(b => b.classes.length > 0)).toBe(true);
        expect(result.every(b => b.unspent === 0)).toBe(true);
        expect(result.every(b => !b.warnings.some(w => w.type === 'unspent_skill_points'))).toBe(true);
    });

    test('all canonical companions have authored class histories and spend every point', async ({ page }) => {
        const result = await page.evaluate(() => Object.keys(window.CANONICAL_COMPANION_BUILDS).map(name => {
            const data = window.buildCanonicalCompanionData(name);
            return {
                name,
                mode: data.npcProgressionMode,
                sequence: data.classLevelSequence,
                counts: data.classLevels,
                unspent: Object.values(data.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0),
                warnings: data.npcProgressionWarnings || [],
                skills: data.skills,
            };
        }));

        for (const build of result) {
            expect(build.mode, build.name).toBe('authored');
            expect(build.sequence.length, build.name).toBeGreaterThan(0);
            expect(build.unspent, build.name).toBe(0);
            expect(build.warnings.some(w => w.type === 'unspent_skill_points'), build.name).toBe(false);
        }
    });

    test('Ser Aldric is genuinely Fighter 1 / Cleric 1 and keeps his paladin identity', async ({ page }) => {
        const result = await page.evaluate(() => {
            const data = window.buildCanonicalCompanionData('Ser Aldric Thorne');
            return {
                sequence: data.classLevelSequence,
                counts: data.classLevels,
                skills: data.skills,
                weapon: data.equipped.weapon,
                offhand: data.equipped.offhand,
                unspent: Object.values(data.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0),
            };
        });

        expect(result.sequence).toEqual(['fighter', 'cleric']);
        expect(result.counts).toEqual({ fighter: 1, cleric: 1 });
        expect(result.skills.learn_heal).toBe(1);
        expect(result.skills.sword_hit).toBeGreaterThan(0);
        expect(result.weapon).toBe('sword');
        expect(result.offhand).toBe('wooden_shield');
        expect(result.unspent).toBe(0);
    });

    test('NPC-side and party-side forms use the same canonical build', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = new window.Enemy('Reyna Fletcher', '#6a4a2a', { q: 520, r: 520 }, 10, 10, 0);
            npc.side = 'neutral';
            npc.inventory = [];
            npc.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            window.applyCanonicalCompanionEntityBuild(npc, 'Reyna Fletcher');
            const partyData = window.buildCanonicalCompanionData('Reyna Fletcher');
            return {
                npcSequence: [...npc.classLevels],
                partySequence: partyData.classLevelSequence,
                npcBow: npc.skills?.bow_hit || 0,
                partyBow: partyData.skills?.bow_hit || 0,
                npcUnspent: Object.values(npc.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0),
                partyUnspent: Object.values(partyData.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0),
            };
        });

        expect(result.npcSequence).toEqual(['fighter']);
        expect(result.partySequence).toEqual(['fighter']);
        expect(result.npcBow).toBeGreaterThan(0);
        expect(result.partyBow).toBeGreaterThan(0);
        expect(result.npcUnspent).toBe(0);
        expect(result.partyUnspent).toBe(0);
    });
});
