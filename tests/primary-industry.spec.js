// tests/primary-industry.spec.js
// The human kingdom's primary industry beyond Old Mac's one farm: roaming
// wildlife (deer/wild boar, hunted for game_meat/hide via the existing
// leaveCorpse/harvestCorpse cycle, resources.js) spawned only near the
// player (checkWildlifeEncounter, campaign2Dialogue.js), a wandering Hunter
// NPC who's both flavor/vendor and a worldPulse rumor source, and
// leatherworking — Sil'thandriel's own craft (bows/armor from hide+wood),
// taught by Bowmaster Ellandrie mirroring Kragmoor's Runesmith questline.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('wildlife: deer and wild boar', () => {
    test('deer is harmless wildlife (neutral, isNPC), wild boar is dangerous (enemy)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const deer = window.createMonster('deer', { q: 5, r: 5 }, null, null, 'neutral');
            const boar = window.createMonster('wild_boar', { q: 6, r: 6 }, null, null, 'enemy');
            return {
                deerTags: deer.tags, deerSide: deer.side,
                boarTags: boar.tags, boarSide: boar.side,
                deerHp: deer.maxHp, boarHp: boar.maxHp,
            };
        });
        expect(result.deerTags).toContain('animal');
        expect(result.boarTags).toContain('animal');
        expect(result.deerSide).toBe('neutral');
        expect(result.boarSide).toBe('enemy');
        expect(result.boarHp).toBeGreaterThan(result.deerHp); // boar is the tougher of the two
    });

    test('checkWildlifeEncounter spawns a neutral deer or hostile wild boar near the player', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInCombat = false;
            window.wildlifeEncounterAccum = 0;
            const before = window.entities.length;
            const origRandom = Math.random;
            let call = 0;
            Math.random = () => { call++; return call === 1 ? 0.01 : 0.9; }; // roll succeeds (< 0.35), then isBoar roll fails (deer)
            const farPlayer = { hex: { q: -80, r: 24 }, side: 'player' }; // west of the crossroads, same convention the wolf-encounter tests use
            window.checkWildlifeEncounter(farPlayer, 91);
            Math.random = origRandom;
            const spawned = window.entities.find(e => e.name === 'Deer' && window.entities.indexOf(e) >= before);
            return { grew: window.entities.length > before, spawnedIsDeer: !!spawned, spawnedSide: spawned?.side };
        });
        expect(result.grew).toBe(true);
        expect(result.spawnedIsDeer).toBe(true);
        expect(result.spawnedSide).toBe('neutral');
    });

    test('checkWildlifeEncounter does nothing during combat or before its own interval', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const p = window.entities.find(e => e.side === 'player' && !e.rider);
            const before = window.entities.length;

            window.isInCombat = true;
            window.wildlifeEncounterAccum = 0;
            window.checkWildlifeEncounter(p, 200);
            const duringCombat = window.entities.length;

            window.isInCombat = false;
            window.wildlifeEncounterAccum = 0;
            window.checkWildlifeEncounter(p, 5); // well under the 90s interval
            const tooSoon = window.entities.length;

            return { before, duringCombat, tooSoon };
        });
        expect(result.duringCombat).toBe(result.before);
        expect(result.tooSoon).toBe(result.before);
    });
});

