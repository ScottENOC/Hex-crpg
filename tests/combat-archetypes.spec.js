// tests/combat-archetypes.spec.js
// Randomly-equipped monsters (goblin/orc/skeleton, defaultEquipment:'random')
// now get a coherent "combat archetype" — one weapon (+ optional shield)
// paired with an ordered skill-priority list matching it — instead of the
// old assignRandomEquipment, which rolled a random weapon with zero
// matching skill behind it. See COMBAT_ARCHETYPES/spendArchetypePoints,
// monsters.js.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Combat archetypes: coherent weapon + skill builds', () => {
    test('a randomly-equipped monster never has a mismatched weapon skill (e.g. axe equipped but sword_hit ranked)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const mismatches = [];
            for (let i = 0; i < 60; i++) {
                const type = ['goblin', 'orc', 'skeleton'][i % 3];
                const m = window.createMonster(type, { q: i, r: 0 }, null, null, 'enemy');
                const weapon = m.equipped?.weapon;
                if (!weapon) continue;
                const otherWeaponSkills = ['sword', 'spear', 'axe', 'bow', 'dagger']
                    .filter(w => w !== weapon)
                    .flatMap(w => [`${w}_hit`, `${w}_dmg`, `${w}_parry`]);
                otherWeaponSkills.forEach(sk => {
                    if (m.skills[sk]) mismatches.push({ type, weapon, sk, rank: m.skills[sk] });
                });
            }
            return { mismatchCount: mismatches.length, sample: mismatches.slice(0, 3) };
        });
        expect(result.mismatchCount).toBe(0);
    });

    test('most randomly-equipped monsters end up with a real rank in their own weapon skill', async ({ page }) => {
        // Statistical, not absolute: a shield-first defender archetype
        // prioritizes shield_proficiency before its weapon skill, so with
        // only 3 points and some randomness in the spend order, it's
        // occasionally still shieldless-but-unskilled at the weapon by
        // design — the point is that it's the common case, not universal.
        await createCharacter(page);
        const result = await page.evaluate(() => {
            let withOwnWeaponSkill = 0;
            const total = 80;
            for (let i = 0; i < total; i++) {
                const m = window.createMonster('skeleton', { q: i, r: 0 }, null, null, 'enemy');
                const weapon = m.equipped?.weapon;
                if ((m.skills[`${weapon}_hit`] || 0) > 0) withOwnWeaponSkill++;
            }
            return { fraction: withOwnWeaponSkill / total };
        });
        expect(result.fraction).toBeGreaterThan(0.7);
    });

    test('assignCombatBuild lets a caller hand-pick a specific archetype for a hand-placed monster', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const m = window.createMonster('orc', { q: 0, r: 0 }, { health: 1 }, [], 'enemy'); // no weapon yet
            window.assignCombatBuild(m, 4, 'axe_berserker');
            return {
                weapon: m.equipped?.weapon,
                axeHit: m.skills.axe_hit,
                archetype: m.combatArchetype,
                noSwordSkill: !m.skills.sword_hit,
            };
        });
        expect(result.weapon).toBe('axe');
        expect(result.archetype).toBe('axe_berserker');
        expect(result.axeHit).toBeGreaterThan(0);
        expect(result.noSwordSkill).toBe(true);
    });

    test('a sword_shield_defender archetype equips both the sword and the shield', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const m = window.createMonster('orc', { q: 0, r: 0 }, { health: 1 }, [], 'enemy');
            window.assignCombatBuild(m, 3, 'sword_shield_defender');
            return { weapon: m.equipped?.weapon, offhand: m.equipped?.offhand };
        });
        expect(result.weapon).toBe('sword');
        expect(result.offhand).toBe('wooden_shield');
    });
});
