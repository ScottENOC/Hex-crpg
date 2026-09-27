// armourFreezeDiagnostic.js
// Temporary live diagnostic: pin the exact rigid human-female armour result
// above the tactical canvas for 60 seconds while normal rendering continues.
// This deliberately does NOT block the JS main thread. A literal sleep would
// prevent later render code from running, so it could not reveal overwrites.
(() => {
    'use strict';

    const HOLD_MS = 60_000;
    const OVERLAY_ID = 'armour-freeze-diagnostic-canvas';
    let activeUntil = 0;
    let clearTimer = null;

    function isArmourImage(img) {
        const g = window.gameVisuals || {};
        return !!img && (img === g.humanLight || img === g.humanMedium || img === g.humanHeavy || !!img.__humanFemaleArmourBase);
    }

    function ensureOverlay() {
        const base = window.mapCtx?.canvas;
        if (!base) return null;
        let overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) {
            overlay = document.createElement('canvas');
            overlay.id = OVERLAY_ID;
            Object.assign(overlay.style, {
                position:'fixed',
                pointerEvents:'none',
                zIndex:'100000',
            });
            document.body.appendChild(overlay);
        }
        const rect = base.getBoundingClientRect();
        if (overlay.width !== base.width) overlay.width = base.width;
        if (overlay.height !== base.height) overlay.height = base.height;
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        return overlay;
    }

    function finishPin() {
        activeUntil = 0;
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.remove();
        window.__armourFreezeDiagnostic = {
            active:false,
            expiredAt:Date.now(),
            holdMs:HOLD_MS,
        };
    }

    function pinRigidArmour(img, placement, transform) {
        if (!placement || Date.now() < activeUntil) return false;
        const overlay = ensureOverlay();
        if (!overlay) return false;
        const octx = overlay.getContext('2d');
        if (!octx) return false;

        octx.setTransform(1,0,0,1,0,0);
        octx.clearRect(0,0,overlay.width,overlay.height);
        if (transform) octx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
        octx.drawImage(img, placement.dx, placement.dy, placement.outerWidthPx, placement.outerHeightPx);
        octx.setTransform(1,0,0,1,0,0);

        // Small unmistakable marker outside the sprite itself so the tester can
        // tell that the pinned diagnostic layer is active.
        octx.font = 'bold 16px sans-serif';
        octx.textBaseline = 'top';
        octx.lineWidth = 4;
        octx.strokeStyle = 'rgba(0,0,0,.95)';
        octx.fillStyle = '#00ff88';
        const label = 'PINNED RIGID ARMOUR — 60s';
        octx.strokeText(label, 12, 12);
        octx.fillText(label, 12, 12);

        activeUntil = Date.now() + HOLD_MS;
        window.__armourFreezeDiagnostic = {
            active:true,
            startedAt:Date.now(),
            activeUntil,
            holdMs:HOLD_MS,
            compositionSource:placement.compositionSource || null,
            placement:{
                dx:placement.dx,
                dy:placement.dy,
                outerWidthPx:placement.outerWidthPx,
                outerHeightPx:placement.outerHeightPx,
                visibleLeftPx:placement.visibleLeftPx,
                visibleRightPx:placement.visibleRightPx,
                visibleTopPx:placement.visibleTopPx,
                visibleBottomPx:placement.visibleBottomPx,
            },
        };
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(finishPin, HOLD_MS);
        return true;
    }

    function showMissDiagnostic() {
        if (Date.now() < activeUntil) return;
        const overlay = ensureOverlay();
        if (!overlay) return;
        const octx = overlay.getContext('2d');
        if (!octx) return;
        octx.setTransform(1,0,0,1,0,0);
        octx.clearRect(0,0,overlay.width,overlay.height);
        octx.font = 'bold 16px sans-serif';
        octx.textBaseline = 'top';
        octx.lineWidth = 4;
        octx.strokeStyle = 'rgba(0,0,0,.95)';
        octx.fillStyle = '#ff5252';
        const label = 'ARMOUR DRAW SEEN — RIGID COMPOSITOR DID NOT FIRE';
        octx.strokeText(label, 12, 12);
        octx.fillText(label, 12, 12);
        activeUntil = Date.now() + HOLD_MS;
        window.__armourFreezeDiagnostic = {
            active:true,
            compositorMiss:true,
            startedAt:Date.now(),
            activeUntil,
            holdMs:HOLD_MS,
        };
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(finishPin, HOLD_MS);
    }

    function install() {
        const ctx = window.mapCtx;
        if (!ctx || !window.__directionalRigHandoffInstalled) return false;
        if (ctx.drawImage?.__armourFreezeDiagnostic) return true;

        const previous = ctx.drawImage.bind(ctx);
        const wrapped = function(img, ...args) {
            const armourAttempt = args.length === 4 && isArmourImage(img);
            const before = window.__directionalRigHandoffLastArmour;
            const transform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
            const result = previous(img, ...args);

            if (armourAttempt && Date.now() >= activeUntil) {
                const after = window.__directionalRigHandoffLastArmour;
                if (after && after !== before && after.compositionSource === 'directional-rig-handoff-rigid') {
                    pinRigidArmour(img, after, transform);
                } else {
                    showMissDiagnostic();
                }
            }
            return result;
        };
        wrapped.__armourFreezeDiagnostic = true;
        wrapped.__armourFreezeDiagnosticPrevious = previous;
        ctx.drawImage = wrapped;
        window.__armourFreezeDiagnosticInstalled = true;
        return true;
    }

    window.pinHumanFemaleRigidArmourForDiagnostic = pinRigidArmour;
    window.clearArmourFreezeDiagnostic = finishPin;

    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (install() || attempts >= 400) clearInterval(timer);
    }, 25);
})();
