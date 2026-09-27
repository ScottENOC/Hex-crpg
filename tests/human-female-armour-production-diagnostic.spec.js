const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('equipped human-female armour reaches the rigid compositor when armour display is forced', async ({ page }) => {
    await page.addInitScript(() => {
        const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
        window.__armourPrototypeDraws = [];
        CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
            if (this === window.mapCtx) {
                const src = String(image?.currentSrc || image?.src || '');
                if (src.includes('/images/humanlightarmour.png')) {
                    let dest = null;
                    if (args.length === 8) dest = { x:args[4], y:args[5], w:args[6], h:args[7] };
                    else if (args.length === 4) dest = { x:args[0], y:args[1], w:args[2], h:args[3] };
                    window.__armourPrototypeDraws.push({ src, argsLength:args.length, dest });
                }
            }
            return nativeDrawImage.call(this, image, ...args);
        };
    });

    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__directionalRigHandoffInstalled === true
        && window.gameVisuals?.humanLight?.complete
        && window.gameVisuals.humanLight.naturalWidth > 0);

    const result = await page.evaluate(() => {
        const entity = (window.entities || []).find(e => e?.alive && e.race === 'human' && e.gender === 'female' && e.side === 'player')
            || (window.entities || []).find(e => e?.alive && e.race === 'human' && e.gender === 'female');
        if (!entity) return { error:'no human female entity' };

        entity.equipped = entity.equipped || {};
        entity.equipped.armor = 'light_armor';
        // Force the same display path visible in the iPhone screenshots. The
        // inventory preference can otherwise suppress armour entirely in tests.
        window.clothingDisplayMode = 'armor';

        window.__armourPrototypeDraws.length = 0;
        if (window.HUMAN_FEMALE_EQUIPMENT_FIT) window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour = null;
        window.__directionalRigHandoffLastArmour = null;
        window.drawMap();
        window.renderEntities();

        const body = window.__humanFemaleLastBodyDraw;
        const armour = window.__directionalRigHandoffLastArmour;
        return {
            flags: {
                facing:window.__facingRendererInstalled,
                characterRig:window.__characterRigInstalled,
                fit:window.__directionalEquipmentFitTuningApplied,
                handoff:window.__directionalRigHandoffInstalled,
                compositor:window.__directionalRigArmourCompositorInstalled,
            },
            clothingDisplayMode:window.clothingDisplayMode,
            body:body ? { left:body.left, top:body.top, width:body.width, height:body.height, view:body.view } : null,
            armour:armour ? {
                dx:armour.dx,
                dy:armour.dy,
                outerWidthPx:armour.outerWidthPx,
                outerHeightPx:armour.outerHeightPx,
                visibleLeftPx:armour.visibleLeftPx,
                visibleRightPx:armour.visibleRightPx,
                visibleTopPx:armour.visibleTopPx,
                visibleBottomPx:armour.visibleBottomPx,
                targetLeftPx:armour.targetLeftPx,
                targetRightPx:armour.targetRightPx,
                targetTopPx:armour.targetTopPx,
                targetBottomPx:armour.targetBottomPx,
                compositionSource:armour.compositionSource,
                stripDeformation:armour.stripDeformation,
            } : null,
            draws:window.__armourPrototypeDraws.slice(),
        };
    });

    console.log('HUMAN_FEMALE_ARMOUR_FORCED_PATH', JSON.stringify(result));
    expect(result.error).toBeUndefined();
    expect(result.flags).toEqual({ facing:true, characterRig:true, fit:true, handoff:true, compositor:true });
    expect(result.clothingDisplayMode).toBe('armor');
    expect(result.body).toBeTruthy();
    expect(result.armour).toBeTruthy();
    expect(result.armour.compositionSource).toBe('directional-rig-handoff-rigid');
    expect(result.armour.stripDeformation).toBe(false);
    expect(result.draws.some(draw => draw.argsLength === 4)).toBe(true);
    expect(result.draws.some(draw => draw.argsLength === 8)).toBe(false);
});