test.describe('Rowan Fletcher: wandering hunter (flavor, rumors, vendor)', () => {
    test('is placed near the crossroads with the right dialogue', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const hunter = window.entities.find(e => e.name === 'Rowan Fletcher');
            return { present: !!hunter, dialogueId: hunter?.dialogueId, race: hunter?.race };
        });
        expect(result.present).toBe(true);
        expect(result.dialogueId).toBe('hollowmere_hunter');
        expect(result.race).toBe('human');
    });

    test('greeting changes with Hollowmere security (wary vs confident)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const hunter = window.entities.find(e => e.name === 'Rowan Fletcher');
            window.regions.hollowmere.security = 10;
            window.npcDialogueTrees.hollowmere_hunter(hunter);
            const waryMsg = document.getElementById('dialogue-message').innerText;

            window.regions.hollowmere.security = 80;
            window.npcDialogueTrees.hollowmere_hunter(hunter);
            const confidentMsg = document.getElementById('dialogue-message').innerText;

            return { waryMsg, confidentMsg };
        });
        expect(result.waryMsg).toMatch(/rough stretch/i);
        expect(result.confidentMsg).toMatch(/good hunting/i);
    });

    test('buys game_meat and hide off the player at a premium over their plain sellPrice', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const hunter = window.entities.find(e => e.name === 'Rowan Fletcher');
            window.player.inventory.push('game_meat', 'game_meat', 'hide');
            window.player.gold = 0;
            window.npcDialogueTrees.hollowmere_hunter(hunter);
            const btn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.innerText.includes('sell'));
            btn.click();
            return {
                gold: window.player.gold,
                meatLeft: window.player.inventory.filter(i => i === 'game_meat').length,
                hideLeft: window.player.inventory.filter(i => i === 'hide').length,
            };
        });
        expect(result.gold).toBe(2 * 5 + 1 * 6); // 2x game_meat @5g + 1x hide @6g
        expect(result.meatLeft).toBe(0);
        expect(result.hideLeft).toBe(0);
    });

    test('surfaces worldPulse rumors via the news option', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const hunter = window.entities.find(e => e.name === 'Rowan Fletcher');
            let requestedCount = null;
            const orig = window.getRecentWorldRumors;
            window.getRecentWorldRumors = (n) => { requestedCount = n; return ['A test rumor.']; };
            window.npcDialogueTrees.hollowmere_hunter(hunter);
            const btn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.innerText.includes('roads'));
            btn.click();
            const msg = document.getElementById('dialogue-message').innerText;
            window.getRecentWorldRumors = orig;
            return { requestedCount, msg };
        });
        expect(result.requestedCount).toBe(2);
        expect(result.msg).toContain('A test rumor.');
    });
});

