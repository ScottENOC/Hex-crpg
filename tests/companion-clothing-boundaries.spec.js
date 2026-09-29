const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForSystem(page) {
    await page.waitForFunction(() =>
        !!window.companionRelationships &&
        !!window.clothingSystem &&
        !!window.equipmentAppearanceSystem
    );
}

async function addCompanion(page, name = 'Boundary Test Companion') {
    return page.evaluate((companionName) => {
        const companion = window.createCharacterData('human', 'fighter', companionName, 'female', 'pc_1');
        companion.side = 'player';
        window.party.push(companion);
        window.clothingSystem.ensureDefaultOutfit(companion, { player: true });
        window.captureCompanionClothingBaseline(companion);
        return {
            name: companion.name,
            shirt: companion.equipped.shirt,
            pants: companion.equipped.pants,
        };
    }, name);
}

test.describe('Companion relationships and clothing boundaries', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await waitForSystem(page);
        // Boundary tests care about state, not modal presentation. Suppress the
        // real dialogue modal so one denied slider event cannot obscure later
        // assertions in the same test.
        await page.evaluate(() => { window.showDialogue = () => {}; });
    });

    test('keeps familiarity, trust and approval separate', async ({ page }) => {
        await addCompanion(page, 'Relationship Axes');
        const result = await page.evaluate(() => {
            const c = window.party.find(p => p.name === 'Relationship Axes');
            const initial = { ...window.getCompanionRelationship(c) };
            window.setCompanionRelationship(c, { familiarity: 40, trust: 25, approval: -100 }, 'test');
            const disliked = {
                rel: { ...window.getCompanionRelationship(c) },
                tier: window.companionRelationships.getTier(c),
                reveal: window.companionRelationships.canUseRevealingControls(c),
            };
            window.setCompanionRelationship(c, { approval: 100 }, 'test');
            const liked = {
                rel: { ...window.getCompanionRelationship(c) },
                tier: window.companionRelationships.getTier(c),
                reveal: window.companionRelationships.canUseRevealingControls(c),
            };
            return { initial, disliked, liked };
        });

        expect(result.initial.familiarity).toBe(10);
        expect(result.initial.trust).toBe(10);
        expect(result.initial.approval).toBe(0);
        expect(result.disliked.tier).toBe('familiar');
        expect(result.disliked.reveal).toBe(false);
        expect(result.liked.tier).toBe('familiar');
        expect(result.liked.reveal).toBe(false);
        expect(result.liked.rel.approval).toBe(100);
    });

    test('new companions refuse player-directed clothing edits', async ({ page }) => {
        await addCompanion(page, 'New Companion');
        const result = await page.evaluate(() => {
            const c = window.party.find(p => p.name === 'New Companion');
            const itemId = c.equipped.shirt;
            const spec = window.clothingSystem.getItemSpec(itemId);
            const layer = spec.layers[0];
            const before = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };
            const changed = window.clothingSystem.setLayerColour(c, itemId, layer.id, {
                ...before,
                hue: (before.hue + 90) % 360,
            });
            const after = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };
            return { changed, before, after, tier: window.companionRelationships.getTier(c) };
        });

        expect(result.tier).toBe('new');
        expect(result.changed).toBe(false);
        expect(result.after.hue).toBe(result.before.hue);
    });

    test('familiar companions allow styling but preserve their initial coverage', async ({ page }) => {
        await addCompanion(page, 'Familiar Companion');
        const result = await page.evaluate(() => {
            const c = window.party.find(p => p.name === 'Familiar Companion');
            window.setCompanionRelationship(c, { familiarity: 45, trust: 30 }, 'test');
            const itemId = c.equipped.shirt;
            const spec = window.clothingSystem.getItemSpec(itemId);
            const layer = spec.layers[0];
            const initial = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };

            const colourAllowed = window.clothingSystem.setLayerColour(c, itemId, layer.id, {
                ...initial,
                hue: (initial.hue + 55) % 360,
            });
            const recoloured = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };
            const transparencyBlocked = window.clothingSystem.setLayerColour(c, itemId, layer.id, {
                ...recoloured,
                opacity: Math.max(0, initial.opacity - 0.25),
            });
            const afterTransparency = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };

            const beforeVisible = window.equipmentAppearanceSystem.isSlotVisible(c, 'shirt');
            const hideAllowed = window.equipmentAppearanceSystem.setSlotVisible(c, 'shirt', false);
            const afterVisible = window.equipmentAppearanceSystem.isSlotVisible(c, 'shirt');

            window.player = c;
            const shirtBeforeUnequip = c.equipped.shirt;
            const unequipAllowed = window.unequipItem('shirt');
            const shirtAfterUnequip = c.equipped.shirt;

            return {
                colourAllowed,
                transparencyBlocked,
                hideAllowed,
                unequipAllowed,
                initial,
                recoloured,
                afterTransparency,
                beforeVisible,
                afterVisible,
                shirtBeforeUnequip,
                shirtAfterUnequip,
            };
        });

        expect(result.colourAllowed).toBe(true);
        expect(result.recoloured.hue).not.toBe(result.initial.hue);
        expect(result.transparencyBlocked).toBe(false);
        expect(result.afterTransparency.opacity).toBe(result.initial.opacity);
        expect(result.beforeVisible).toBe(true);
        expect(result.hideAllowed).toBe(false);
        expect(result.afterVisible).toBe(true);
        expect(result.unequipAllowed).toBe(false);
        expect(result.shirtAfterUnequip).toBe(result.shirtBeforeUnequip);
    });

    test('high trust allows revealing controls without making trust equal blanket consent', async ({ page }) => {
        await addCompanion(page, 'Trusted Companion');
        const result = await page.evaluate(() => {
            const c = window.party.find(p => p.name === 'Trusted Companion');
            window.setCompanionRelationship(c, { familiarity: 60, trust: 85 }, 'test');
            const itemId = c.equipped.shirt;
            const spec = window.clothingSystem.getItemSpec(itemId);
            const layer = spec.layers[0];
            const initial = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };
            const transparencyAllowed = window.clothingSystem.setLayerColour(c, itemId, layer.id, {
                ...initial,
                opacity: 0.4,
            });
            const hideAllowed = window.equipmentAppearanceSystem.setSlotVisible(c, 'shirt', false);
            const opacity = window.clothingSystem.getLayerColour(c, itemId, layer).opacity;
            const visible = window.equipmentAppearanceSystem.isSlotVisible(c, 'shirt');

            // A companion may author a permanent stricter boundary regardless
            // of numerical trust. Styling remains allowed; more revealing edits do not.
            c.companionClothingPolicy = { allowRevealing: false };
            window.equipmentAppearanceSystem.setSlotVisible(c, 'shirt', true);
            const hardBoundaryHide = window.equipmentAppearanceSystem.setSlotVisible(c, 'shirt', false);
            const visibleAfterHardBoundary = window.equipmentAppearanceSystem.isSlotVisible(c, 'shirt');
            return { transparencyAllowed, hideAllowed, opacity, visible, hardBoundaryHide, visibleAfterHardBoundary };
        });

        expect(result.transparencyAllowed).toBe(true);
        expect(result.hideAllowed).toBe(true);
        expect(result.opacity).toBeCloseTo(0.4, 5);
        expect(result.visible).toBe(false);
        expect(result.hardBoundaryHide).toBe(false);
        expect(result.visibleAfterHardBoundary).toBe(true);
    });

    test('never traps an existing revealing state: making it more opaque is allowed', async ({ page }) => {
        await addCompanion(page, 'Coverage Recovery');
        const result = await page.evaluate(() => {
            const c = window.party.find(p => p.name === 'Coverage Recovery');
            window.setCompanionRelationship(c, { familiarity: 60, trust: 85 }, 'test');
            const itemId = c.equipped.shirt;
            const layer = window.clothingSystem.getItemSpec(itemId).layers[0];
            const initial = { ...window.clothingSystem.getLayerColour(c, itemId, layer) };
            window.clothingSystem.setLayerColour(c, itemId, layer.id, { ...initial, opacity: 0.4 });

            window.setCompanionRelationship(c, { trust: 30 }, 'test');
            const moreOpaque = window.clothingSystem.setLayerColour(c, itemId, layer.id, { ...initial, opacity: 0.6 });
            const afterMoreOpaque = window.clothingSystem.getLayerColour(c, itemId, layer).opacity;
            const moreRevealing = window.clothingSystem.setLayerColour(c, itemId, layer.id, { ...initial, opacity: 0.3 });
            const afterMoreRevealing = window.clothingSystem.getLayerColour(c, itemId, layer).opacity;
            return { moreOpaque, afterMoreOpaque, moreRevealing, afterMoreRevealing };
        });

        expect(result.moreOpaque).toBe(true);
        expect(result.afterMoreOpaque).toBeCloseTo(0.6, 5);
        expect(result.moreRevealing).toBe(false);
        expect(result.afterMoreRevealing).toBeCloseTo(0.6, 5);
    });

    test('main player is never governed by companion clothing consent', async ({ page }) => {
        const result = await page.evaluate(() => {
            const p = window.party[0];
            window.clothingSystem.ensureDefaultOutfit(p, { player: true });
            const itemId = p.equipped.shirt;
            const layer = window.clothingSystem.getItemSpec(itemId).layers[0];
            const before = { ...window.clothingSystem.getLayerColour(p, itemId, layer) };
            const changed = window.clothingSystem.setLayerColour(p, itemId, layer.id, { ...before, opacity: 0.2 });
            const after = window.clothingSystem.getLayerColour(p, itemId, layer).opacity;
            return { changed, after, governed: window.companionRelationships.isGovernedCompanion(p) };
        });

        expect(result.governed).toBe(false);
        expect(result.changed).toBe(true);
        expect(result.after).toBeCloseTo(0.2, 5);
    });

    test('Wren snapshots her authored 25% transparent main underwear as her personal baseline', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.currentCampaign = '2';
            const wren = window.createCharacterData('human', 'fighter', 'Wren Talbot', 'female', 'pc_1');
            window.applyCharacterAppearancePreset?.(wren, 'scenario2_wren', { campaign: '2', force: true });
            wren.side = 'player';
            window.party.push(wren);
            const baseline = window.captureCompanionClothingBaseline(wren, { force: true });
            return {
                bra: baseline.slots.bra,
                underwear: baseline.slots.underwear,
            };
        });

        expect(result.bra.initiallyOccupied).toBe(true);
        expect(result.underwear.initiallyOccupied).toBe(true);
        expect(result.bra.layers.main.minOpacity).toBeCloseTo(0.75, 5);
        expect(result.bra.layers.trim.minOpacity).toBeCloseTo(1, 5);
        expect(result.underwear.layers.main.minOpacity).toBeCloseTo(0.75, 5);
        expect(result.underwear.layers.trim.minOpacity).toBeCloseTo(1, 5);
    });
});