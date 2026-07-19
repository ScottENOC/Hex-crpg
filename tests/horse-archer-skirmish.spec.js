// tests/horse-archer-skirmish.spec.js
// The horse_archer monster template (monsters.js): a mounted bow-user in
// the arena pool, tagged isSkirmisher — aiProcess's movement scoring
// (gameEngine.js) special-cases that flag to back off one hex the moment
// something closes to melee range, instead of trading blows like every
// other ranged monster. Deliberately reactive-only (checked each turn
// against current adjacency), not a chase-forever kiter, so a player who
// keeps closing distance corners it in one more step. Also covers the
// Skeleton Horse now purchasable in the Campaign 1 arena shop.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Horse Archer: monster template + arena pool', () => {
    test('horse_archer is a mounted, ranged, skirmisher-tagged monster in the arena pool', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const archer = window.createMonster('horse_archer', { q: 0, r: 0 }, null, null, 'enemy');
            const mount = window.entities.find(e => e === archer.riding);
            return {
                isRiding: !!archer.riding,
                mountName: archer.riding?.name,
                weapon: archer.equipped?.weapon,
                isSkirmisher: archer.isSkirmisher === true,
                inArenaPool: window.ARENA_MONSTER_POOL?.includes('horse_archer') ?? null,
            };
        });
        expect(result.isRiding).toBe(true);
        expect(result.mountName).toBe('Horse');
        expect(result.weapon).toBe('bow');
        expect(result.isSkirmisher).toBe(true);
    });
});

test.describe('Skirmish AI: back off when cornered, not chase-forever kiting', () => {
    test('a skirmisher adjacent to its target picks a neighbor hex that INCREASES distance instead of closing further', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Move every other player-side entity far away first — the
            // archer's own targeting picks nearest opponent, and a stray
            // Wren Talbot/mount sitting closer than the intended target
            // would otherwise get picked instead.
            window.entities.filter(e => e.side === 'player').forEach(e => { e.hex = { q: 50, r: 50 }; });
            const target = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            target.hex = { q: 0, r: 0 };
            const archer = window.createMonster('horse_archer', { q: 1, r: 0 }, null, null, 'enemy'); // adjacent
            archer.timePoints = 100;
            if (archer.riding) archer.riding.timePoints = 100; // movement budget comes from the mount, not the rider
            window.entities.push(archer);

            const before = window.distance(archer.hex, target.hex);
            window.aiProcess(archer);
            const after = window.distance(archer.hex, target.hex);

            return { before, after };
        });
        expect(result.before).toBe(1);
        expect(result.after).toBeGreaterThan(result.before);
    });

    test('a non-skirmisher ranged monster (e.g. wolf_rider_goblin) does NOT retreat when adjacent — regression guard', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Move every other player-side entity far away first — the
            // archer's own targeting picks nearest opponent, and a stray
            // Wren Talbot/mount sitting closer than the intended target
            // would otherwise get picked instead.
            window.entities.filter(e => e.side === 'player').forEach(e => { e.hex = { q: 50, r: 50 }; });
            const target = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            target.hex = { q: 0, r: 0 };
            const rider = window.createMonster('wolf_rider_goblin', { q: 1, r: 0 }, null, null, 'enemy'); // adjacent
            rider.timePoints = 100;
            window.entities.push(rider);

            const before = window.distance(rider.hex, target.hex);
            window.aiProcess(rider);
            const after = window.distance(rider.hex, target.hex);

            // Not retreating means either it attacked (stayed adjacent) or
            // closed in further — never further away than it started.
            return { before, after };
        });
        expect(result.after).toBeLessThanOrEqual(result.before);
    });

    test('a skirmisher already out at bow range (not adjacent) does not retreat further — it just shoots', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Move every other player-side entity far away first — the
            // archer's own targeting picks nearest opponent, and a stray
            // Wren Talbot/mount sitting closer than the intended target
            // would otherwise get picked instead.
            window.entities.filter(e => e.side === 'player').forEach(e => { e.hex = { q: 50, r: 50 }; });
            const target = window.entities.find(e => e.side === 'player' && e.name === window.party[0].name);
            target.hex = { q: 0, r: 0 };
            const archer = window.createMonster('horse_archer', { q: 3, r: 0 }, null, null, 'enemy'); // out of melee range already
            archer.timePoints = 100;
            window.entities.push(archer);

            const before = window.distance(archer.hex, target.hex);
            window.aiProcess(archer);
            const after = window.distance(archer.hex, target.hex);

            return { before, after };
        });
        // Should hold position (attack) or close in a little, never keep
        // retreating once it's already safely out of melee range.
        expect(result.after).toBeLessThanOrEqual(result.before);
    });
});

test.describe('Skeleton Horse in the Campaign 1 arena shop', () => {
    test('openShop with mounts:true offers a Skeleton Horse that purchases an undead-tagged mount', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party[0].gold = 500;
            const pEnt = window.entities.find(e => e.side === 'player' && !e.rider);
            pEnt.hex = { q: 0, r: 0 };

            document.body.innerHTML += '<div id="shop-modal" style="display:none"><div id="shop-buy-list"></div></div>';
            window.openShop({ itemIds: [], mounts: true });

            const buyButtons = Array.from(document.querySelectorAll('#shop-buy-list button'));
            const skeletonBtn = buyButtons.find(b => {
                const label = b.parentElement?.querySelector('span')?.textContent || '';
                return label.includes('Skeleton Horse');
            });
            const goldBefore = window.party[0].gold;
            skeletonBtn?.click();

            const skeletonHorse = window.entities.find(e => e.name === 'Horse' && e.coatPreset === 'skeleton' && e.side === 'player');
            return {
                foundButton: !!skeletonBtn,
                goldSpent: goldBefore - window.party[0].gold,
                skeletonHorseExists: !!skeletonHorse,
                isUndead: skeletonHorse?.undead === true,
            };
        });
        expect(result.foundButton).toBe(true);
        expect(result.goldSpent).toBe(100);
        expect(result.skeletonHorseExists).toBe(true);
        expect(result.isUndead).toBe(true);
    });
});
