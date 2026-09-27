// assetLoadScheduler.js
// Keep startup image traffic bounded and stop obsolete paper-doll assets from
// competing with the direct humanoid compositor. This runs before the dynamic
// presentation stack and before main.js starts its DOMContentLoaded preload.
(() => {
    'use strict';

    if (window.__assetLoadSchedulerInstalled) return;
    window.__assetLoadSchedulerInstalled = true;

    const NativeImage = window.Image;
    if (typeof NativeImage !== 'function') return;

    const MAX_CONCURRENT = 6;
    let active = 0;
    const queue = [];

    // The human-female direct compositor owns this presentation now. These
    // >1 MB legacy flat sprites are retained in the repository for history /
    // fallback reference but should not be fetched during normal gameplay.
    const SUPPRESSED = new Set([
        'images/humanfemale.png',
        'images/humanfemalehair.png',
    ]);

    // These are legitimate assets, but they are not needed to paint the
    // character creator. main.js historically put them in its critical
    // Promise.all, making a fresh load wait on several megabytes before the
    // rest of the app could settle. Resolve that preload immediately and fill
    // gameVisuals during idle time / when the player starts instead.
    const DEFERRED = new Map([
        ['images/sword.png', 'swordIcon'],
        ['images/arenaannouncer.png', 'arenaannouncer'],
        ['images/arenamercenary.png', 'arenamercenary'],
        ['images/arenashopkeeper.png', 'arenashopkeeper'],
    ]);

    const deferredPending = new Map();
    let deferredStarted = false;

    function normalise(src) {
        try {
            const url = new URL(String(src), document.baseURI);
            return url.pathname.replace(/^\/+/, '');
        } catch (_) {
            return String(src).replace(/^\.\//, '');
        }
    }

    function priorityFor(path) {
        // The first visible directional art should jump ahead of broad/back/
        // side variants if several compositor assets are requested together.
        if (/arenaHexFloor\d\.png$/.test(path)) return 0;
        if (/\/body_front\.png$/.test(path)) return 0;
        if (/\/hair_[^/]+_front\.png$/.test(path)) return 0;
        if (/\.(svg)$/.test(path)) return 1;
        if (/body_broad_|_back\.png$|_side\.png$/.test(path)) return 3;
        return 2;
    }

    function pump() {
        while (active < MAX_CONCURRENT && queue.length) {
            queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
            const job = queue.shift();
            active++;
            job.start(() => {
                active = Math.max(0, active - 1);
                pump();
            });
        }
    }

    let order = 0;
    function enqueue(path, start) {
        queue.push({path, start, priority:priorityFor(path), order:order++});
        pump();
    }

    function dispatchSyntheticError(img, path, reason) {
        queueMicrotask(() => {
            const event = new Event('error');
            event.assetLoadSchedulerReason = reason;
            event.assetPath = path;
            if (typeof img.onerror === 'function') img.onerror.call(img, event);
            try { img.dispatchEvent(event); } catch (_) {}
        });
    }

    function loadDeferredAssets() {
        if (deferredStarted) return;
        deferredStarted = true;
        for (const [path, key] of deferredPending) {
            const img = new NativeImage();
            const finish = () => {};
            img.onload = () => {
                window.gameVisuals = window.gameVisuals || {};
                window.gameVisuals[key] = img;
            };
            img.onerror = () => console.warn('Deferred asset failed:', path);
            enqueue(path, done => {
                img.addEventListener('load', done, {once:true});
                img.addEventListener('error', done, {once:true});
                const descriptor = Object.getOwnPropertyDescriptor(NativeImage.prototype, 'src')
                    || Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
                descriptor.set.call(img, path);
            });
        }
        deferredPending.clear();
    }

    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc || typeof nativeSrc.set !== 'function' || typeof nativeSrc.get !== 'function') return;

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: nativeSrc.configurable,
        enumerable: nativeSrc.enumerable,
        get: nativeSrc.get,
        set(value) {
            const img = this;
            const path = normalise(value);

            if (SUPPRESSED.has(path)) {
                dispatchSyntheticError(img, path, 'obsolete-direct-humanoid-asset');
                return;
            }

            if (DEFERRED.has(path) && !deferredStarted) {
                deferredPending.set(path, DEFERRED.get(path));
                dispatchSyntheticError(img, path, 'deferred-noncritical-startup-asset');
                return;
            }

            enqueue(path, done => {
                const settle = () => done();
                img.addEventListener('load', settle, {once:true});
                img.addEventListener('error', settle, {once:true});
                nativeSrc.set.call(img, value);
            });
        },
    });

    // Start non-critical art only after the initial document has settled. A
    // player starting immediately gets the same promotion without waiting.
    const beginDeferred = () => loadDeferredAssets();
    window.addEventListener('load', () => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(beginDeferred, {timeout:1500});
        } else {
            setTimeout(beginDeferred, 500);
        }
    }, {once:true});
    document.addEventListener('click', event => {
        if (event.target?.id === 'createCharacterButton') beginDeferred();
    }, true);
    document.addEventListener('touchend', event => {
        if (event.target?.id === 'createCharacterButton') beginDeferred();
    }, true);

    window.__assetLoadScheduler = {
        maxConcurrent: MAX_CONCURRENT,
        suppressed: [...SUPPRESSED],
        deferred: [...DEFERRED.keys()],
        startDeferred: beginDeferred,
    };
})();
