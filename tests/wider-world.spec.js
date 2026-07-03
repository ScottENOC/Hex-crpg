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

    test('regression: the north road does not overwrite the tavern\'s east wall', async ({ page }) => {
        // The tavern's wall ring is now built from true hex adjacency around a
        // row-shifted floor (see hexRowShift/wallRingAroundFloor in
        // campaign2World.js) rather than a fixed row range, so instead of
        // asserting exact wall coordinates, check the actual invariant: no
        // floor hex is directly adjacent to outdoor terrain (Grass/Path)
        // without a Wall (or a door) between them.
        const wallIntact = await page.evaluate(() => {
            for (let q = -5; q <= 5; q++) {
                const shift = window.hexRowShift ? window.hexRowShift(q) : 0;
                for (let r = -3; r <= 3; r++) {
                    const fr = r + shift;
                    const neighbors = window.getNeighbors(q, fr);
                    for (const n of neighbors) {
                        const t = window.getTerrainAt(n.q, n.r).name;
                        const isDoor = window.tileObjects[`${n.q},${n.r}`]?.type?.startsWith('door');
                        if (t === 'Grass' || (t === 'Path' && !isDoor)) return false;
                    }
                }
            }
            return true;
        });
        expect(wallIntact).toBe(true);
    });

    test('regression: roads are fully contiguous (no hex-skipping gaps from the wiggle)', async ({ page }) => {
        // Walk 100 hexes north from the crossroads; at every step, some hex
        // within a small radius must be Path — a real gap (nothing painted
        // for that whole row) would mean the wiggle jumped a column.
        const gaps = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            let gapCount = 0;
            for (let i = 1; i <= 100; i++) {
                const r = cp.r - i;
                let found = false;
                for (let dq = -2; dq <= 2 && !found; dq++) {
                    if (window.getTerrainAt(cp.q + dq, r).name === 'Path') found = true;
                }
                if (!found) gapCount++;
            }
            return gapCount;
        });
        expect(gaps).toBe(0);
    });

    test('regression: a stream north of the village is crossed by a bridge where the north road passes', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            return {
                streamHasWater: window.getTerrainAt(cp.q - 15, -25).name === 'Water',
                bridgeIsPath: window.getTerrainAt(cp.q, -25).name === 'Path',
            };
        });
        expect(result.streamHasWater).toBe(true);
        expect(result.bridgeIsPath).toBe(true);
    });

    test('roads near the village stay straight, but wiggle once well clear of it', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            // Within the first ~15 hexes (the village-approach stretch), the
            // north road should sit exactly on the centerline column.
            let straightNearVillage = true;
            for (let i = 1; i <= 15; i++) {
                if (window.getTerrainAt(cp.q, cp.r - i).name !== 'Path') { straightNearVillage = false; break; }
            }
            // Further out, the road should have drifted off that exact
            // column at least once (a real wiggle, not just occasional bumps).
            let everOffCenter = false;
            for (let i = 20; i <= 100; i++) {
                if (window.getTerrainAt(cp.q, cp.r - i).name !== 'Path') { everOffCenter = true; break; }
            }
            return { straightNearVillage, everOffCenter };
        });
        expect(result.straightNearVillage).toBe(true);
        expect(result.everOffCenter).toBe(true);
    });

    test('the stream widens to more than 1 hex in places, further from the village, and stays gapless with no more than 3 hexes of width per column', async ({ page }) => {
        const result = await page.evaluate(() => {
            let gapCount = 0;
            let sawWidthGreaterThan1 = false;
            let maxWidthSeen = 0;
            let prevCenter = null;
            let discontiguous = 0;
            for (let q = 29; q <= 70; q++) {
                const waterRs = [];
                for (let r = -35; r <= -15; r++) {
                    if (window.getTerrainAt(q, r).name === 'Water') waterRs.push(r);
                }
                if (waterRs.length === 0) { gapCount++; continue; }
                if (waterRs.length > 1) sawWidthGreaterThan1 = true;
                maxWidthSeen = Math.max(maxWidthSeen, waterRs.length);
                if (prevCenter !== null && Math.abs(waterRs[0] - prevCenter) > 1) discontiguous++;
                prevCenter = waterRs[0];
            }
            return { gapCount, sawWidthGreaterThan1, maxWidthSeen, discontiguous };
        });
        expect(result.gapCount).toBe(0);
        expect(result.discontiguous).toBe(0);
        expect(result.sawWidthGreaterThan1).toBe(true);
        expect(result.maxWidthSeen).toBeLessThanOrEqual(3);
    });

    test('regression: forest is scattered clumps, not a straight-line noise artifact', async ({ page }) => {
        // A raw sin()-plane-wave noise produces long, perfectly straight runs
        // of Forest along one diagonal. Check no single row has forest in
        // every hex across a wide span (which the old bug would produce).
        const hasFullRowOfForest = await page.evaluate(() => {
            for (let r = -20; r <= 20; r++) {
                let allForest = true;
                for (let q = -15; q <= 15; q++) {
                    if (window.getTerrainAt(q, r).name !== 'Forest') { allForest = false; break; }
                }
                if (allForest) return true;
            }
            return false;
        });
        expect(hasFullRowOfForest).toBe(false);
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
