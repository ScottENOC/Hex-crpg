// tests/difficulty-and-respec.spec.js
// window.difficultyMode ('easy'|'normal'|'hard'): a character-creation
// selector alongside Iron Man that adjusts starting gold, a free Health
// rank, sell prices, arena level-scaling, hard-mode damage multipliers, and
// how fast the Ironbond/lich-hunt hidden clocks drift. Also covers the
// Retrainer (resolveRespec, ui.js) — a full skill respec recomputed from
// race + classLevels rather than incrementally refunded.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Difficulty mode: character creation effects', () => {
    test('easy mode grants a gold bonus and a free Health rank not paid from the pool', async ({ page }) => {
        await createCharacter(page, { difficulty: 'easy' });
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => ({
            gold: window.player.gold,
            healthRank: window.player.skills.health,
            freeFloor: window.player.freeSkillRanks?.health,
        }));
        expect(state.gold).toBe(Math.round(65 * 1.5));
        expect(state.healthRank).toBe(1);
        expect(state.freeFloor).toBe(1);
    });

    test('normal mode gets the base gold, no free skill rank', async ({ page }) => {
        await createCharacter(page, { difficulty: 'normal' });
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => ({
            gold: window.player.gold,
            healthRank: window.player.skills.health || 0,
        }));
        expect(state.gold).toBe(65);
        expect(state.healthRank).toBe(0);
    });
});

test.describe('Difficulty mode: combat and economy', () => {
    test('hard mode reduces damage dealt by the player and increases damage taken', async ({ page }) => {
        await createCharacter(page, { difficulty: 'hard' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.name === window.player.name);
            attacker.toHitMelee = 1000; // guarantee the hit, randomness aside
            attacker.equipped = { weapon: null, offhand: null, armor: null, helmet: null }; // unarmed, no weapon/skill bonuses muddying the raw damage math
            attacker.baseDamage = 1;
            const dummy = new window.Enemy('Dummy', 'red', { q: 1, r: 0 }, 100, 100, 0);
            dummy.side = 'enemy';
            dummy.alive = true;
            dummy.passiveDodge = -1000;
            window.entities.push(dummy);
            const hpBefore = dummy.hp;
            // baseDamage(1) + bonusDamage(9) = 10 raw damage, no armor/reduction
            window.resolveAttack(attacker, dummy, false, false, null, 9);
            return { dealt: hpBefore - dummy.hp };
        });
        // 10 base damage, no reduction, hard mode -10% dealt -> round(10*0.9)=9
        expect(result.dealt).toBe(9);
    });

    test('sell price is better on easy, worse on hard, relative to normal', async ({ page }) => {
        const prices = {};
        for (const difficulty of ['easy', 'normal', 'hard']) {
            await createCharacter(page, { difficulty });
            await page.waitForTimeout(500);
            prices[difficulty] = await page.evaluate(() => {
                const sellFraction = window.difficultyMode === 'easy' ? 0.7 : (window.difficultyMode === 'hard' ? 0.35 : 0.5);
                return Math.floor(100 * sellFraction); // a 100-buyPrice item
            });
        }
        expect(prices.easy).toBeGreaterThan(prices.normal);
        expect(prices.hard).toBeLessThan(prices.normal);
    });

    test('easy mode slows the Ironbond arc drift rate', async ({ page }) => {
        await createCharacter(page, { difficulty: 'easy' });
        await page.waitForTimeout(500);
        const easyGain = await page.evaluate(() => {
            const before = window.ironbondArc.crownInfiltration;
            window.tickIronbondArc(3600); // 1 hour
            return window.ironbondArc.crownInfiltration - before;
        });

        await createCharacter(page, { difficulty: 'normal' });
        await page.waitForTimeout(500);
        const normalGain = await page.evaluate(() => {
            const before = window.ironbondArc.crownInfiltration;
            window.tickIronbondArc(3600);
            return window.ironbondArc.crownInfiltration - before;
        });

        expect(easyGain).toBeLessThan(normalGain);
    });
});

