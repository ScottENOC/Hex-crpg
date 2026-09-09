// characterRig.js
// Presentation roadmap foundation: deformable equipment overlays.
//
// gameEngine.js already owns the base character renderer and its CHAR_CONFIG
// table. Rather than duplicate that renderer, this module upgrades the one
// weak point in-place: armour was previously one stretched rectangle
// (armour.wMult + armour.topShift). We intercept ONLY armour drawImage calls
// on mapCtx and replace that single rectangle with a six-anchor mesh:
// shoulder L/R -> waist L/R -> hem L/R. Each of the two strips is split into
// two affine triangles, giving us piecewise deformation with four draw calls.
//
// That matters because race proportions are not uniform scales: dwarves are
// shorter/wider, elves taller/narrower, goblins smaller/wiry, etc. The mesh
// can therefore squeeze the waist while retaining broad shoulders, or widen
// the whole torso without needing race-specific armour artwork.
//
// At tactical zoom (<0.55) we deliberately fall back to the original single
// drawImage: the deformation is visually unreadable there and the existing
// mobile LOD policy values fewer draw calls.

(() => {
    'use strict';

    const ARMOUR_RIGS = {
        human_male:   { shoulderL:0.05, shoulderR:0.95, waistL:0.14, waistR:0.86, hemL:0.10, hemR:0.90, waistY:0.56 },
        human_female: { shoulderL:0.08, shoulderR:0.92, waistL:0.20, waistR:0.80, hemL:0.12, hemR:0.88, waistY:0.55 },
        elf_male:     { shoulderL:0.08, shoulderR:0.92, waistL:0.18, waistR:0.82, hemL:0.13, hemR:0.87, waistY:0.58 },
        elf_female:   { shoulderL:0.10, shoulderR:0.90, waistL:0.22, waistR:0.78, hemL:0.14, hemR:0.86, waistY:0.57 },
        dwarf_male:   { shoulderL:0.02, shoulderR:0.98, waistL:0.08, waistR:0.92, hemL:0.04, hemR:0.96, waistY:0.53 },
        dwarf_female: { shoulderL:0.03, shoulderR:0.97, waistL:0.10, waistR:0.90, hemL:0.05, hemR:0.95, waistY:0.53 },
        orc_male:     { shoulderL:0.02, shoulderR:0.98, waistL:0.11, waistR:0.89, hemL:0.06, hemR:0.94, waistY:0.55 },
        orc_female:   { shoulderL:0.04, shoulderR:0.96, waistL:0.14, waistR:0.86, hemL:0.08, hemR:0.92, waistY:0.55 },
        goblin_male:  { shoulderL:0.09, shoulderR:0.91, waistL:0.18, waistR:0.82, hemL:0.12, hemR:0.88, waistY:0.55 },
        goblin_female:{ shoulderL:0.10, shoulderR:0.90, waistL:0.21, waistR:0.79, hemL:0.14, hemR:0.86, waistY:0.55 },
        revenant_male:{ shoulderL:0.06, shoulderR:0.94, waistL:0.15, waistR:0.85, hemL:0.10, hemR:0.90, waistY:0.56 },
        revenant_female:{ shoulderL:0.08, shoulderR:0.92, waistL:0.19, waistR:0.81, hemL:0.12, hemR:0.88, waistY:0.55 },
        skeleton_male:{ shoulderL:0.08, shoulderR:0.92, waistL:0.18, waistR:0.82, hemL:0.12, hemR:0.88, waistY:0.56 },
        skeleton_female:{ shoulderL:0.10, shoulderR:0.90, waistL:0.21, waistR:0.79, hemL:0.14, hemR:0.86, waistY:0.55 },
    };

    const goldArmourImages = new WeakSet();

    function isBaseArmourImage(img) {
        const g = window.gameVisuals;
        return !!img && !!g && (img === g.humanLight || img === g.humanMedium || img === g.humanHeavy);
    }

    function isArmourImage(img) {
        return isBaseArmourImage(img) || (!!img && goldArmourImages.has(img));
    }

    function computeMeshPoints(rig, dx, dy, dw, dh) {
        return {
            shoulderL: { x: dx + rig.shoulderL * dw, y: dy },
            shoulderR: { x: dx + rig.shoulderR * dw, y: dy },
            waistL:    { x: dx + rig.waistL    * dw, y: dy + rig.waistY * dh },
            waistR:    { x: dx + rig.waistR    * dw, y: dy + rig.waistY * dh },
            hemL:      { x: dx + rig.hemL      * dw, y: dy + dh },
            hemR:      { x: dx + rig.hemR      * dw, y: dy + dh },
        };
    }

    function affineFromTriangles(s0, s1, s2, d0, d1, d2) {
        const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
        if (Math.abs(den) < 1e-8) return null;

        const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
        const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
        const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;

        const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
        const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
        const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
        return { a, b, c, d, e, f };
    }

    function drawTriangle(ctx, nativeDrawImage, img, s0, s1, s2, d0, d1, d2) {
        const m = affineFromTriangles(s0, s1, s2, d0, d1, d2);
        if (!m) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(d0.x, d0.y);
        ctx.lineTo(d1.x, d1.y);
        ctx.lineTo(d2.x, d2.y);
        ctx.closePath();
        ctx.clip();
        ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        nativeDrawImage(img, 0, 0);
        ctx.restore();
    }

    function drawWarpedArmour(ctx, nativeDrawImage, img, rig, dx, dy, dw, dh) {
        if (!img || !img.width || !img.height || !rig) {
            nativeDrawImage(img, dx, dy, dw, dh);
            return;
        }

        const p = computeMeshPoints(rig, dx, dy, dw, dh);
        const iw = img.width, ih = img.height;
        const sy = rig.waistY * ih;
        const sTL = {x:0,  y:0},  sTR = {x:iw, y:0};
        const sWL = {x:0,  y:sy}, sWR = {x:iw, y:sy};
        const sBL = {x:0,  y:ih}, sBR = {x:iw, y:ih};

        // Upper strip (shoulder -> waist), two triangles.
        drawTriangle(ctx, nativeDrawImage, img, sTL, sTR, sWR, p.shoulderL, p.shoulderR, p.waistR);
        drawTriangle(ctx, nativeDrawImage, img, sTL, sWR, sWL, p.shoulderL, p.waistR, p.waistL);
        // Lower strip (waist -> hem), two triangles.
        drawTriangle(ctx, nativeDrawImage, img, sWL, sWR, sBR, p.waistL, p.waistR, p.hemR);
        drawTriangle(ctx, nativeDrawImage, img, sWL, sBR, sBL, p.waistL, p.hemR, p.hemL);

        if (window.charDebugMode) {
            ctx.save();
            ctx.font = '8px monospace';
            const dots = [
                ['SL', p.shoulderL, '#ff8a80'], ['SR', p.shoulderR, '#ff8a80'],
                ['WL', p.waistL, '#80d8ff'], ['WR', p.waistR, '#80d8ff'],
                ['HL', p.hemL, '#ccff90'], ['HR', p.hemR, '#ccff90'],
            ];
            for (const [label, pt, color] of dots) {
                ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = color; ctx.fill();
                ctx.fillStyle = '#fff'; ctx.fillText(label, pt.x + 3, pt.y - 2);
            }
            ctx.restore();
        }
    }

    function matchRaceRig(dw, dh) {
        const configs = window.CHAR_CONFIG || {};
        const hs = window.hexSize || 1;
        const z = window.cameraZoom || 1;
        let bestKey = null;
        let bestError = Infinity;

        for (const [key, cfg] of Object.entries(configs)) {
            if (!cfg?.armour || !ARMOUR_RIGS[key]) continue;
            const expectedW = cfg.bodyW * hs * z * cfg.armour.wMult;
            const expectedH = cfg.bodyH * hs * z - cfg.armour.topShift * hs * z;
            if (expectedW <= 0 || expectedH <= 0) continue;
            const error = Math.abs(dw - expectedW) / expectedW + Math.abs(dh - expectedH) / expectedH;
            if (error < bestError) { bestError = error; bestKey = key; }
        }
        return bestError <= 0.06 ? bestKey : null;
    }

    function install() {
        if (window.__characterRigInstalled || !window.mapCtx) return;
        const ctx = window.mapCtx;
        const nativeDrawImage = ctx.drawImage.bind(ctx);

        // Preserve gold-tinted armour identification. Gold sprites are cached
        // canvases rather than the original Image objects, so identity against
        // gameVisuals alone is insufficient after tinting.
        if (window.getGoldTintedSprite && !window.getGoldTintedSprite.__characterRigWrapped) {
            const originalGold = window.getGoldTintedSprite;
            const wrapped = function(img, ...rest) {
                const out = originalGold.call(this, img, ...rest);
                if (isBaseArmourImage(img) && out && typeof out === 'object') {
                    try { goldArmourImages.add(out); } catch (_) {}
                }
                return out;
            };
            wrapped.__characterRigWrapped = true;
            window.getGoldTintedSprite = wrapped;
        }

        ctx.drawImage = function(img, ...args) {
            // Only intercept the 5-argument overload used by the existing
            // armour block: drawImage(img, dx, dy, dw, dh).
            if (args.length === 4 && isArmourImage(img) && (window.cameraZoom || 1) >= 0.55) {
                const [dx, dy, dw, dh] = args;
                const key = matchRaceRig(dw, dh);
                const rig = key && ARMOUR_RIGS[key];
                if (rig) {
                    drawWarpedArmour(ctx, nativeDrawImage, img, rig, dx, dy, dw, dh);
                    return;
                }
            }
            nativeDrawImage(img, ...args);
        };

        // Attach the new mesh data to the existing character config too. This
        // makes the rig visible to debug tooling and gives future directional
        // sprites/helmets/weapons one canonical place to query body anchors.
        for (const [key, rig] of Object.entries(ARMOUR_RIGS)) {
            if (window.CHAR_CONFIG?.[key]?.armour) window.CHAR_CONFIG[key].armour.mesh = { ...rig };
        }

        window.__characterRigInstalled = true;
    }

    window.ARMOUR_RIGS = ARMOUR_RIGS;
    window.computeArmourMeshPoints = computeMeshPoints;
    window.drawWarpedArmour = drawWarpedArmour;
    window.installCharacterRig = install;

    if (document.readyState === 'complete') install();
    else window.addEventListener('load', install, { once:true });
})();
