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
    window.__humanoidRendererBridgeReady = true;
})();
