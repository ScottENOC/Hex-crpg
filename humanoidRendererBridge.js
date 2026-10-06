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
    const activeRealtimeCarryPlans = new WeakMap();

    // Kept deliberately small: these are only the bounds values the direct
    // compositor uses for tactical placement. If a future race has no entry,
    // back-carried presentation simply falls back to the normal held weapon.
    const TACTICAL_BOUNDS_RIGS = {
        human_female:{bodyW:1.60,bodyH:1.92,yOff:-.16},
        human_male:{bodyW:1.70,bodyH:2.06,yOff:-.17},
        elf_female:{bodyW:1.60,bodyH:1.92,yOff:-.16},
        elf_male:{bodyW:2.00,bodyH:2.40,yOff:-.20},
        dwarf_female:{bodyW:1.60,bodyH:1.92,yOff:-.07},
        dwarf_male:{bodyW:1.60,bodyH:1.92,yOff:-.07},
        goblin_female:{bodyW:1.45,bodyH:1.70,yOff:-.12},
        goblin_male:{bodyW:1.50,bodyH:1.75,yOff:-.12},
        orc_female:{bodyW:1.85,bodyH:2.05,yOff:-.15},
        orc_male:{bodyW:1.90,bodyH:2.10,yOff:-.15},
    };
    const HUMAN_RENDER_ASPECT = .48;

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

    function realtimeCarryKind(itemId) {
        const item = window.items?.[itemId];
        if (!itemId || item?.type !== 'weapon') return null;
        const id = String(itemId).toLowerCase();
        const name = String(item?.name || '').toLowerCase();
        if (id.includes('dagger') || name.includes('dagger')) return 'dagger';
        if (id.includes('sword') || name.includes('sword') || id === 'starforged_blade') return 'sword';
        // Pickaxes stay in hand: they use the axe sprite but are tools, not the
        // axe family meant to hang on the back in idle exploration.
        if ((id.includes('axe') || name.includes('axe')) && !id.includes('pickaxe') && !name.includes('pickaxe')) return 'axe';
        if (id.includes('bow') || name.includes('bow')) return 'bow';
        return null;
    }

    function slotVisible(entity, slot) {
        return entity?.equipmentVisibility?.[slot] !== false;
    }

    function naturalHip(kind) {
        return kind === 'dagger' ? 'right' : 'left';
    }

    function buildRealtimeCarryPlan(entity) {
        // Combat retains the existing drawn-weapon presentation. This layer is
        // deliberately only an idle/real-time cosmetic state: equipment itself
        // remains equipped and ready for the combat renderer immediately.
        if (!entity?.equipped || window.isInCombat) return [];

        const mainId = entity.equipped.weapon;
        const offId = entity.equipped.offhand;
        const mainKind = slotVisible(entity, 'weapon') ? realtimeCarryKind(mainId) : null;
        const offKind = slotVisible(entity, 'offhand') ? realtimeCarryKind(offId) : null;
        const plan = [];

        if (mainKind) {
            plan.push({
                slot:'weapon', itemId:mainId, kind:mainKind,
                placement:(mainKind === 'axe' || mainKind === 'bow') ? 'back' : 'hip',
                hip:(mainKind === 'axe' || mainKind === 'bow') ? null : naturalHip(mainKind),
            });
        }
        if (offKind) {
            const placement = (offKind === 'axe' || offKind === 'bow') ? 'back' : 'hip';
            const occupiedHip = plan.find(entry => entry.placement === 'hip')?.hip;
            const hip = placement === 'hip'
                ? (occupiedHip ? (occupiedHip === 'left' ? 'right' : 'left') : naturalHip(offKind))
                : null;
            plan.push({slot:'offhand', itemId:offId, kind:offKind, placement, hip});
        }
        let backIndex = 0;
        for (const entry of plan) {
            if (entry.placement === 'back') entry.backIndex = backIndex++;
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
        // These are intentionally compact. The old sheath was drawn at roughly
        // one third of the body height, which made it read as a second weapon
        // rather than a believable carried scabbard.
        const scale = .65;
        const length = bounds.height * (isSword ? .335 : .205) * scale;
        const sheathWidth = Math.max(1.0, bounds.width * (isSword ? .050 : .043) * scale);
        const handleLength = bounds.height * (isSword ? .105 : .080) * scale;
        const handleWidth = Math.max(0.9, sheathWidth * .72);
        const guardWidth = Math.max(2, bounds.width * (isSword ? .105 : .075) * scale);
        const angle = hipX < .5 ? .18 : -.18;
        const leather = 'hsl(28 48% 22%)';
        const leatherHighlight = 'hsl(30 38% 31%)';
        const grip = materialCss(entity, entry.itemId, 'wood', 'hsl(28 55% 28%)');
        const metal = materialCss(entity, entry.itemId, 'metal', 'hsl(210 8% 58%)');

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.lineCap = 'round';

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

    function tacticalBounds(entity, x, y, z=1, flyOff=0) {
        const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
        const rig = TACTICAL_BOUNDS_RIGS[key];
        if (!rig) return null;
        const hs = window.hexSize || 1;
        const legacyW = rig.bodyW * hs * z;
        const legacyH = rig.bodyH * hs * z;
        const legacyTop = y - legacyW / 2 + rig.yOff * hs * z + (flyOff || 0);
        const visualW = legacyH * HUMAN_RENDER_ASPECT;
        return {left:x - visualW / 2, top:legacyTop, width:visualW, height:legacyH};
    }

    function weaponImage(entity, entry) {
        const raw = entry.kind === 'bow' ? window.gameVisuals?.bow : window.gameVisuals?.axe;
        if (!raw) return null;
        return window.equipmentAppearanceSystem?.resolveWeaponImage?.(entity, entry.itemId, raw, entry.kind) || raw;
    }

    function imageReady(image) {
        if (!image) return false;
        if ('complete' in image && image.complete === false) return false;
        return !!(image.naturalWidth || image.width);
    }

    function drawBackCarriedWeapon(ctx, entity, bounds, entry) {
        const image = weaponImage(entity, entry);
        if (!imageReady(image)) return false;
        const size = bounds.height * (entry.kind === 'bow' ? .58 : .49);
        const angleBase = entry.kind === 'bow' ? -.55 : .62;
        const angle = entry.backIndex % 2 ? -angleBase : angleBase;
        const x = bounds.left + bounds.width * (entry.backIndex % 2 ? .46 : .54);
        const y = bounds.top + bounds.height * (entry.kind === 'bow' ? .43 : .46);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.drawImage(image, -size / 2, -size / 2, size, size);
        ctx.restore();
        return true;
    }

    function drawBackCarryLayer(ctx, entity, bounds, plan) {
        if (!ctx || !bounds || !plan?.length) return false;
        let drawn = false;
        for (const entry of plan) {
            if (entry.placement === 'back') drawn = drawBackCarriedWeapon(ctx, entity, bounds, entry) || drawn;
        }
        return drawn;
    }

    function drawRealtimeHipLayer(ctx, entity, bounds, plan) {
        if (!bounds || !plan.length) return false;
        const facing = ['up','down','left','right'].includes(entity.facing) ? entity.facing : 'down';
        let drawn = false;
        for (const entry of plan) {
            if (entry.placement === 'hip') drawn = drawScabbard(ctx, entity, bounds, facing, entry) || drawn;
        }
        window.__humanoidRendererLastSheathPlan = plan.filter(entry => entry.placement === 'hip').map(entry => ({...entry}));
        window.__humanoidRendererLastCarryPlan = plan.map(entry => ({...entry}));
        return drawn;
    }

    function installRealtimeSheathedWeaponPresentation() {
        const current = window.drawHumanoidCharacter;
        if (typeof current !== 'function') return false;
        if (current.__realtimeSheathedWeaponPresentation) return true;

        const wrapped = function(ctx, entity, x, y, z, flyOff) {
            const plan = buildRealtimeCarryPlan(entity);
            if (!plan.length) return current.apply(this, arguments);

            const equipped = entity.equipped;
            const saved = {weapon:equipped.weapon, offhand:equipped.offhand};
            const facing = ['up','down','left','right'].includes(entity.facing) ? entity.facing : 'down';
            const bounds = tacticalBounds(entity, x, y, z, flyOff);
            activeRealtimeCarryPlans.set(entity, plan);

            // Front and side views: paint back-carried gear first so the body,
            // clothes and armour naturally occlude the straps/weapons.
            if (facing !== 'up' && bounds) drawBackCarryLayer(ctx, entity, bounds, plan);
            for (const entry of plan) equipped[entry.slot] = null;

            let rendered;
            try {
                rendered = current.apply(this, arguments);
            } finally {
                equipped.weapon = saved.weapon;
                equipped.offhand = saved.offhand;
                activeRealtimeCarryPlans.delete(entity);
            }

            if (rendered) {
                // Rear view: the carried weapon sits visibly across the back.
                if (facing === 'up') {
                    const renderedBounds = window.__humanoidRendererLastDraw?.entity === entity
                        ? window.__humanoidRendererLastDraw.bounds
                        : bounds;
                    if (renderedBounds) drawBackCarryLayer(ctx, entity, renderedBounds, plan);
                }
                // Always use the bounds calculated for this invocation.
                // The renderer's last-draw record can be stale after a cache
                // hit at another zoom level, which made scabbards slide or
                // resize independently of their character.
                drawRealtimeHipLayer(ctx, entity, bounds, plan);
            }
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
        setTimeout(settleIntegration, 0);
        setTimeout(settleIntegration, 100);
        setTimeout(settleIntegration, 500);
        setTimeout(settleIntegration, 1500);
    }, {once:true});

    if (document.readyState === 'complete') {
        setTimeout(settleIntegration, 0);
        setTimeout(settleIntegration, 100);
        setTimeout(settleIntegration, 500);
    }

    window.installStableHumanoidTacticalBinding = installStableTacticalBinding;
    window.installStableHumanoidCreatorPreview = installStableCreatorPreview;
    window.installRealtimeSheathedWeaponPresentation = installRealtimeSheathedWeaponPresentation;
    window.realtimeWeaponSheathing = {
        weaponKind:realtimeCarryKind,
        buildPlan:buildRealtimeCarryPlan,
        drawLayer:drawRealtimeHipLayer,
        drawBackLayer:drawBackCarryLayer,
        activePlanFor:entity => activeRealtimeCarryPlans.get(entity) || [],
    };
    window.__humanoidRendererBridgeReady = true;
})();