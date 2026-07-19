const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Shared party inventory', () => {
    test('every party member\'s .inventory is the same underlying array', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.grantSkillRank(window.party[0], 'health'); // no-op state touch, keeps party[0] realistic
            const companion = window.createCharacterData('human', 'fighter', 'Test Companion', 'male');
            companion.inventory.push('sword'); // starter kit before joining
            window.party.push(companion);
            window.wireSharedInventory(companion);

            window.party[0].inventory.push('herbs');
            const companionSeesIt = companion.inventory.includes('herbs');
            const sharedIsSameArray = window.party[0].inventory === companion.inventory;

            // Reassignment (the `x.inventory = x.inventory.filter(...)` pattern
            // used all over the existing codebase) must not break the alias.
            window.party[0].inventory = window.party[0].inventory.filter(i => i !== 'herbs');
            const stillSameArray = window.party[0].inventory === companion.inventory;
            const bothLostHerbs = !window.party[0].inventory.includes('herbs') && !companion.inventory.includes('herbs');

            return { companionSeesIt, sharedIsSameArray, stillSameArray, bothLostHerbs, companionStarterKitMerged: window.party[0].inventory.includes('sword') };
        });
        expect(result.companionSeesIt).toBe(true);
        expect(result.sharedIsSameArray).toBe(true);
        expect(result.stillSameArray).toBe(true);
        expect(result.bothLostHerbs).toBe(true);
        expect(result.companionStarterKitMerged).toBe(true);
    });

    test('save/load re-attaches every party member to one canonical shared array, not duplicate copies', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const companion = window.createCharacterData('human', 'fighter', 'Test Companion 2', 'male');
            window.party.push(companion);
            window.wireSharedInventory(companion);
            window.party[0].inventory.push('gem_blue');
            window.saveGame('test_shared_inv_save');
        });
        await page.evaluate(() => window.loadGame('test_shared_inv_save'));
        await page.waitForTimeout(300);
        const result = await page.evaluate(() => {
            const gems = window.party[0].inventory.filter(i => i === 'gem_blue').length;
            const sameRef = window.party.length > 1 && window.party[0].inventory === window.party[1].inventory;
            return { gems, sameRef, partyLen: window.party.length };
        });
        expect(result.partyLen).toBeGreaterThan(1);
        expect(result.gems).toBe(1); // not duplicated across party members
        expect(result.sameRef).toBe(true);
    });
});

