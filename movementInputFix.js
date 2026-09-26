// movementInputFix.js
// iOS Safari can emit both our explicit touchend movement action and a
// follow-up synthetic click for the same physical tap. Because the camera can
// start following after the first action, that second click can resolve the
// same screen point to an adjacent hex and overwrite the intended destination.
//
// Keep hexMap.js's direct touchend -> handleClick path (needed on iOS when a
// touchmove preventDefault suppresses click), but swallow only the matching
// synthetic click. Real mouse clicks, gamepad-generated clicks and later taps
// remain untouched.

(() => {
    'use strict';

    if (window.__movementTapDedupeInstalled) return;
    window.__movementTapDedupeInstalled = true;

    const MAX_SYNTHETIC_CLICK_DELAY_MS = 750;
    const MAX_SYNTHETIC_CLICK_DISTANCE_PX = 18;
    let lastMapTouch = null;

    function isMapCanvasTarget(target) {
        return !!target && (target === window.mapCanvas || target.id === 'mapCanvas');
    }

    document.addEventListener('touchend', (event) => {
        if (!isMapCanvasTarget(event.target)) return;
        if (event.changedTouches?.length !== 1) {
            lastMapTouch = null;
            return;
        }
        const touch = event.changedTouches[0];
        lastMapTouch = {
            x: touch.clientX,
            y: touch.clientY,
            at: performance.now(),
        };
    }, true);

    document.addEventListener('click', (event) => {
        if (!lastMapTouch || !isMapCanvasTarget(event.target)) return;

        const age = performance.now() - lastMapTouch.at;
        const dx = event.clientX - lastMapTouch.x;
        const dy = event.clientY - lastMapTouch.y;
        const distance = Math.hypot(dx, dy);

        if (age >= 0 && age <= MAX_SYNTHETIC_CLICK_DELAY_MS &&
            distance <= MAX_SYNTHETIC_CLICK_DISTANCE_PX) {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.__lastSuppressedSyntheticMapClick = {
                ageMs: age,
                distancePx: distance,
                x: event.clientX,
                y: event.clientY,
            };
            lastMapTouch = null;
            return;
        }

        // A click outside the synthetic-click window is a genuine later input.
        if (age > MAX_SYNTHETIC_CLICK_DELAY_MS) lastMapTouch = null;
    }, true);

    window.__movementTapDedupeConfig = {
        maxDelayMs: MAX_SYNTHETIC_CLICK_DELAY_MS,
        maxDistancePx: MAX_SYNTHETIC_CLICK_DISTANCE_PX,
    };
})();
