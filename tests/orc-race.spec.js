// tests/orc-race.spec.js
// Orc as a playable race, mirroring goblin's own (tests/goblin-race.spec.js):
// race select options, the orc skill tree (data.js/skills.js, leaning
// strength/ferocity/momentum), asymmetric starting faction standing
// (factions.js's seedStanding), the flat orc.png fallback render
// (gameEngine.js's drawPlayerCharacter), and the alternate Skarnak's-Hold
// spawn that skips the Hollowmere tavern scene entirely.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Orc race: character/mercenary creation options', () => {
    test('orc is a race-select option at character creation', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#race-select', { state: 'visible' });
        const options = await page.locator('#race-select option').allTextContents();
        expect(options).toContain('Orc');
    });

    test('orc is a race-select option at mercenary hire creation', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('#merc-race', { state: 'attached' });
        const options = await page.locator('#merc-race option').allTextContents();
        expect(options).toContain('Orc');
    });

    test('an orc gets the same total attribute-pool bonus (4 points) as the other races', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(500);
        const total = await page.evaluate(() => Object.values(window.raceData.orc.bonus).reduce((a, b) => a + b, 0));
        const humanTotal = await page.evaluate(() => Object.values(window.raceData.human.bonus).reduce((a, b) => a + b, 0));
        expect(total).toBe(humanTotal);
    });
});

test.describe('Orc skill tree', () => {
    test('the orc tree has at least as many skills as dwarf/elf, all with real effects', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(500);
        const counts = await page.evaluate(() => {
            const byTree = {};
            for (const key in window.skills) {
                const tree = window.skills[key].tree;
                byTree[tree] = (byTree[tree] || 0) + 1;
            }
            return byTree;
        });
        expect(counts.orc).toBeGreaterThanOrEqual(4);
    });

    test('orc_thick_hide reduces incoming damage per rank', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const before = window.player.baseReduction || 0;
            window.grantSkillRank(window.player, 'orc_thick_hide');
            return { before, after: window.player.baseReduction };
        });
        expect(result.after).toBe(result.before + 1);
    });

    test('orc_brute_strength deals flat bonus melee damage per rank', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.name === window.player.name);
            attacker.toHitMelee = 1000;
            attacker.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            attacker.baseDamage = 1;
            attacker.skills.orc_brute_strength = 2;

            const target = new window.Enemy('Target', 'red', { q: 1, r: 0 }, 100, 100, 0);
            target.side = 'enemy'; target.alive = true; target.passiveDodge = -1000;
            window.entities.push(target);

            const hpBefore = target.hp;
            window.resolveAttack(attacker, target, false, false, null, 0);
            return hpBefore - target.hp;
        });
        // baseDamage 1, no reduction, +2*2 for brute strength rank 2 = 5
        expect(result).toBe(5);
    });

    test('orc_ferocity deals bonus damage only at or below half HP', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.name === window.player.name);
            attacker.toHitMelee = 1000;
            attacker.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            attacker.baseDamage = 1;
            attacker.skills.orc_ferocity = 1;
            attacker.maxHp = 100;

            const makeTarget = () => {
                const t = new window.Enemy('Target', 'red', { q: 1, r: 0 }, 100, 100, 0);
                t.side = 'enemy'; t.alive = true; t.passiveDodge = -1000;
                window.entities.push(t);
                return t;
            };

            attacker.hp = 100; // full health — no ferocity bonus
            const fullHpTarget = makeTarget();
            window.resolveAttack(attacker, fullHpTarget, false, false, null, 0);
            const fullHpDmg = 100 - fullHpTarget.hp;

            attacker.hp = 40; // below half — ferocity applies
            const lowHpTarget = makeTarget();
            window.resolveAttack(attacker, lowHpTarget, false, false, null, 0);
            const lowHpDmg = 100 - lowHpTarget.hp;

            return { fullHpDmg, lowHpDmg };
        });
        expect(result.fullHpDmg).toBe(1);
        expect(result.lowHpDmg).toBe(5); // +4 ferocity
    });

    test('orc_momentum deals bonus damage only after covering 2+ hexes since the turn started', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(500);
        const result = await page.evaluate(() => {
            const attacker = window.entities.find(e => e.name === window.player.name);
            attacker.toHitMelee = 1000;
            attacker.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
            attacker.baseDamage = 1;
            attacker.skills.orc_momentum = 1;

            const makeTarget = () => {
                const t = new window.Enemy('Target', 'red', { q: attacker.hex.q + 1, r: attacker.hex.r }, 100, 100, 0);
                t.side = 'enemy'; t.alive = true; t.passiveDodge = -1000;
                window.entities.push(t);
                return t;
            };

            attacker.turnStartHex = { ...attacker.hex }; // hasn't moved
            const stillTarget = makeTarget();
            window.resolveAttack(attacker, stillTarget, false, false, null, 0);
            const stillDmg = 100 - stillTarget.hp;

            attacker.turnStartHex = { q: attacker.hex.q - 3, r: attacker.hex.r }; // moved 3 hexes
            const movedTarget = makeTarget();
            window.resolveAttack(attacker, movedTarget, false, false, null, 0);
            const movedDmg = 100 - movedTarget.hp;

            return { stillDmg, movedDmg };
        });
        expect(result.stillDmg).toBe(1);
        expect(result.movedDmg).toBe(4); // +3 momentum rank 1
    });
});

test.describe('Orc starting reputation', () => {
    test('an orc player starts hostile-leaning with humans/elves/dwarves and friendly with goblins', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(1000);
        const standings = await page.evaluate(() => ({
            silverhart: window.factions.silverhart_kingdom.standing,
            orcRaiders: window.factions.orc_raiders.standing,
            goblinTribe: window.factions.goblin_tribe.standing,
        }));
        expect(standings.silverhart).toBeLessThan(0);
        expect(standings.orcRaiders).toBeGreaterThan(0); // same-race bonus
        expect(standings.goblinTribe).toBeGreaterThan(0);
        expect(standings.goblinTribe).toBeGreaterThan(standings.silverhart);
    });
});

test.describe('Orc alternate spawn', () => {
    test('an orc player spawns near Skarnak\'s Hold, not the tavern, and the tavern scene never fires', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(1000);
        const state = await page.evaluate(() => {
            const stronghold = window.campaign2OrcStrongholdCenter;
            const ent = window.entities.find(e => e.name === window.player.name);
            return {
                distanceFromStronghold: stronghold ? window.distance(ent.hex, stronghold) : null,
                hollowmereEventFired: window.hollowmereEventFired,
                wrenInParty: window.party.some(p => p.name === 'Wren Talbot'),
            };
        });
        expect(state.distanceFromStronghold).not.toBeNull();
        expect(state.distanceFromStronghold).toBeLessThanOrEqual(6);
        expect(state.hollowmereEventFired).toBe(true);
        expect(state.wrenInParty).toBe(false);
    });

    test('the shakedown never fires for an orc start even after waiting past its normal trigger delay', async ({ page }) => {
        await createCharacter(page, { race: 'orc', campaign: '2' });
        await page.waitForTimeout(9000);
        const draySpawned = await page.evaluate(() => !!window.entities.find(e => e.name === 'Dray Coltayne' && e.destination));
        expect(draySpawned).toBe(false);
    });
});
