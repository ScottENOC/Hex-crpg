const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('visible human-female entity emits armour after its observed body draw', async ({ page }) => {
    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__directionalRigHandoffInstalled === true
        && window.gameVisuals?.humanLight?.complete
        && window.gameVisuals.humanLight.naturalWidth > 0);

    const result = await page.evaluate(() => {
        window.drawMap();
        window.renderEntities();
        const firstBody = window.__humanFemaleLastBodyDraw;
        const target = firstBody?.entity;
        if (!target) return { error:'no observed human-female body' };

        target.equipped = target.equipped || {};
        target.equipped.armor = 'light_armor';
        window.clothingDisplayMode = 'armor';

        const ctx = window.mapCtx;
        const downstream = ctx.drawImage.bind(ctx);
        const calls = [];
        const first = {
            name:target.name,
            timestamp:firstBody.timestamp,
            left:firstBody.left, top:firstBody.top, width:firstBody.width, height:firstBody.height,
            view:firstBody.view,
        };
        const centreX = first.left + first.width/2;
        const centreY = first.top + first.height/2;

        ctx.drawImage = function(img, ...args) {
            if (args.length === 4) {
                const [dx,dy,dw,dh] = args.map(Number);
                const cx = dx + dw/2, cy = dy + dh/2;
                if (Math.abs(cx-centreX) <= first.width*2 && Math.abs(cy-centreY) <= first.height*2) {
                    calls.push({
                        src:String(img?.currentSrc || img?.src || ''),
                        type:img?.constructor?.name || typeof img,
                        isLight:img === window.gameVisuals?.humanLight,
                        isMedium:img === window.gameVisuals?.humanMedium,
                        isHeavy:img === window.gameVisuals?.humanHeavy,
                        tagged:!!img?.__humanFemaleArmourBase,
                        dest:{dx,dy,dw,dh},
                    });
                }
            }
            return downstream(img, ...args);
        };

        window.__directionalRigHandoffLastArmour = null;
        window.drawMap();
        window.renderEntities();
        const secondBody = window.__humanFemaleLastBodyDraw;
        const armour = window.__directionalRigHandoffLastArmour;

        return {
            target:{
                name:target.name,
                race:target.race,
                gender:target.gender,
                equipped:{...target.equipped},
                goldGear:!!target.goldGear,
            },
            firstBody:first,
            secondBody:secondBody ? {
                name:secondBody.entity?.name || null,
                timestamp:secondBody.timestamp,
                left:secondBody.left, top:secondBody.top, width:secondBody.width, height:secondBody.height,
                view:secondBody.view,
            } : null,
            bodyTimestampAdvanced:!!secondBody && secondBody.timestamp > first.timestamp,
            calls,
            armour:armour ? {
                compositionSource:armour.compositionSource,
                stripDeformation:armour.stripDeformation,
            } : null,
        };
    });

    console.log('VISIBLE_HUMAN_FEMALE_ARMOUR_PATH', JSON.stringify(result));
    expect(result.error).toBeUndefined();
    expect(result.bodyTimestampAdvanced).toBe(true);
    expect(result.calls.some(call => call.isLight || call.tagged)).toBe(true);
    expect(result.armour).toBeTruthy();
});
