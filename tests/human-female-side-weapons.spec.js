const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function instrumentMapDraws(page) {
    await page.addInitScript(() => {
        const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
        const nativeClearRect = CanvasRenderingContext2D.prototype.clearRect;
        window.__weaponTestFrame = 0;
        window.__weaponTestDraws = [];

        CanvasRenderingContext2D.prototype.clearRect = function(...args) {
            if (this === window.mapCtx) window.__weaponTestFrame += 1;
            return nativeClearRect.apply(this, args);
        };

        CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
            if (this === window.mapCtx) {
                const src = String(image?.currentSrc || image?.src || '');
                let dest = null;
                if (args.length === 8) dest = { x:args[4], y:args[5], w:args[6], h:args[7] };
                else if (args.length === 4) dest = { x:args[0], y:args[1], w:args[2], h:args[3] };
                const t = this.getTransform();
                window.__weaponTestDraws.push({
                    src,
                    dest,
                    frame:window.__weaponTestFrame,
                    transform:{ a:t.a, d:t.d, e:t.e, f:t.f },
                });
            }
            return nativeDrawImage.call(this, image, ...args);
        };
    });
}

async function setDualWeaponsAndFacing(page, facing) {
    await page.evaluate((nextFacing) => {
        for (const e of window.entities || []) {
            if (e?.alive && e.race === 'human' && e.gender === 'female') {
                e.equipped = e.equipped || {};
                e.equipped.weapon = 'sword';
                e.equipped.offhand = 'axe';
                e.facing = nextFacing;
            }
        }
        window.__weaponTestDraws.length = 0;
    }, facing);

    await page.waitForFunction(() => {
        const calls = window.__weaponTestDraws || [];
        const swordSrc = String(window.gameVisuals?.swordIcon?.currentSrc || window.gameVisuals?.swordIcon?.src || '');
        const axeSrc = String(window.gameVisuals?.axe?.currentSrc || window.gameVisuals?.axe?.src || '');
        return calls.some(c => c.src.includes('/images/characters/human_female/body_'))
            && calls.some(c => c.src === swordSrc)
            && calls.some(c => c.src === axeSrc);
    });
}

function latestCompleteFrame(calls, swordSrc, axeSrc) {
    const frames = [...new Set(calls.map(c => c.frame))].sort((a, b) => b - a);
    return frames.map(frame => ({ frame, calls:calls.filter(c => c.frame === frame) }))
        .find(entry => entry.calls.some(c => c.src.includes('/images/characters/human_female/body_'))
            && entry.calls.some(c => c.src === swordSrc)
            && entry.calls.some(c => c.src === axeSrc));
}

function firstCallIndex(calls, predicate) {
    return calls.findIndex(predicate);
}

function centreX(draw) {
    return draw.dest.x + draw.dest.w / 2;
}

test.describe('human female side-facing weapon presentation', () => {
    test('mirrors weapon anchors and puts the far hand behind the body', async ({ page }) => {
        await instrumentMapDraws(page);
        await createCharacter(page, { race:'human', gender:'female' });
        await page.waitForFunction(() => window.__facingRendererInstalled === true
            && window.HUMAN_FEMALE_DIRECTIONAL_ASSETS?.body?.side?.complete
            && window.gameVisuals?.swordIcon?.complete
            && window.gameVisuals?.axe?.complete);

        const sources = await page.evaluate(() => ({
            sword:String(window.gameVisuals.swordIcon.currentSrc || window.gameVisuals.swordIcon.src || ''),
            axe:String(window.gameVisuals.axe.currentSrc || window.gameVisuals.axe.src || ''),
        }));

        await setDualWeaponsAndFacing(page, 'right');
        const rightObserved = await page.evaluate(() => window.__weaponTestDraws.slice());
        const rightFrame = latestCompleteFrame(rightObserved, sources.sword, sources.axe);
        expect(rightFrame).toBeTruthy();

        const rightBodyIndex = firstCallIndex(rightFrame.calls, c => c.src.includes('/images/characters/human_female/body_side.png'));
        const rightSwordIndex = firstCallIndex(rightFrame.calls, c => c.src === sources.sword);
        const rightAxeIndex = firstCallIndex(rightFrame.calls, c => c.src === sources.axe);
        expect(rightAxeIndex).toBeGreaterThanOrEqual(0);
        expect(rightBodyIndex).toBeGreaterThan(rightAxeIndex); // off hand is behind when facing right
        expect(rightSwordIndex).toBeGreaterThan(rightBodyIndex); // main hand stays in front

        const rightBody = rightFrame.calls[rightBodyIndex];
        const rightSword = rightFrame.calls[rightSwordIndex];
        expect(centreX(rightSword)).toBeGreaterThan(centreX(rightBody));
        expect(rightSword.transform.a).toBeGreaterThan(0);

        await setDualWeaponsAndFacing(page, 'left');
        const leftObserved = await page.evaluate(() => window.__weaponTestDraws.slice());
        const leftFrame = latestCompleteFrame(leftObserved, sources.sword, sources.axe);
        expect(leftFrame).toBeTruthy();

        const leftBodyIndex = firstCallIndex(leftFrame.calls, c => c.src.includes('/images/characters/human_female/body_side.png'));
        const leftSwordIndex = firstCallIndex(leftFrame.calls, c => c.src === sources.sword);
        const leftAxeIndex = firstCallIndex(leftFrame.calls, c => c.src === sources.axe);
        expect(leftSwordIndex).toBeGreaterThanOrEqual(0);
        expect(leftBodyIndex).toBeGreaterThan(leftSwordIndex); // main hand is behind when facing left
        expect(leftAxeIndex).toBeGreaterThan(leftBodyIndex); // off hand stays in front

        const leftBody = leftFrame.calls[leftBodyIndex];
        const leftSword = leftFrame.calls[leftSwordIndex];
        expect(centreX(leftSword)).toBeLessThan(centreX(leftBody));
        expect(leftSword.transform.a).toBeLessThan(0); // weapon artwork mirrors with facing
    });
});