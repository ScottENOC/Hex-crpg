// tests/wider-world.spec.js
// XP/gold rewards for kills and quests, the crossroads/signpost/roads, the
// time-gated missing-child wilderness quest, and the Knowledge: Nature skill.
const { test, expect } = require('@playwright/test');
const { createCharacter, resolveShakedownDirectly } = require('./helpers');

test.describe('XP and gold rewards', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('killing a humanoid enemy (Dray) grants XP, gold, and loots their equipment', async ({ page }) => {
        await resolveShakedownDirectly(page, 'fight');
        const result = await page.evaluate(() => {
            const expBefore = window.player.exp;
            const goldBefore = window.player.gold;
            const dray = window.entities.find(e => e.name === 'Dray Coltayne');
            dray.hp = -(dray.maxHp);
            window.handleLethalDamage(dray, { side: 'player', name: 'Test' });
            return {
                expGained: window.player.exp - expBefore,
                goldGained: window.player.gold - goldBefore,
                lootedSword: window.player.inventory.includes('sword'),
                lootedArmor: window.player.inventory.includes('medium_armor'),
            };
        });
        expect(result.expGained).toBe(300);
        expect(result.goldGained).toBe(15);
        expect(result.lootedSword).toBe(true);
        expect(result.lootedArmor).toBe(true);
    });

    test("A Missing Locket and Oskar's Wager both grant XP on completion", async ({ page }) => {
        const locketExp = await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'elder_locket', title: 'A Missing Locket', giver: 'Elder Marta Wynfield', status: 'active', description: '' });
            window.party[0].inventory.push('elder_locket');
            const before = window.player.exp;
            window.npcDialogueTrees.marta_wynfield(window.entities.find(e => e.name === 'Elder Marta Wynfield'));
            document.querySelector('#dialogue-options button').click(); // "Here you go."
            return window.player.exp - before;
        });
        expect(locketExp).toBe(100);

        const oskarExp = await page.evaluate(() => {
            const before = window.player.exp;
            window.startOskarDuel();
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            oskar.hp = Math.floor(oskar.maxHp * 0.5);
            window.updateTime(0); // real watcher path (worldTime.js), same as quests.spec.js
            return window.player.exp - before;
        });
        expect(oskarExp).toBe(50);
    });
});

test.describe('crossroads, signpost, and roads', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('the signpost names all four destinations', async ({ page }) => {
        await page.evaluate(() => window.readSignpost());
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        const text = await page.evaluate(() => document.getElementById('dialogue-message').innerText);
        expect(text).toContain('Millbrook');
        expect(text).toContain('Silverhart');
        expect(text).toContain("Old Mac's Farmstead");
        expect(text).toContain('Reddale');
        expect(text.toLowerCase()).toContain('skull and crossbones');
    });

    test('four roads run out from the crossroads toward the edges of the world hex', async ({ page }) => {
        const found = await page.evaluate(() => {
            const findPathNear = (q, r, radius) => {
                for (let dq = -radius; dq <= radius; dq++)
                    for (let dr = -radius; dr <= radius; dr++)
                        if (window.getTerrainAt(q + dq, r + dr).name === 'Path') return true;
                return false;
            };
            const cp = window.campaign2Landmarks.crossroads;
            return {
                crossroadsIsPath: window.getTerrainAt(cp.q, cp.r).name === 'Path',
                north: findPathNear(cp.q, cp.r - 100, 3),
                south: findPathNear(cp.q, cp.r + 126, 3),
                east: findPathNear(cp.q + 124, cp.r, 3),
                west: findPathNear(cp.q - 124, cp.r, 3),
            };
        });
        expect(found.crossroadsIsPath).toBe(true);
        expect(found.north).toBe(true);
        expect(found.south).toBe(true);
        expect(found.east).toBe(true);
        expect(found.west).toBe(true);
    });
});