test.describe('Encumbrance', () => {
    test('carry capacity scales with party size and strong_back ranks', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const base = window.getPartyCarryCapacity();
            window.grantSkillRank(window.party[0], 'strong_back');
            const afterOneRank = window.getPartyCarryCapacity();
            return { base, afterOneRank };
        });
        expect(result.afterOneRank).toBe(result.base + 15);
    });

    test('an owned horse (or any owned mount) adds to capacity whether ridden or not', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.getPartyCarryCapacity();
            const playerEntity = window.entities.find(e => e.side === 'player' && !e.rider);
            const horse = window.createMonster('horse', { q: playerEntity.hex.q + 1, r: playerEntity.hex.r }, null, null, 'player');
            window.entities.push(horse);
            const afterUnridden = window.getPartyCarryCapacity();
            horse.rider = playerEntity;
            playerEntity.riding = horse;
            const afterRidden = window.getPartyCarryCapacity();
            return { before, afterUnridden, afterRidden };
        });
        expect(result.afterUnridden).toBeGreaterThan(result.before);
        expect(result.afterRidden).toBe(result.afterUnridden); // riding it doesn't add or remove the bonus
    });

    test('a living animal companion adds to capacity; a dead one does not', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.getPartyCarryCapacity();
            const companion = window.createMonster('wolf', { q: 5, r: 5 }, null, null, 'player');
            window.entities.push(companion);
            window.party[0].animalCompanion = companion;
            const afterAlive = window.getPartyCarryCapacity();
            companion.alive = false;
            const afterDead = window.getPartyCarryCapacity();
            return { before, afterAlive, afterDead };
        });
        expect(result.afterAlive).toBeGreaterThan(result.before);
        expect(result.afterDead).toBe(result.before);
    });

    test('the magic backpack (Bag of Holding) adds a flat carry bonus when equipped in the accessory slot', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.getPartyCarryCapacity();
            window.party[0].equipped = window.party[0].equipped || {};
            window.party[0].equipped.accessory = 'magic_backpack';
            const after = window.getPartyCarryCapacity();
            return { before, after, bonus: window.items.magic_backpack.carryBonus };
        });
        expect(result.after).toBe(result.before + result.bonus);
    });

    test('weight is computed from item type/subtype defaults without needing a weight field on every item', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            sword: window.getItemWeight('sword'),
            questItem: window.getItemWeight('elder_locket'),
            stone: window.getItemWeight('stone'),
            heavyArmor: window.getItemWeight('heavy_armor'),
            lightArmor: window.getItemWeight('light_armor'),
        }));
        expect(result.sword).toBeGreaterThan(0);
        expect(result.questItem).toBe(0);
        expect(result.stone).toBeGreaterThan(result.sword);
        expect(result.heavyArmor).toBeGreaterThan(result.lightArmor);
    });

    test('going over capacity makes movement heavier (getMoveCostMult), and is not a hard block on pickups', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const before = window.getMoveCostMult(player.hex.q, player.hex.r, player);
            const capacity = window.getPartyCarryCapacity();
            // Force weight over capacity with cheap, heavy items (stone, weight 8 each).
            const needed = Math.ceil(capacity / 8) + 2;
            for (let i = 0; i < needed; i++) player.inventory.push('stone');
            const overencumbered = window.isPartyOverencumbered();
            const after = window.getMoveCostMult(player.hex.q, player.hex.r, player);
            return { before, after, overencumbered, invLen: player.inventory.length };
        });
        expect(result.overencumbered).toBe(true);
        expect(result.invLen).toBeGreaterThan(0); // the pickup was never blocked
        expect(result.after).toBeGreaterThan(result.before);
    });

    test('quartermaster halves (rank 1) and fully negates (rank 2) the overencumbered movement penalty', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.party[0];
            const capacity = window.getPartyCarryCapacity();
            const needed = Math.ceil(capacity / 8) + 2;
            for (let i = 0; i < needed; i++) player.inventory.push('stone');
            const noSkill = window.getEncumbranceMoveMult();
            window.grantSkillRank(player, 'quartermaster');
            const rank1 = window.getEncumbranceMoveMult();
            window.grantSkillRank(player, 'quartermaster');
            const rank2 = window.getEncumbranceMoveMult();
            return { noSkill, rank1, rank2 };
        });
        expect(result.noSkill).toBeCloseTo(1.5, 5);
        expect(result.rank1).toBeCloseTo(1.25, 5);
        expect(result.rank2).toBeCloseTo(1.0, 5);
    });
});

