const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

function isDirectionalBody(src) {
    return src.includes('/images/characters/human_female/body_');
}

function isDirectionalHair(src) {
    return src.includes('/images/characters/human_female/hair_');
}

function isLegacyBody(src) {
    return /\/images\/humanfemale\.png(?:[?#]|$)/.test(src);
}

function isLegacyHair(src) {
    return /\/images\/humanfemalehair\.png(?:[?#]|$)/.test(src);
}

function nearDuplicateBodies(bodies) {
    const duplicates = [];
    for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
            const a = bodies[i].dest;
            const b = bodies[j].dest;
            if (!a || !b || !Number.isFinite(a.w) || !Number.isFinite(a.h) || !Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
            const sizeMatch = Math.abs(a.w - b.w) <= Math.max(1, a.w * 0.05)
                && Math.abs(a.h - b.h) <= Math.max(1, a.h * 0.05);
            const closeX = Math.abs(a.x - b.x) <= Math.max(3, a.w * 0.20);
            const closeY = Math.abs(a.y - b.y) <= Math.max(4, a.h * 0.12);
            if (sizeMatch && closeX && closeY) duplicates.push([bodies[i], bodies[j]]);
        }
    }
    return duplicates;
}

test.describe('human female tactical-map render path', () => {
    test('does not double-draw a directional body and never draws legacy female art', async ({ page }) => {
        await page.addInitScript(() => {
            const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            const nativeClearRect = CanvasRenderingContext2D.prototype.clearRect;
            window.__tacticalFrameId = 0;
            window.__tacticalDrawImageCalls = [];

            CanvasRenderingContext2D.prototype.clearRect = function(...args) {
                if (this === window.mapCtx) window.__tacticalFrameId += 1;
                return nativeClearRect.apply(this, args);
            };

            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
                if (this === window.mapCtx) {
                    const src = String(image?.currentSrc || image?.src || '');
                    let dest = null;
                    if (args.length === 8) dest = { x:args[4], y:args[5], w:args[6], h:args[7] };
                    else if (args.length === 4) dest = { x:args[0], y:args[1], w:args[2], h:args[3] };
                    else if (args.length === 2) dest = { x:args[0], y:args[1], w:null, h:null };
                    window.__tacticalDrawImageCalls.push({ src, dest, argsLength:args.length, frame:window.__tacticalFrameId });
                }
                return nativeDrawImage.call(this, image, ...args);
            };
        });

        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => {
            const assets = window.HUMAN_FEMALE_DIRECTIONAL_ASSETS;
            return window.__facingRendererInstalled === true
                && assets?.body?.front?.complete
                && assets.body.front.naturalWidth > 0;
        });

        expect(await page.evaluate(() => window.__facingRendererInstalled)).toBe(true);

        await page.evaluate(() => {
            const ctx = window.mapCtx;
            const downstream = ctx.drawImage.bind(ctx);
            window.__outerMapDraws = [];
            ctx.drawImage = function(image, ...args) {
                const src = String(image?.currentSrc || image?.src || '');
                let dest = null;
                if (args.length === 8) dest = { x:args[4], y:args[5], w:args[6], h:args[7] };
                else if (args.length === 4) dest = { x:args[0], y:args[1], w:args[2], h:args[3] };
                if (/humanfemale(?:hair)?\.png(?:[?#]|$)/.test(src)) {
                    window.__outerMapDraws.push({ src, dest, stack:new Error('legacy female draw').stack });
                }
                return downstream(image, ...args);
            };
            window.__tacticalDrawImageCalls.length = 0;
            window.drawMap();
            window.renderEntities();
        });

        await page.waitForFunction(() => (window.__tacticalDrawImageCalls || []).some(call =>
            (call.src || '').includes('/images/characters/human_female/body_')));

        const observed = await page.evaluate(() => ({
            calls: window.__tacticalDrawImageCalls.slice(),
            outer: window.__outerMapDraws.slice(),
        }));
        const directionalBodies = observed.calls.filter(call => isDirectionalBody(call.src || ''));
        const latestFrame = Math.max(...directionalBodies.map(call => call.frame));
        const frameCalls = observed.calls.filter(call => call.frame === latestFrame);
        const bodies = frameCalls.filter(call => isDirectionalBody(call.src || ''));
        const hair = frameCalls.filter(call => isDirectionalHair(call.src || ''));
        const legacyBody = frameCalls.filter(call => isLegacyBody(call.src || ''));
        const legacyHair = frameCalls.filter(call => isLegacyHair(call.src || ''));
        const duplicates = nearDuplicateBodies(bodies);

        console.log('HUMAN_FEMALE_RENDER_INPUTS', JSON.stringify(observed.outer));
        console.log('HUMAN_FEMALE_TACTICAL_FRAME', JSON.stringify({
            latestFrame,
            bodies,
            hairCount:hair.length,
            legacyBodyCount:legacyBody.length,
            legacyHairCount:legacyHair.length,
            duplicatePairs:duplicates,
        }));

        expect(bodies.length).toBeGreaterThan(0);
        expect(hair.length).toBe(bodies.length);
        expect(legacyBody).toHaveLength(0);
        expect(legacyHair).toHaveLength(0);
        expect(duplicates, `near-duplicate body rectangles in frame ${latestFrame}: ${JSON.stringify(duplicates)}`).toHaveLength(0);
    });

    test('equipped light armour reaches the rigid production compositor', async ({ page }) => {
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
            window.__armourPrototypeDraws.length = 0;
            window.HUMAN_FEMALE_EQUIPMENT_FIT.lastMeasuredArmour = null;
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
                body:body ? { left:body.left, top:body.top, width:body.width, height:body.height, view:body.view } : null,
                armour:armour ? {
                    dx:armour.dx, dy:armour.dy,
                    outerWidthPx:armour.outerWidthPx, outerHeightPx:armour.outerHeightPx,
                    visibleLeftPx:armour.visibleLeftPx, visibleRightPx:armour.visibleRightPx,
                    visibleTopPx:armour.visibleTopPx, visibleBottomPx:armour.visibleBottomPx,
                    targetLeftPx:armour.targetLeftPx, targetRightPx:armour.targetRightPx,
                    targetTopPx:armour.targetTopPx, targetBottomPx:armour.targetBottomPx,
                    compositionSource:armour.compositionSource,
                    stripDeformation:armour.stripDeformation,
                } : null,
                draws:window.__armourPrototypeDraws.slice(),
            };
        });

        console.log('HUMAN_FEMALE_ARMOUR_PRODUCTION_PATH', JSON.stringify(result));
        expect(result.error).toBeUndefined();
        expect(result.flags).toEqual({ facing:true, characterRig:true, fit:true, handoff:true, compositor:true });
        expect(result.body).toBeTruthy();
        expect(result.armour).toBeTruthy();
        expect(result.armour.compositionSource).toBe('directional-rig-handoff-rigid');
        expect(result.armour.stripDeformation).toBe(false);
        expect(result.draws.some(draw => draw.argsLength === 4)).toBe(true);
        expect(result.draws.some(draw => draw.argsLength === 8)).toBe(false);
        expect(result.armour.visibleLeftPx).toBeCloseTo(result.armour.targetLeftPx, 4);
        expect(result.armour.visibleRightPx).toBeCloseTo(result.armour.targetRightPx, 4);
        expect(result.armour.visibleTopPx).toBeCloseTo(result.armour.targetTopPx, 4);
        expect(result.armour.visibleBottomPx).toBeCloseTo(result.armour.targetBottomPx, 4);
    });
});