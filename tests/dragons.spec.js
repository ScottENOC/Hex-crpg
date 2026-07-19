const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('dragons', () => {
    test('young/adult/ancient dragons scale in size, mana, and breath weapon power', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const out = {};
            ['dragon_young', 'dragon_adult', 'dragon_ancient'].forEach(type => {
                const d = window.createMonster(type, { q: 5, r: 5 }, null, null, 'enemy');
                out[type] = {
                    name: d.name, hp: d.maxHp, isFlying: d.isFlying, dragonSizeTier: d.dragonSizeTier,
                    allHexesCount: d.getAllHexes().length,
                    breath: (d.createdSpells || []).find(s => s.baseId === 'dragon_breath'),
                    maxMana: d.maxMana, tags: d.tags, color: d.color
                };
            });
            out.dragonImageLoaded = window.gameVisuals.dragon.complete && window.gameVisuals.dragon.naturalWidth > 0;
            return out;
        });

        expect(result.dragonImageLoaded).toBe(true);

        expect(result.dragon_young.isFlying).toBe(true);
        expect(result.dragon_young.tags).toContain('dragon');
        expect(result.dragon_young.tags).toContain('flying');

        // Bigger tiers: more hp, more footprint hexes, more mana, stronger breath.
        expect(result.dragon_adult.hp).toBeGreaterThan(result.dragon_young.hp);
        expect(result.dragon_ancient.hp).toBeGreaterThan(result.dragon_adult.hp);

        expect(result.dragon_adult.allHexesCount).toBeGreaterThan(result.dragon_young.allHexesCount);
        expect(result.dragon_ancient.allHexesCount).toBeGreaterThan(result.dragon_adult.allHexesCount);

        expect(result.dragon_adult.maxMana).toBeGreaterThan(result.dragon_young.maxMana);
        expect(result.dragon_ancient.maxMana).toBeGreaterThan(result.dragon_adult.maxMana);

        expect(result.dragon_young.breath).toBeTruthy();
        expect(result.dragon_adult.breath.magnitude).toBeGreaterThan(result.dragon_young.breath.magnitude);
        expect(result.dragon_ancient.breath.magnitude).toBeGreaterThan(result.dragon_adult.breath.magnitude);
    });

    test('two dragons with different colors recolor to visually distinct tinted sprites', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const red = window.createMonster('dragon_young', { q: 5, r: 5 }, null, null, 'enemy');
            red.color = '#c0392b';
            const blue = window.createMonster('dragon_young', { q: 7, r: 7 }, null, null, 'enemy');
            blue.color = '#1c3f6e';
            const redTint = window.getRecoloredHairSprite(window.gameVisuals.dragon, window.hexColorToHue(red.color));
            const blueTint = window.getRecoloredHairSprite(window.gameVisuals.dragon, window.hexColorToHue(blue.color));
            return { redIsCanvas: redTint instanceof HTMLCanvasElement, blueIsCanvas: blueTint instanceof HTMLCanvasElement, different: redTint !== blueTint };
        });
        expect(result.redIsCanvas).toBe(true);
        expect(result.blueIsCanvas).toBe(true);
        expect(result.different).toBe(true);
    });

    test('dragon breath weapon deals AOE damage to all enemies in the burst radius', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Adult dragon's extraHexes footprint occupies (5,6)/(6,5)/(6,4)
            // relative to its (5,5) center — spawn targets clear of that so
            // the breath's own caster-footprint hexes aren't mistaken for targets.
            const dragon = window.createMonster('dragon_adult', { q: 5, r: 5 }, null, null, 'enemy');
            dragon.currentMana = 100;
            window.entities.push(dragon);
            const target1 = window.createMonster('goblin', { q: 8, r: 4 }, null, null, 'player');
            const target2 = window.createMonster('goblin', { q: 8, r: 3 }, null, null, 'player');
            window.entities.push(target1, target2);
            const hp1Before = target1.hp, hp2Before = target2.hp;
            const breath = dragon.createdSpells.find(s => s.baseId === 'dragon_breath');
            window.tryCastSpell(dragon, breath, target1, target1.hex, true);
            return {
                hp1Before, hp1After: target1.hp,
                hp2Before, hp2After: target2.hp
            };
        });
        expect(result.hp1After).toBeLessThan(result.hp1Before);
        expect(result.hp2After).toBeLessThan(result.hp2Before);
    });
});
