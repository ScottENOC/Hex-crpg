// tests/barding-and-mount-training.spec.js
// Barding (light/medium/heavy, images/barding_*.svg) fits onto mounts —
// Horse, Wolf, Boar, and the Unicorn companion — via equipMountBarding
// (monsters.js), reusing the same generic armor-reduction math every
// other entity already gets (entity.equipped.armor -> item.reduction).
// Mounts can also invest skill points, but only from a fixed, physically
// plausible allowlist (MOUNT_APPROPRIATE_SKILLS: armor training + health/
// melee damage — never a weapon-hit skill or anything arcane/divine).
// Purchased horses can come pre-trained (MOUNT_TRAINING_TIERS) at a
// higher price, with skill points already spent and, at the higher
// tiers, a free barding fitting.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Barding: items, art, and eligibility', () => {
    test('light/medium/heavy barding are real armor items with an image mapping', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            light: window.items.light_barding,
            medium: window.items.medium_barding,
            heavy: window.items.heavy_barding,
            imageKeys: window.BARDING_IMAGE_KEYS,
            lightImgSrc: window.gameVisuals.barding_light?.src || '',
            mediumImgSrc: window.gameVisuals.barding_medium?.src || '',
            heavyImgSrc: window.gameVisuals.barding_heavy?.src || '',
        }));
        expect(result.light.type).toBe('armor');
        expect(result.light.subType).toBe('barding');
        expect(result.light.reduction).toBe(1);
        expect(result.medium.reduction).toBe(2);
        expect(result.heavy.reduction).toBe(3);
        expect(result.imageKeys.light_barding).toBe('barding_light');
        expect(result.imageKeys.medium_barding).toBe('barding_medium');
        expect(result.imageKeys.heavy_barding).toBe('barding_heavy');
        expect(result.lightImgSrc).toContain('barding_light.svg');
        expect(result.mediumImgSrc).toContain('barding_medium.svg');
        expect(result.heavyImgSrc).toContain('barding_heavy.svg');
    });

    test('equipMountBarding fits Horse, Wolf, Boar, and Unicorn but refuses everything else', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const horse = window.createMonster('horse', { q: 0, r: 0 }, null, null, 'player');
            const wolf = window.createMonster('wolf', { q: 1, r: 0 }, null, null, 'player');
            const boar = window.createMonster('boar', { q: 2, r: 0 }, null, null, 'player');
            const unicorn = window.createMonster('unicorn', { q: 3, r: 0 }, null, null, 'player');
            const goblin = window.createMonster('goblin', { q: 4, r: 0 }, null, null, 'enemy');

            const horseOk = window.equipMountBarding(horse, 'medium_barding');
            const wolfOk = window.equipMountBarding(wolf, 'light_barding');
            const boarOk = window.equipMountBarding(boar, 'heavy_barding');
            const unicornOk = window.equipMountBarding(unicorn, 'light_barding');
            const goblinRefused = !window.equipMountBarding(goblin, 'light_barding');
            const wrongItemRefused = !window.equipMountBarding(horse, 'sword');

            return {
                horseOk, wolfOk, boarOk, unicornOk, goblinRefused, wrongItemRefused,
                horseArmor: horse.equipped.armor,
                unicornArmor: unicorn.equipped.armor,
            };
        });
        expect(result.horseOk).toBe(true);
        expect(result.wolfOk).toBe(true);
        expect(result.boarOk).toBe(true);
        expect(result.unicornOk).toBe(true);
        expect(result.goblinRefused).toBe(true);
        expect(result.wrongItemRefused).toBe(true);
        expect(result.horseArmor).toBe('medium_barding');
        expect(result.unicornArmor).toBe('light_barding');
    });

    test('barding on a mount reduces incoming damage the same generic way any other armor does', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const horse = window.createMonster('horse', { q: 0, r: 0 }, null, null, 'player');
            const before = window.items[horse.equipped?.armor]?.reduction || 0;
            window.equipMountBarding(horse, 'heavy_barding');
            const after = window.items[horse.equipped.armor].reduction;
            return { before, after };
        });
        expect(result.before).toBe(0);
        expect(result.after).toBe(3);
    });
});