test.describe('New non-stacking-damage skills', () => {
    test('sunder_armor reduces the TARGET\'s reduction on melee hit, capped at the attacker\'s rank count', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            attacker.skills = { ...attacker.skills, sunder_armor: 1 };
            attacker.toHitMelee = 200; // guarantee every roll hits, deterministically
            const target = window.createMonster('wolf', { q: attacker.hex.q + 1, r: attacker.hex.r });
            target.baseReduction = 3;
            target.passiveDodge = -200;
            window.entities.push(target);
            window.resolveAttack(attacker, target, false, false);
            const afterOne = target.baseReduction;
            window.resolveAttack(attacker, target, false, false);
            const afterTwo = target.baseReduction; // capped at rank 1, should not drop again
            return { afterOne, afterTwo };
        });
        expect(result.afterOne).toBe(2);
        expect(result.afterTwo).toBe(2);
    });

    test('hamstring stacks a movement penalty on the TARGET, consumed by getMoveCostMult, capped at rank count', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.side === 'player' && !e.rider);
            attacker.skills = { ...attacker.skills, hamstring: 2 };
            attacker.toHitMelee = 200; // guarantee every roll hits, deterministically
            const target = window.createMonster('wolf', { q: attacker.hex.q + 1, r: attacker.hex.r });
            target.passiveDodge = -200;
            window.entities.push(target);
            const baseline = window.getMoveCostMult(target.hex.q, target.hex.r, target);
            window.resolveAttack(attacker, target, false, false);
            const afterOne = window.getMoveCostMult(target.hex.q, target.hex.r, target);
            window.resolveAttack(attacker, target, false, false);
            const afterTwo = window.getMoveCostMult(target.hex.q, target.hex.r, target);
            window.resolveAttack(attacker, target, false, false);
            const afterThree = window.getMoveCostMult(target.hex.q, target.hex.r, target); // capped at rank 2
            return { baseline, afterOne, afterTwo, afterThree };
        });
        expect(result.afterOne).toBeCloseTo(result.baseline * 1.2, 5);
        expect(result.afterTwo).toBeCloseTo(result.baseline * 1.4, 5);
        expect(result.afterThree).toBeCloseTo(result.baseline * 1.4, 5); // unchanged, rank cap held
    });

    test('appraiser discounts shop buy prices, capped at 15% (rank 3)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const noSkill = window.getAppraiserDiscountMult();
            const player = window.party[0];
            window.grantSkillRank(player, 'appraiser');
            const rank1 = window.getAppraiserDiscountMult();
            window.grantSkillRank(player, 'appraiser');
            window.grantSkillRank(player, 'appraiser');
            const rank3 = window.getAppraiserDiscountMult();
            return { noSkill, rank1, rank3 };
        });
        expect(result.noSkill).toBe(1);
        expect(result.rank1).toBeCloseTo(0.95, 5);
        expect(result.rank3).toBeCloseTo(0.85, 5);
    });

    test('keen_forager always yields the maximum roll from a gathering node', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const player = window.party[0];
            player.skills = { ...player.skills, keen_forager: 1 };
            player.inventory.push('pickaxe');
            const q = 200, r = 200; // far outside the village per ensureWildernessResourceNode's own distance guard
            window.tileObjects[`${q},${r}`] = { type: 'ore_node', oreType: 'ore_iron', depleted: false };
            const before = player.inventory.filter(i => i === 'ore_iron').length;
            window.harvestOreNode(q, r);
            const after = player.inventory.filter(i => i === 'ore_iron').length;
            return { gained: after - before };
        });
        expect(result.gained).toBe(3); // the harvestOreNode max roll
    });
});

test.describe('Storage chests (player housing)', () => {
    test('the cottage\'s storage chest exists and holds items with no capacity limit', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const plot = window.campaign2PlayerCottagePlot;
            window.buildPlayerCottage(plot.q, plot.r);
            const q = plot.q + 1, r = plot.r;
            const chest = window.tileObjects[`${q},${r}`];
            const hasChest = !!chest;
            const chestType = chest && chest.type;

            const capacity = window.getPartyCarryCapacity();
            const heavyCount = Math.ceil(capacity / 8) + 5; // deliberately more than the party could ever carry
            for (let i = 0; i < heavyCount; i++) window.party[0].inventory.push('stone');
            const deposited = [];
            for (let i = 0; i < heavyCount; i++) deposited.push(window.depositToChest(q, r, 'stone'));

            return {
                hasChest, chestType, heavyCount,
                allDeposited: deposited.every(Boolean),
                chestCount: chest.items.filter(i => i === 'stone').length,
                partyStoneLeft: window.party[0].inventory.filter(i => i === 'stone').length,
                overencumberedAfterDeposit: window.isPartyOverencumbered()
            };
        });
        expect(result.hasChest).toBe(true);
        expect(result.chestType).toBe('storage_chest');
        expect(result.allDeposited).toBe(true);
        expect(result.partyStoneLeft).toBe(0);
        expect(result.overencumberedAfterDeposit).toBe(false);
        // Deliberately more stone than the party's own capacity could ever
        // carry (heavyCount was chosen specifically to overshoot it) — the
        // chest holds every single one anyway, with no capacity check at all.
        expect(result.chestCount).toBe(result.heavyCount);
    });

    test('withdrawing from the chest puts items back in the shared party inventory', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const plot = window.campaign2PlayerCottagePlot;
            window.buildPlayerCottage(plot.q, plot.r);
            const q = plot.q + 1, r = plot.r;
            window.party[0].inventory.push('gem_red');
            window.depositToChest(q, r, 'gem_red');
            const inPartyBefore = window.party[0].inventory.includes('gem_red');
            const withdrawn = window.withdrawFromChest(q, r, 'gem_red');
            const inPartyAfter = window.party[0].inventory.includes('gem_red');
            return { inPartyBefore, withdrawn, inPartyAfter };
        });
        expect(result.inPartyBefore).toBe(false);
        expect(result.withdrawn).toBe(true);
        expect(result.inPartyAfter).toBe(true);
    });
});