test.describe('Leatherworking: Sil\'thandriel\'s craft (hunting bow, reinforced leather armor)', () => {
    test('hunting_bow and reinforced_leather_armor exist, are recipe-gated, and never exceed a mundane item\'s tier', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const recipes = Object.entries(window.CRAFTING_RECIPES).filter(([, r]) => r.requiredSkill === 'leatherworking');
            return recipes.map(([id, r]) => {
                const item = window.items[r.resultItemId];
                return {
                    id, hasItem: !!item, noBuyPrice: item && item.buyPrice === undefined,
                    materialsExist: Object.keys(r.materials).every(m => !!window.items[m]),
                    weaponWithinTier: item.type !== 'weapon' || item.damage <= 3,
                    armorWithinTier: item.type !== 'armor' || item.reduction <= 2,
                };
            });
        });
        expect(result.length).toBe(2);
        result.forEach(c => {
            expect(c.hasItem).toBe(true);
            expect(c.noBuyPrice).toBe(true);
            expect(c.materialsExist).toBe(true);
            expect(c.weaponWithinTier).toBe(true);
            expect(c.armorWithinTier).toBe(true);
        });
    });

    test('craftAtForge (self-craft) refuses hunting_bow without the leatherworking skill, succeeds once granted', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.player.inventory.push('hide', 'wood', 'wood');
            window.player.gold = 100;
            const before = window.craftAtForge('hunting_bow');
            window.grantSkillRank(window.player, 'leatherworking');
            const after = window.craftAtForge('hunting_bow');
            return { before, after, hasBow: window.player.inventory.includes('hunting_bow') };
        });
        expect(result.before).toBe(false);
        expect(result.after).toBe(true);
        expect(result.hasBow).toBe(true);
    });

    test('the Bowmaster is placed in Sil\'thandriel and only offers her own (leatherworking) recipes, never runesmithing\'s', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Bowmaster Ellandrie');
            window.factions.elven_realm.standing = 50;
            // Already taught (not offered the teach-quest branch again) so the
            // dialogue falls through to the default crafting-for-hire options.
            window.grantSkillRank(window.player, 'leatherworking');
            window.npcDialogueTrees.sylvan_bowmaster(npc);
            const craftBtn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.innerText.includes('Make me something'));
            craftBtn.click();
            const options = Array.from(document.querySelectorAll('#dialogue-options button')).map(b => b.innerText);
            return { present: !!npc, dialogueId: npc?.dialogueId, options };
        });
        expect(result.present).toBe(true);
        expect(result.dialogueId).toBe('sylvan_bowmaster');
        expect(result.options.some(o => o.includes('Hunting Bow') || o.includes('Reinforced Leather Armor'))).toBe(true);
        expect(result.options.some(o => o.includes('Starforged') || o.includes('Dragonscale') || o.includes('Deep Crystal'))).toBe(false);
    });

    test('an elf PC is offered the teaching quest with only 1x hide/1x wood, no reputation gate beyond trust', async ({ page }) => {
        await createCharacter(page, { campaign: '2', race: 'elf' });
        const result = await page.evaluate(() => {
            window.party[0].race = 'elf';
            window.factions.elven_realm.standing = 10;
            const npc = window.entities.find(e => e.name === 'Bowmaster Ellandrie');
            window.npcDialogueTrees.sylvan_bowmaster(npc);
            const teachQuest = (window.questLog || []).find(q => q.id === 'sylvan_bowmaster_teach');
            return { teachQuestAdded: !!teachQuest, description: teachQuest && teachQuest.description };
        });
        expect(result.teachQuestAdded).toBe(true);
        expect(result.description).toMatch(/1x hide/);
    });

    test('a non-elf PC needs standing 30+ (not just trust) and 2x hide/2x wood to be offered the teaching quest', async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        const result = await page.evaluate(() => {
            window.party[0].race = 'human';
            const npc = window.entities.find(e => e.name === 'Bowmaster Ellandrie');
            window.factions.elven_realm.standing = 15; // trusted, but below the teaching threshold
            window.npcDialogueTrees.sylvan_bowmaster(npc);
            const teachQuestAtLowStanding = (window.questLog || []).some(q => q.id === 'sylvan_bowmaster_teach');

            window.factions.elven_realm.standing = 30;
            window.npcDialogueTrees.sylvan_bowmaster(npc);
            const teachQuest = (window.questLog || []).find(q => q.id === 'sylvan_bowmaster_teach');
            return { teachQuestAtLowStanding, teachQuestAdded: !!teachQuest, description: teachQuest && teachQuest.description };
        });
        expect(result.teachQuestAtLowStanding).toBe(false);
        expect(result.teachQuestAdded).toBe(true);
        expect(result.description).toMatch(/2x hide/);
    });

    test('completing the teaching quest consumes exact materials and grants leatherworking', async ({ page }) => {
        await createCharacter(page, { campaign: '2', race: 'elf' });
        const result = await page.evaluate(() => {
            window.party[0].race = 'elf';
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'sylvan_bowmaster_teach', title: 'The Bow Remembers the Hand', giver: 'Bowmaster Ellandrie', status: 'active' });
            window.party[0].inventory.push('hide', 'wood', 'wood'); // one extra wood, should stay untouched
            const npc = window.entities.find(e => e.name === 'Bowmaster Ellandrie');
            window.npcDialogueTrees.sylvan_bowmaster(npc);
            const btn = Array.from(document.querySelectorAll('#dialogue-options button')).find(b => b.innerText.includes('Here —'));
            btn.click();
            return {
                learned: !!window.player.skills.leatherworking,
                hideLeft: window.party[0].inventory.filter(i => i === 'hide').length,
                woodLeft: window.party[0].inventory.filter(i => i === 'wood').length,
                questStatus: window.questLog.find(q => q.id === 'sylvan_bowmaster_teach')?.status,
            };
        });
        expect(result.learned).toBe(true);
        expect(result.hideLeft).toBe(0);
        expect(result.woodLeft).toBe(1); // only 1 consumed (elf discount), 1 left over
        expect(result.questStatus).toBe('completed');
    });
});
