// facingSystem.js
// Four-direction facing foundation for humanoid characters.
//
// Facing is real entity state (`up`, `down`, `left`, `right`) derived from
// movement in flat-top axial hex space. The current art is predominantly
// front-facing, so left/right use a mirrored, slightly compressed profile
// fallback while up/down retain the existing art until dedicated directional
// sprites are supplied. Because the transform is applied around the whole
// character draw stack, the unified attachment rig (weapons, shield, helmet,
// armour) follows the facing automatically.

(() => {
    'use strict';

    const VALID_FACINGS = new Set(['up', 'down', 'left', 'right']);
    const previousHex = new WeakMap();
    let installed = false;

    function facingFromHexDelta(dq, dr) {
        if (!dq && !dr) return null;
        // Same flat-top axial projection as hexMap.hexToPixel, with constants
        // omitted because only direction matters.
        const dx = 1.5 * dq;
        const dy = Math.sqrt(3) * (dr + dq / 2);
        // Hex diagonals are intentionally read as left/right because their
        // horizontal screen displacement is larger than their vertical one.
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    function setEntityFacing(entity, facing) {
        if (!entity || !VALID_FACINGS.has(facing)) return false;
        if (entity.facing === facing) return false;
        entity.facing = facing;
        // Rider/mount pairs occupy the same path and should not visually argue
        // about which way they are travelling.
        if (entity.riding && entity.riding.facing !== facing) entity.riding.facing = facing;
        if (entity.rider && entity.rider.facing !== facing) entity.rider.facing = facing;
        return true;
    }

    function updateFacingFromMovement() {
        const entities = window.entities || [];
        for (const e of entities) {
            if (!e || !e.hex) continue;
            const old = previousHex.get(e);
            if (!old) {
                previousHex.set(e, { q:e.hex.q, r:e.hex.r });
                if (!VALID_FACINGS.has(e.facing)) e.facing = 'down';
                continue;
            }
            const dq = e.hex.q - old.q;
            const dr = e.hex.r - old.r;
            if (dq || dr) {
                const facing = facingFromHexDelta(dq, dr);
                if (facing) setEntityFacing(e, facing);
                old.q = e.hex.q;
                old.r = e.hex.r;
            }
        }
    }

    function detectBodyKey(dw, dh) {
        const configs = window.CHAR_CONFIG || {};
        const hs = window.hexSize || 1;
        const z = window.cameraZoom || 1;
        let bestKey = null, bestError = Infinity;
        for (const [key, cfg] of Object.entries(configs)) {
            if (!cfg?.bodyW || !cfg?.bodyH) continue;
            const ew = cfg.bodyW * hs * z;
            const eh = cfg.bodyH * hs * z;
            const err = Math.abs(dw - ew) / ew + Math.abs(dh - eh) / eh;
            if (err < bestError) { bestError = err; bestKey = key; }
        }
        return bestError <= 0.03 ? bestKey : null;
    }

    function findEntityForBody(bodyKey, cx, cy, bodyHeight) {
        let best = null, bestD2 = Infinity;
        const maxD = Math.max(30, bodyHeight * 0.85);
        for (const e of window.entities || []) {
            if (!e || !e.alive || !e.race || !e.gender || e.customImage) continue;
            if (`${e.race}_${e.gender}` !== bodyKey) continue;
            const q = Number.isFinite(e.visualQ) ? e.visualQ : e.hex?.q;
            const r = Number.isFinite(e.visualR) ? e.visualR : e.hex?.r;
            if (!Number.isFinite(q) || !Number.isFinite(r) || !window.hexToPixel) continue;
            const p = window.hexToPixel(q, r);
            const dx = cx - p.x, dy = cy - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; best = e; }
        }
        return bestD2 <= maxD * maxD ? best : null;
    }

    function isLikelyCharacterLayer(args, body) {
        if (!body || args.length !== 4) return false;
        const [dx, dy, dw, dh] = args;
        if (![dx,dy,dw,dh].every(Number.isFinite)) return false;
        const cx = dx + dw / 2, cy = dy + dh / 2;
        const padX = body.width * 0.85;
        const padY = body.height * 0.70;
        return cx >= body.left - padX && cx <= body.left + body.width + padX
            && cy >= body.top - padY && cy <= body.top + body.height + padY;
    }

    function sideProfileScale(facing) {
        return facing === 'left' || facing === 'right' ? 0.78 : 1;
    }

    function applyFacingTransform(ctx, body, facing, draw) {
        if (!body || !VALID_FACINGS.has(facing) || facing === 'down' || facing === 'up') {
            draw();
            return;
        }
        const cx = body.left + body.width / 2;
        const sx = sideProfileScale(facing) * (facing === 'left' ? -1 : 1);
        ctx.save();
        ctx.translate(cx, 0);
        ctx.scale(sx, 1);
        ctx.translate(-cx, 0);
        try { draw(); } finally { ctx.restore(); }
    }

    function installRendererFacing() {
        if (installed || !window.mapCtx || !window.CHAR_CONFIG || !window.__characterRigInstalled) return false;
        const ctx = window.mapCtx;
        const riggedDrawImage = ctx.drawImage.bind(ctx);
        let active = null; // { entity, key, left, top, width, height }

        ctx.drawImage = function(img, ...args) {
            if (args.length === 4) {
                const [dx, dy, dw, dh] = args;
                const key = detectBodyKey(dw, dh);
                if (key) {
                    const entity = findEntityForBody(key, dx + dw/2, dy + dh/2, dh);
                    if (entity) active = { entity, key, left:dx, top:dy, width:dw, height:dh };
                }

                if (active && isLikelyCharacterLayer(args, active)) {
                    const facing = VALID_FACINGS.has(active.entity.facing) ? active.entity.facing : 'down';
                    return applyFacingTransform(ctx, active, facing, () => riggedDrawImage(img, ...args));
                }
            }
            return riggedDrawImage(img, ...args);
        };

        installed = true;
        window.__facingRendererInstalled = true;
        return true;
    }

    function scheduleInstall() {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            updateFacingFromMovement();
            if (installRendererFacing() || installed || attempts >= 100) clearInterval(timer);
        }, 50);
    }

    // Keep facing state current even after renderer installation. Movement is
    // hex-step based, so 20 Hz is ample and far cheaper than per-frame scans.
    setInterval(updateFacingFromMovement, 50);

    window.FACING_DIRECTIONS = ['up','down','left','right'];
    window.facingFromHexDelta = facingFromHexDelta;
    window.setEntityFacing = setEntityFacing;
    window.updateFacingFromMovement = updateFacingFromMovement;
    window.sideProfileScale = sideProfileScale;
    window.installFacingRenderer = installRendererFacing;

    if (document.readyState === 'complete') scheduleInstall();
    else window.addEventListener('load', scheduleInstall, { once:true });
})();