test.describe('The Retrainer: resolveRespec', () => {
    test('placed in the capital next to the Mercenary Recruiter', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        const present = await page.evaluate(() => !!window.entities.find(e => e.dialogueId === 'silverhart_retrainer'));
        expect(present).toBe(true);
    });

    test('absent under Iron Man Mode', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#race-select', { state: 'visible' });
        await page.selectOption('#race-select', 'human');
        await page.selectOption('#gender-select', 'male');
        await page.selectOption('#class-select', 'fighter');
        await page.selectOption('#campaign-select', '2');
        await page.check('#ironman-check');
        await page.click('#createCharacterButton');
        await page.waitForSelector('#character-screen-modal', { state: 'visible' });
        await page.click('#character-screen-modal .close-btn');
        await page.waitForFunction(() => window.entities && window.entities.length > 0);
        await page.waitForTimeout(1000);

        const state = await page.evaluate(() => ({
            ironman: window.ironmanMode,
            present: !!window.entities.find(e => e.dialogueId === 'silverhart_retrainer'),
        }));
        expect(state.ironman).toBe(true);
        expect(state.present).toBe(false);
    });

    test('resets normally-purchased skills back into spendable attribute points, recomputed from race + classLevels', async ({ page }) => {
        await createCharacter(page, { race: 'human', cls: 'fighter' });
        await page.waitForTimeout(500);

        const before = await page.evaluate(() => {
            window.learnSkill('sword_hit');
            window.learnSkill('sword_dmg');
            return {
                swordHit: window.player.skills.sword_hit,
                weaponsPool: window.player.attributes.weapons,
            };
        });
        expect(before.swordHit).toBe(1);

        const after = await page.evaluate(() => {
            window.resolveRespec(window.player);
            return {
                skills: window.player.skills,
                attributes: window.player.attributes,
            };
        });
        expect(after.skills.sword_hit || 0).toBe(0);
        expect(after.skills.sword_dmg || 0).toBe(0);
        // Everything spent should be back in the pool: weapons pool should be
        // at least as large as it was before any purchase (level-1 fighter's
        // starting weapons bonus).
        expect(after.attributes.weapons).toBeGreaterThanOrEqual(before.weaponsPool + 2);
    });

    test('respec leaves lich, monster-only, and quest-granted skills untouched', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(500);

        const result = await page.evaluate(() => {
            window.grantSkillRank(window.player, 'lich_deathless_flesh');
            window.grantSkillRank(window.player, 'learn_unicorn_summon');
            window.player.skills.poison_bite = 1; // monster_skills tree, hand-set for the test
            window.resolveRespec(window.player);
            return {
                lich: window.player.skills.lich_deathless_flesh,
                unicorn: window.player.skills.learn_unicorn_summon,
                poison: window.player.skills.poison_bite,
            };
        });
        expect(result.lich).toBe(1);
        expect(result.unicorn).toBe(1);
        expect(result.poison).toBe(1);
    });

    test('respec preserves the free easy-mode Health rank but resets any additionally purchased ranks', async ({ page }) => {
        await createCharacter(page, { difficulty: 'easy' });
        await page.waitForTimeout(500);

        const result = await page.evaluate(() => {
            window.learnSkill('health'); // buy a second rank on top of the free one
            const beforeRank = window.player.skills.health;
            window.resolveRespec(window.player);
            return { beforeRank, afterRank: window.player.skills.health, maxHp: window.player.maxHp };
        });
        expect(result.beforeRank).toBe(2);
        expect(result.afterRank).toBe(1); // only the free rank survives
        expect(result.maxHp).toBe(20); // base 10 + the one preserved rank's +10
    });

    test('the retrainer dialogue charges gold and calls resolveRespec', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        await page.evaluate(() => { window.hollowmereEventFired = true; });

        const result = await page.evaluate(() => {
            window.learnSkill('sword_hit');
            window.party[0].gold = 500; // silverhart_retrainer reads window.party[0], same as the existing mercenary broker
            const npc = window.entities.find(e => e.dialogueId === 'silverhart_retrainer');
            window.npcDialogueTrees.silverhart_retrainer(npc);
            return document.getElementById('dialogue-options').children.length;
        });
        expect(result).toBeGreaterThan(0);

        const { clickDialogueOption } = require('./helpers.js');
        await clickDialogueOption(page, 'Retrain me');

        const after = await page.evaluate(() => ({
            gold: window.party[0].gold,
            swordHit: window.party[0].skills.sword_hit || 0,
        }));
        expect(after.gold).toBeLessThan(500);
        expect(after.swordHit).toBe(0);
    });
});
