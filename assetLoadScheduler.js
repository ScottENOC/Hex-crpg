// assetLoadScheduler.js
// Keep startup image traffic bounded and stop obsolete paper-doll assets from
// competing with the direct humanoid compositor. While the character creator
// is open we can use idle network time to warm useful art; once the player
// starts, gameplay image requests take over immediately.
(() => {
    'use strict';

    if (window.__assetLoadSchedulerInstalled) return;
    window.__assetLoadSchedulerInstalled = true;

    const NativeImage = window.Image;
    if (typeof NativeImage !== 'function') return;

    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc || typeof nativeSrc.set !== 'function' || typeof nativeSrc.get !== 'function') return;

    const MAX_CONCURRENT = 6;
    let active = 0;
    let gameStarted = false;
    const queue = [];

    // The direct humanoid compositor owns human-female presentation now.
    // These legacy flat paper-doll images must never consume network traffic.
    // They remain listed here only as a compatibility guard until the old
    // main.js preload catalogue is fully retired.
    const SUPPRESSED = new Set([
        'images/humanfemale.png',
        'images/humanfemalehair.png',
    ]);

    // Legitimate but non-critical creator-time warmups. If the player spends
    // time making a character, use that idle period to fetch them. If they hit
    // Start first, do not promote them: the game scene gets the connection.
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
        // Once gameplay starts, all newly requested images outrank anything
        // queued opportunistically by the character creator.
        if (gameStarted) return -10;
        if (/arenaHexFloor\d\.png$/.test(path)) return 0;
        if (/\/body_front\.png$/.test(path)) return 0;
        if (/\/hair_[^/]+_front\.png$/.test(path)) return 0;
        if (/\.svg$/.test(path)) return 1;
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
        queue.push({
            path,
            start,
            priority:priorityFor(path),
            order:order++,
            queuedBeforeGameStart:!gameStarted,
        });
        pump();
    }

    function dispatchSyntheticError(img, path, reason) {
        queueMicrotask(() => {
            const event = new Event('error');
            event.assetLoadSchedulerReason = reason;
            event.assetPath = path;
            try { img.dispatchEvent(event); } catch (_) {}
        });
    }

    function loadDeferredAssets() {
        if (deferredStarted || gameStarted) return;
        deferredStarted = true;
        for (const [path, key] of deferredPending) {
            const img = new NativeImage();
            img.onload = () => {
                window.gameVisuals = window.gameVisuals || {};
                window.gameVisuals[key] = img;
            };
            img.onerror = () => console.warn('Deferred asset failed:', path);
            enqueue(path, done => {
                img.addEventListener('load', done, {once:true});
                img.addEventListener('error', done, {once:true});
                nativeSrc.set.call(img, path);
            });
        }
        deferredPending.clear();
    }

    function beginGameplayLoading() {
        if (gameStarted) return;
        gameStarted = true;

        // Do not let queued creator-time speculation delay the first gameplay
        // scene. Requests already in flight are left alone; at most six can be
        // active. Every new gameplay request is assigned top priority.
        for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].queuedBeforeGameStart) queue.splice(i, 1);
        }
        deferredPending.clear();
        pump();
    }

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

            // Only defer while the creator is still the active experience.
            // A gameplay-time request for one of these assets loads normally.
            if (DEFERRED.has(path) && !deferredStarted && !gameStarted) {
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

    // If character creation lasts a while, use browser idle time to warm a
    // handful of useful assets. This never intentionally runs after Start.
    window.addEventListener('load', () => {
        const beginDeferred = () => loadDeferredAssets();
        if ('requestIdleCallback' in window) {
            requestIdleCallback(beginDeferred, {timeout:1500});
        } else {
            setTimeout(beginDeferred, 500);
        }
    }, {once:true});

    // Capture phase runs before main.js's normal click/touch handlers call
    // startGame, so speculative queued work is removed before scene loading
    // begins. Do not start any deferred work here.
    document.addEventListener('click', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);
    document.addEventListener('touchend', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);

    window.__assetLoadScheduler = {
        maxConcurrent: MAX_CONCURRENT,
        suppressed: [...SUPPRESSED],
        deferred: [...DEFERRED.keys()],
        startDeferred: loadDeferredAssets,
        beginGameplayLoading,
        get gameStarted() { return gameStarted; },
        get queued() { return queue.length; },
        get active() { return active; },
    };
})();