test.describe('The Missing Boy (time-gated wilderness quest)', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.npcDialogueTrees.hendra_wells(window.entities.find(e => e.name === 'Hendra Wells'));
            document.querySelector('#dialogue-options button').click(); // "I'll go look for him."
        });
    });

    test('within 3 days, Tam is found alive under attack by wolves; rescue grants the full reward', async ({ page }) => {
        const encounter = await page.evaluate(() => {
            window.triggerMissingChildEncounter();
            const wolves = window.entities.filter(e => e.name === 'Wolf');
            const tam = window.entities.find(e => e.name === 'Tam Wells');
            return {
                encounterState: window.questLog.find(q => q.id === 'missing_child').encounterState,
                wolfCount: wolves.length,
                wolvesHostile: wolves.every(w => w.side === 'enemy' && w.aiState === 'combat'),
                tamAlive: !!tam && tam.alive,
                tamSide: tam?.side,
            };
        });
        expect(encounter.encounterState).toBe('wolves');
        expect(encounter.wolfCount).toBe(2);
        expect(encounter.wolvesHostile).toBe(true);
        expect(encounter.tamAlive).toBe(true);
        expect(encounter.tamSide).toBe('neutral'); // never a valid wolf target (opponents filter is exact-side match)

        const turnIn = await page.evaluate(() => {
            const before = { gold: window.party[0].gold, exp: window.player.exp };
            window.npcDialogueTrees.hendra_wells(window.entities.find(e => e.name === 'Hendra Wells'));
            document.querySelector('#dialogue-options button').click(); // "Found him just in time."
            return {
                goldGained: window.party[0].gold - before.gold,
                expGained: window.player.exp - before.exp,
                status: window.questLog.find(q => q.id === 'missing_child').status,
            };
        });
        expect(turnIn.goldGained).toBe(30);
        expect(turnIn.expGained).toBe(200);
        expect(turnIn.status).toBe('completed');
    });

    test('after 3 days, only a corpse is found; reporting back grants a lesser reward', async ({ page }) => {
        const encounter = await page.evaluate(() => {
            const quest = window.questLog.find(q => q.id === 'missing_child');
            quest.offeredAt = window.worldSeconds - 4 * 24 * 3600; // 4 in-game days ago
            window.triggerMissingChildEncounter();
            return {
                encounterState: quest.encounterState,
                tamSpawned: !!window.entities.find(e => e.name === 'Tam Wells'),
                markerPlaced: window.tileObjects[`${window.campaign2TamEncounterHex.q},${window.campaign2TamEncounterHex.r}`]?.type === 'corpse_marker',
            };
        });
        expect(encounter.encounterState).toBe('corpse');
        expect(encounter.tamSpawned).toBe(false); // no rescue possible, nothing to fight
        expect(encounter.markerPlaced).toBe(true);

        const turnIn = await page.evaluate(() => {
            const before = { gold: window.party[0].gold, exp: window.player.exp };
            window.npcDialogueTrees.hendra_wells(window.entities.find(e => e.name === 'Hendra Wells'));
            document.querySelector('#dialogue-options button').click(); // "I'm so sorry."
            return {
                goldGained: window.party[0].gold - before.gold,
                expGained: window.player.exp - before.exp,
                status: window.questLog.find(q => q.id === 'missing_child').status,
            };
        });
        expect(turnIn.goldGained).toBe(10);
        expect(turnIn.expGained).toBe(80);
        expect(turnIn.status).toBe('completed');
    });

    test('finding the corpse with Knowledge: Nature identifies wolves specifically; without it, the cause is vague', async ({ page }) => {
        const withoutSkill = await page.evaluate(() => {
            const quest = window.questLog.find(q => q.id === 'missing_child');
            quest.offeredAt = window.worldSeconds - 4 * 24 * 3600;
            window.triggerMissingChildEncounter();
            const log = document.getElementById('message-log');
            return log.lastElementChild.innerText;
        });
        expect(withoutSkill.toLowerCase()).not.toContain('wolf tracks');

        const withSkill = await page.evaluate(() => {
            // Reset and retry with a party member who has the skill.
            window.questLog = window.questLog.filter(q => q.id !== 'missing_child');
            window.tileObjects = {};
            window.questLog.push({ id: 'missing_child', title: 'The Missing Boy', giver: 'Hendra Wells', status: 'active', description: '', offeredAt: window.worldSeconds - 4 * 24 * 3600 });
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.elf_knowledge_nature = 1;
            window.triggerMissingChildEncounter();
            const log = document.getElementById('message-log');
            return log.lastElementChild.innerText;
        });
        expect(withSkill.toLowerCase()).toContain('wolf tracks');
    });
});

test.describe('Knowledge: Nature skill definition', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('exists in both the druid and elf trees, mutually anti-prerequisite, and hasKnowledgeNature checks either', async ({ page }) => {
        const result = await page.evaluate(() => ({
            druidTree: window.skills.druid_knowledge_nature.tree,
            elfTree: window.skills.elf_knowledge_nature.tree,
            druidAnti: window.skills.druid_knowledge_nature.anti_prereq,
            elfAnti: window.skills.elf_knowledge_nature.anti_prereq,
            checkDruid: window.hasKnowledgeNature({ skills: { druid_knowledge_nature: 1 } }),
            checkElf: window.hasKnowledgeNature({ skills: { elf_knowledge_nature: 1 } }),
            checkNeither: window.hasKnowledgeNature({ skills: {} }),
        }));
        expect(result.druidTree).toBe('druid');
        expect(result.elfTree).toBe('elf');
        expect(result.druidAnti).toBe('elf_knowledge_nature');
        expect(result.elfAnti).toBe('druid_knowledge_nature');
        expect(result.checkDruid).toBe(true);
        expect(result.checkElf).toBe(true);
        expect(result.checkNeither).toBe(false);
    });
});