test.describe('Mount training: physically-plausible skills only', () => {
    test('MOUNT_APPROPRIATE_SKILLS never includes a weapon-hit or magic skill', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => window.MOUNT_APPROPRIATE_SKILLS);
        expect(result).toContain('light_armor_training');
        expect(result).toContain('health');
        expect(result.some(k => k.includes('_hit') || k.includes('_dmg'))).toBe(false);
        expect(result.some(k => k.toLowerCase().includes('spell') || k.toLowerCase().includes('mana'))).toBe(false);
    });

    test('grantMountTraining("trained") grants light armor training + health, and a free light barding', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const horse = window.createMonster('horse', { q: 0, r: 0 }, null, null, 'player');
            const hpBefore = horse.maxHp;
            window.grantMountTraining(horse, 'trained');
            return {
                lightArmorTraining: horse.skills.light_armor_training,
                healthRanked: horse.skills.health,
                hpIncreased: horse.maxHp > hpBefore,
                armor: horse.equipped.armor,
            };
        });
        expect(result.lightArmorTraining).toBe(1);
        expect(result.healthRanked).toBeGreaterThan(0);
        expect(result.hpIncreased).toBe(true);
        expect(result.armor).toBe('light_barding');
    });

    test('grantMountTraining("war_trained") grants light+medium armor training and comes with medium barding', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const horse = window.createMonster('horse', { q: 0, r: 0 }, null, null, 'player');
            window.grantMountTraining(horse, 'war_trained');
            return {
                lightArmorTraining: horse.skills.light_armor_training,
                mediumArmorTraining: horse.skills.medium_armor_training,
                armor: horse.equipped.armor,
            };
        });
        expect(result.lightArmorTraining).toBe(1);
        expect(result.mediumArmorTraining).toBe(1);
        expect(result.armor).toBe('medium_barding');
    });

    test('grantMountTraining("untrained") is a no-op: no armor training added, no barding', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const horse = window.createMonster('horse', { q: 0, r: 0 }, null, null, 'player');
            const skillsBefore = { ...horse.skills }; // the template's own baseline (health/fastMovement)
            window.grantMountTraining(horse, 'untrained');
            return { skillsUnchanged: JSON.stringify(horse.skills) === JSON.stringify(skillsBefore), armor: horse.equipped.armor };
        });
        expect(result.skillsUnchanged).toBe(true);
        expect(result.armor).toBe(null);
    });
});

test.describe('Buying a trained horse (stable.js)', () => {
    test('buyHorse costs more per tier and applies that tier\'s training', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.riding = 1;
            window.party[0].gold = 2000;

            const goldBefore1 = window.party[0].gold;
            window.buyHorse('brown', 'untrained');
            const untrainedCost = goldBefore1 - window.party[0].gold;

            const goldBefore2 = window.party[0].gold;
            window.buyHorse('black', 'trained');
            const trainedCost = goldBefore2 - window.party[0].gold;
            const trainedHorse = window.entities.find(e => e.name === 'Horse' && e.coatPreset === 'black');

            return {
                untrainedCost,
                trainedCost,
                costRose: trainedCost > untrainedCost,
                trainedHorseHasSkill: (trainedHorse?.skills?.light_armor_training || 0) > 0,
                trainedHorseHasBarding: trainedHorse?.equipped?.armor === 'light_barding',
            };
        });
        expect(result.untrainedCost).toBe(150);
        expect(result.costRose).toBe(true);
        expect(result.trainedHorseHasSkill).toBe(true);
        expect(result.trainedHorseHasBarding).toBe(true);
    });
});

test.describe('Stable dialogue: tier + barding options', () => {
    test('the stablehand offers training tiers and a barding-fitting option for an already-owned horse', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.riding = 1;
            window.party[0].gold = 2000;

            const npc = { name: 'Stablehand', reputation: { standing: 0, knowledge: 0 } };
            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.npcDialogueTrees.silverhart_stablehand(npc);

            const hasTrainedOption = calls.some(o => o.label.includes('Trained ('));
            const hasWarTrainedOption = calls.some(o => o.label.includes('War-Trained'));
            const hasBardingOption = calls.some(o => o.label.includes('Fit Light Barding'));

            return { hasTrainedOption, hasWarTrainedOption, hasBardingOption };
        });
        expect(result.hasTrainedOption).toBe(true);
        expect(result.hasWarTrainedOption).toBe(true);
        expect(result.hasBardingOption).toBe(true);
    });

    test('fitting barding on an owned, ridden horse via the stablehand actually equips it', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.riding = 1;
            window.party[0].gold = 2000;
            window.buyHorse('brown', 'untrained');

            const player = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            const horse = window.entities.find(e => e.name === 'Horse');
            player.riding = horse;
            horse.rider = player;

            const npc = { name: 'Stablehand', reputation: { standing: 0, knowledge: 0 } };
            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.npcDialogueTrees.silverhart_stablehand(npc);
            const goldBefore = window.party[0].gold;
            calls.find(o => o.label.includes('Fit Heavy Barding')).action();

            return {
                goldSpent: goldBefore - window.party[0].gold,
                armor: horse.equipped.armor,
            };
        });
        expect(result.goldSpent).toBe(240);
        expect(result.armor).toBe('heavy_barding');
    });
});
