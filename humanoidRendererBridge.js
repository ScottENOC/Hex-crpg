// humanoidRendererBridge.js
// Stable integration seams for the direct humanoid compositor.
//
// This loads early so it can remember the original character-creator preview,
// then binds the compositor after all legacy engine scripts have finished.
(() => {
    'use strict';

    let currentPreview = window.updateAppearancePreview;
    let cleanPreview = null;
    let previewWatchInstalled = false;

    function isCleanPreview(fn) {
        return typeof fn === 'function'
            && !fn.__directHumanoidPreview
            && !fn.__identityAware
            && !fn.__stableHumanoidPreview;
    }

    // main.js defines updateAppearancePreview after this bridge is requested by
    // name.js. Capture that unwrapped function before presentation/identity
    // modules decorate it. This avoids wrapper cycles without reimplementing the
    // existing preview for elves, dwarves, orcs and goblins.
    function watchCreatorPreview() {
        const descriptor = Object.getOwnPropertyDescriptor(window, 'updateAppearancePreview');
        if (descriptor && descriptor.configurable === false) return false;
        if (descriptor?.get?.__humanoidPreviewWatch) return true;

        currentPreview = descriptor?.value ?? currentPreview;
        if (isCleanPreview(currentPreview)) cleanPreview = currentPreview;

        const getter = function() { return currentPreview; };
        getter.__humanoidPreviewWatch = true;
        Object.defineProperty(window, 'updateAppearancePreview', {
            configurable:true,
            enumerable:true,
            get:getter,
            set(fn) {
                currentPreview = fn;
                if (isCleanPreview(fn)) cleanPreview = fn;
            },
        });
        previewWatchInstalled = true;
        return true;
    }

    function installStableCreatorPreview() {
        if (typeof cleanPreview !== 'function') return false;
        if (currentPreview?.__stableHumanoidPreview) return true;

        const stablePreview = function(...args) {
            const gender = document.getElementById('gender-select');
            const body = document.getElementById('body-presentation-select');
            if (!gender || !body) return cleanPreview.apply(this, args);
            const identity = gender.value;
            gender.value = body.value;
            try { return cleanPreview.apply(this, args); }
            finally { gender.value = identity; }
        };
        // Both modules recognise these markers and therefore leave this single
        // stable wrapper alone.
        stablePreview.__stableHumanoidPreview = true;
        stablePreview.__directHumanoidPreview = true;
        stablePreview.__identityAware = true;
        window.updateAppearancePreview = stablePreview;
        return true;
    }

    function sheathableWeaponKind(itemId) {
        const item = window.items?.[itemId];
        if (!itemId || item?.type !== 'weapon') return null;
        const id = String(itemId).toLowerCase();
        const name = String(item?.name || '').toLowerCase();
        if (id.includes('dagger') || name.includes('dagger')) return 'dagger';
        if (id.includes('sword') || name.includes('sword') || id === 'starforged_blade') return 'sword';
        return null;
    }

    function slotVisible(entity, slot) {
        return entity?.equipmentVisibility?.[slot] !== false;
    }

    function naturalHip(kind) {
        return kind === 'dagger' ? 'right' : 'left';
    }

    function buildRealtimeSheathPlan(entity) {
        // Combat retains the existing drawn-weapon presentation. This layer is
        // deliberately only an idle/real-time cosmetic state: equipment itself
        // remains equipped and ready for the combat renderer immediately.
        if (!entity?.equipped || window.isInCombat) return [];

        const mainId = entity.equipped.weapon;
        const offId = entity.equipped.offhand;
        const mainKind = slotVisible(entity, 'weapon') ? sheathableWeaponKind(mainId) : null;
        const offKind = slotVisible(entity, 'offhand') ? sheathableWeaponKind(offId) : null;
        const plan = [];

        if (mainKind) {
            plan.push({slot:'weapon', itemId:mainId, kind:mainKind, hip:naturalHip(mainKind)});
        }
        if (offKind) {
            const hip = plan.length
                ? (plan[0].hip === 'left' ? 'right' : 'left')
                : naturalHip(offKind);
            plan.push({slot:'offhand', itemId:offId, kind:offKind, hip});
        }
        return plan;
    }

    function materialCss(entity, itemId, part, fallback) {
        const material = window.equipmentAppearanceSystem?.getWeaponMaterial?.(entity, itemId, part);
        if (!material) return fallback;
        const hue = Number.isFinite(Number(material.hue)) ? Number(material.hue) : 30;
        const saturation = Math.max(0, Math.min(100, Number(material.saturation ?? 50)));
        // Weapon materials store HSV value. HSL is sufficient for this tiny
        // procedural hilt and preserves the player's broad light/dark choice.
        const lightness = Math.max(8, Math.min(82, Number(material.value ?? 50) * .72));
        return `hsl(${hue} ${saturation}% ${lightness}%)`;
    }

    function screenHipX(facing, hip) {
        if (facing === 'down') return hip === 'left' ? .69 : .31;
        if (facing === 'up') return hip === 'left' ? .31 : .69;
        if (facing === 'right') return hip === 'left' ? .56 : .46;
        if (facing === 'left') return hip === 'right' ? .44 : .54;
        return hip === 'left' ? .69 : .31;
    }

    function drawScabbard(ctx, entity, bounds, facing, entry) {
        if (!ctx || !bounds || !entry) return false;
        const isSword = entry.kind === 'sword';
        const hipX = screenHipX(facing, entry.hip);
        const x = bounds.left + bounds.width * hipX;
        const y = bounds.top + bounds.height * (isSword ? .545 : .555);
        const length = bounds.height * (isSword ? .335 : .205);
        const sheathWidth = Math.max(1.4, bounds.width * (isSword ? .050 : .043));
        const handleLength = bounds.height * (isSword ? .105 : .080);
        const handleWidth = Math.max(1.2, sheathWidth * .72);
        const guardWidth = Math.max(3, bounds.width * (isSword ? .105 : .075));
        const angle = hipX < .5 ? .18 : -.18;
        const leather = 'hsl(28 48% 22%)';
        const leatherHighlight = 'hsl(30 38% 31%)';
        const grip = materialCss(entity, entry.itemId, 'wood', 'hsl(28 55% 28%)');
        const metal = materialCss(entity, entry.itemId, 'metal', 'hsl(210 8% 58%)');

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.lineCap = 'round';

        // Scabbard body. The second, thinner stroke keeps it readable at the
        // game's small tactical sprite sizes without requiring another PNG.
        ctx.strokeStyle = leather;
        ctx.lineWidth = sheathWidth;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, length);
        ctx.stroke();
        ctx.strokeStyle = leatherHighlight;
        ctx.lineWidth = Math.max(.7, sheathWidth * .28);
        ctx.beginPath();
        ctx.moveTo(-sheathWidth * .15, sheathWidth * .3);
        ctx.lineTo(-sheathWidth * .15, length - sheathWidth * .25);
        ctx.stroke();

        // Metal throat, visible hilt, guard and pommel protruding above the hip.
        ctx.strokeStyle = metal;
        ctx.lineWidth = Math.max(.8, sheathWidth * .28);
        ctx.beginPath();
        ctx.moveTo(-sheathWidth * .55, 0);
        ctx.lineTo(sheathWidth * .55, 0);
        ctx.stroke();

        ctx.strokeStyle = grip;
        ctx.lineWidth = handleWidth;
        ctx.beginPath();
        ctx.moveTo(0, -sheathWidth * .15);
        ctx.lineTo(0, -handleLength);
        ctx.stroke();

        ctx.strokeStyle = metal;
        ctx.lineWidth = Math.max(.9, sheathWidth * .28);
        ctx.beginPath();
        ctx.moveTo(-guardWidth / 2, -handleLength * .12);
        ctx.lineTo(guardWidth / 2, -handleLength * .12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -handleLength, Math.max(.9, sheathWidth * .34), 0, Math.PI * 2);
        ctx.fillStyle = metal;
        ctx.fill();

        ctx.restore();
        return true;
    }

    function drawRealtimeSheathLayer(ctx, entity, plan) {
        const last = window.__humanoidRendererLastDraw;
        if (!last?.bounds || last.entity !== entity || !plan.length) return false;
        const facing = ['up','down','left','right'].includes(entity.facing) ? entity.facing : 'down';
        let drawn = false;
        for (const entry of plan) drawn = drawScabbard(ctx, entity, last.bounds, facing, entry) || drawn;
        window.__humanoidRendererLastSheathPlan = plan.map(entry => ({...entry}));
        return drawn;
    }

    function installRealtimeSheathedWeaponPresentation() {
        const current = window.drawHumanoidCharacter;
        if (typeof current !== 'function') return false;
        if (current.__realtimeSheathedWeaponPresentation) return true;

        const wrapped = function(ctx, entity, x, y, z, flyOff) {
            const plan = buildRealtimeSheathPlan(entity);
            if (!plan.length) return current.apply(this, arguments);

            const equipped = entity.equipped;
            const saved = {weapon:equipped.weapon, offhand:equipped.offhand};
            for (const entry of plan) equipped[entry.slot] = null;

            let rendered;
            try {
                rendered = current.apply(this, arguments);
            } finally {
                // Never turn a presentation choice into an equipment-state change.
                equipped.weapon = saved.weapon;
                equipped.offhand = saved.offhand;
            }

            if (rendered) drawRealtimeSheathLayer(ctx, entity, plan);
            return rendered;
        };
        wrapped.__realtimeSheathedWeaponPresentation = true;
        wrapped.__unsheathedHumanoidDraw = current;
        window.drawHumanoidCharacter = wrapped;
        return true;
    }

    function installStableTacticalBinding() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function' || typeof window.drawHumanoidCharacter !== 'function') return false;
        if (current.__stableHumanoidTacticalBinding) return true;

        // If the first compositor already wrapped the exported function, use
        // its recorded legacy fallback. The stable binding itself owns direct
        // humanoids exactly once and sends unsupported races down the old path.
        const fallback = current.__directHumanoidCompositor && current.__legacyDrawPlayerCharacter
            ? current.__legacyDrawPlayerCharacter
            : current;
        const stable = function(ctx, entity, x, y, z, flyOff) {
            if (window.drawHumanoidCharacter(ctx, entity, x, y, z, flyOff)) return;
            return fallback.apply(this, arguments);
        };
        stable.__stableHumanoidTacticalBinding = true;
        stable.__legacyDrawPlayerCharacter = fallback;
        window.__stableHumanoidTacticalDraw = stable;
        window.drawPlayerCharacter = stable;

        // gameEngine.js calls its script-global drawPlayerCharacter binding.
        // Rebinding by indirect eval updates that global binding directly; this
        // is not canvas interception and does not touch terrain/world drawing.
        try {
            (0, eval)('drawPlayerCharacter = window.__stableHumanoidTacticalDraw');
        } catch (error) {
            console.warn('Could not rebind tactical humanoid draw function', error);
        }
        return window.drawPlayerCharacter === stable;
    }

    function settleIntegration() {
        installStableCreatorPreview();
        installRealtimeSheathedWeaponPresentation();
        installStableTacticalBinding();
    }

    watchCreatorPreview();
    window.addEventListener('load', () => {
        // Run after existing load/DOMContentLoaded wrappers have had their turn.
        setTimeout(settleIntegration, 0);
        setTimeout(settleIntegration, 100);
        setTimeout(settleIntegration, 500);
        setTimeout(settleIntegration, 1500);
    }, {once:true});

    // Also cover fast cached loads where the dynamic script arrives after load.
    if (document.readyState === 'complete') {
        setTimeout(settleIntegration, 0);
        setTimeout(settleIntegration, 100);
        setTimeout(settleIntegration, 500);
    }

    window.installStableHumanoidTacticalBinding = installStableTacticalBinding;
    window.installStableHumanoidCreatorPreview = installStableCreatorPreview;
    window.installRealtimeSheathedWeaponPresentation = installRealtimeSheathedWeaponPresentation;
    window.realtimeWeaponSheathing = {
        weaponKind:sheathableWeaponKind,
        buildPlan:buildRealtimeSheathPlan,
        drawLayer:drawRealtimeSheathLayer,
    };
    window.__humanoidRendererBridgeReady = true;
})();
