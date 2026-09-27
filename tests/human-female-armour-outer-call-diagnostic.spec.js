const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('outer map renderer exposes human-female armour calls to the handoff', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__directionalRigHandoffInstalled === true
        && window.gameVisuals?.humanLight?.complete
        && window.gameVisuals.humanLight.naturalWidth > 0);

    const result = await page.evaluate(() => {
        const females = (window.entities || []).filter(e => e?.alive && e.race === 'human' && e.gender === 'female');
        for (const entity of females) {
            entity.equipped = entity.equipped || {};
            entity.equipped.armor = 'light_armor';
        }
        window.clothingDisplayMode = 'armor';

        const ctx = window.mapCtx;
        const downstream = ctx.drawImage.bind(ctx);
        const outerCalls = [];
        ctx.drawImage = function(img, ...args) {
            if (img === window.gameVisuals?.humanLight || img?.__humanFemaleArmourBase === window.gameVisuals?.humanLight) {
                outerCalls.push({
                    exactBase:img === window.gameVisuals?.humanLight,
                    tagged:!!img?.__humanFemaleArmourBase,
                    argsLength:args.length,
                    args:args.map(Number),
                    activeEntity:window.__activeCharacterEntity?.name || null,
                    activeFacing:window.__activeCharacterFacing || null,
                    lastBody:window.__humanFemaleLastBodyDraw ? {
                        entity:window.__humanFemaleLastBodyDraw.entity?.name || null,
                        left:window.__humanFemaleLastBodyDraw.left,
                        top:window.__humanFemaleLastBodyDraw.top,
                        width:window.__humanFemaleLastBodyDraw.width,
                        height:window.__humanFemaleLastBodyDraw.height,
                        view:window.__humanFemaleLastBodyDraw.view,
                    } : null,
                });
            }
            return downstream(img, ...args);
        };

        window.__directionalRigHandoffLastArmour = null;
        if (window.HUMAN_FEMALE_EQUIPMENT_FIT) window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour = null;
        window.drawMap();
        window.renderEntities();

        const armour = window.__directionalRigHandoffLastArmour;
        return {
            femaleCount:females.length,
            names:females.map(e => e.name),
            outerCalls,
            armour:armour ? {
                compositionSource:armour.compositionSource,
                stripDeformation:armour.stripDeformation,
                view:armour.view,
                bodyEntity:armour.bodyBounds?.entity?.name || null,
            } : null,
            flags:{
                handoff:window.__directionalRigHandoffInstalled,
                compositor:window.__directionalRigArmourCompositorInstalled,
                freeze:window.__armourFreezeDiagnosticInstalled || false,
            },
        };
    });

    console.log('HUMAN_FEMALE_ARMOUR_OUTER_CALLS', JSON.stringify(result));
    expect(result.femaleCount).toBeGreaterThan(0);
    expect(result.outerCalls.length).toBeGreaterThan(0);
    expect(result.armour).toBeTruthy();
    expect(result.armour.compositionSource).toBe('directional-rig-handoff-rigid');
});
