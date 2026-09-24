const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => window.WorldTextureDiscoveries?.stats?.built === true, null, { timeout: 10000 });
}

async function resolveFirstChoice(page, id) {
    return page.evaluate((discoveryId) => {
        const placed = window.WorldTextureDiscoveries.getPlaced(discoveryId);
        const h = placed.hex;
        const k = `${h.q},${h.r}`;
        const obj = window.tileObjects[k];
        const actor = window.player;
        const before = [...(actor.inventory || [])];
        let firstChoices = null;
        const original = window.showDialogue;
        window.showDialogue = (_speaker, _text, choices) => {
            if (!firstChoices && choices?.length) firstChoices = choices;
        };
        window.WorldTextureDiscoveries.interact(discoveryId, obj, h, actor);
        const label = firstChoices?.[0]?.label || null;
        firstChoices?.[0]?.action?.();
        window.showDialogue = original;
        return {
            label,
            before,
            after: [...(actor.inventory || [])],
            live: window.tileObjects[k],
            baseline: window._campaign2TileObjectsBaseline[k],
            sameReference: window.tileObjects[k] === window._campaign2TileObjectsBaseline[k],
        };
    }, id);
}

test.describe('wilderness world texture discoveries', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('places five deterministic micro-stories without replacing authored anchors', async ({ page }) => {
        const result = await page.evaluate(() => ({
            stats: window.WorldTextureDiscoveries.stats,
            ids: window.WorldTextureDiscoveries.allPlaced.map(x => x.id).sort(),
            types: Object.fromEntries(window.WorldTextureDiscoveries.allPlaced.map(x => {
                const k = `${x.hex.q},${x.hex.r}`;
                return [x.id, window.tileObjects[k]?.type];
            })),
            landmarks: {
                crossroads: window.campaign2Landmarks?.crossroads,
                reddale: window.campaign2ReddaleGuardhouseCenter,
                northwatch: window.campaign2NorthwatchCenter,
            },
        }));
        expect(result.stats.placed).toBe(5);
        expect(result.ids).toEqual([
            'east-road-broken-cart',
            'hunter-cold-camp',
            'north-road-shrine',
            'oak-road-corpse',
            'west-road-lost-pack',
        ]);
        expect(result.types['oak-road-corpse']).toBe('corpse_marker');
        expect(result.types['north-road-shrine']).toBe('signpost');
        expect(result.types['hunter-cold-camp']).toBe('fireplace');
        expect(result.landmarks.crossroads).toBeTruthy();
        expect(result.landmarks.reddale).toBeTruthy();
        expect(result.landmarks.northwatch).toBeTruthy();
    });

    test('the roadside corpse is deliberately placed under the tall-tree foliage variant', async ({ page }) => {
        const result = await page.evaluate(() => {
            const p = window.WorldTextureDiscoveries.getPlaced('oak-road-corpse');
            const h = p.hex;
            const roll = window.pseudoRandom(h.q * 7.13 + 401, h.r * 5.71 + 401 * 1.7);
            return {
                terrain: window.getTerrainAt(h.q, h.r)?.name,
                foliageIndex: Math.floor(roll * 3),
                object: window.tileObjects[`${h.q},${h.r}`],
                artLoaded: !!window.gameVisuals?.corpse_marker,
            };
        });
        expect(result.terrain).toBe('Forest');
        expect(result.foliageIndex).toBe(2); // FOLIAGE_OVERLAYS[2] === tree_small in hexMap.js
        expect(result.object.type).toBe('corpse_marker');
        expect(result.artLoaded).toBe(true);
    });

    test('searching the corpse grants its modest loot once and leaves a persistent searched body', async ({ page }) => {
        const first = await resolveFirstChoice(page, 'oak-road-corpse');
        expect(first.label).toBe('Search carefully.');
        expect(first.after.length - first.before.length).toBe(3);
        expect(first.after.slice(-3)).toEqual(['torch', 'herbs', 'dagger']);
        expect(first.live.type).toBe('corpse_marker');
        expect(first.live.searched).toBe(true);

        const second = await resolveFirstChoice(page, 'oak-road-corpse');
        expect(second.after.length).toBe(first.after.length);
    });

    test('the wayside shrine is flavour-only and grants no inventory reward', async ({ page }) => {
        const result = await resolveFirstChoice(page, 'north-road-shrine');
        expect(result.label).toBe('Leave an offering.');
        expect(result.after).toEqual(result.before);
        expect(result.live.searched).toBe(true);
        expect(result.live.flavourOnly).toBe(true);
    });

    test('searched state differs from the deterministic baseline so save diffing can persist it', async ({ page }) => {
        const result = await resolveFirstChoice(page, 'east-road-broken-cart');
        expect(result.baseline.searched).toBe(false);
        expect(result.live.searched).toBe(true);
        expect(result.sameReference).toBe(false);
        expect(result.after.slice(-3)).toEqual(['wood', 'wood', 'torch']);
    });
});
