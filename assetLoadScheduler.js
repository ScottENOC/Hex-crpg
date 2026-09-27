// assetLoadScheduler.js
// Keep character-creator image traffic bounded. While the creator is open we
// can use spare network time to warm likely gameplay art; once the player
// starts, speculative queued work is discarded and gameplay requests take over.
(() => {
    'use strict';

    if (window.__assetLoadSchedulerInstalled) return;
    window.__assetLoadSchedulerInstalled = true;

    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc || typeof nativeSrc.set !== 'function' || typeof nativeSrc.get !== 'function') return;

    const MAX_CONCURRENT = 6;
    let active = 0;
    let gameStarted = false;
    const queue = [];

    // Compatibility guard only. main.js should no longer reference these
    // superseded flat sprites; if another stale caller does, fail visibly
    // without sending an unnecessary request.
    const SUPPRESSED = new Set([
        'images/humanfemale.png',
        'images/humanfemalehair.png',
        'images/humanmale.png',
        'images/humanmalehair.png',
        'images/elffemale.png',
        'images/elffemalehair.png',
    ]);

    function normalise(src) {
        try {
            const url = new URL(String(src), document.baseURI);
            return url.pathname.replace(/^\/+/, '');
        } catch (_) {
            return String(src).replace(/^\.\//, '');
        }
    }

    function priorityFor(path) {
        // Once gameplay starts, every newly requested image outranks creator
        // warmups that happened to begin earlier.
        if (gameStarted) return -10;
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

    function beginGameplayLoading() {
        if (gameStarted) return;
        gameStarted = true;

        // Drop speculative creator-time work that has not started. In-flight
        // requests are allowed to finish rather than being aborted mid-transfer;
        // at most MAX_CONCURRENT of those can exist. New gameplay requests are
        // inserted at the highest priority as soon as a slot is available.
        for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].queuedBeforeGameStart) queue.splice(i, 1);
        }
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

            enqueue(path, done => {
                const settle = () => done();
                img.addEventListener('load', settle, {once:true});
                img.addEventListener('error', settle, {once:true});
                nativeSrc.set.call(img, value);
            });
        },
    });

    // Capture phase runs before main.js's normal click/touch handlers call
    // startGame, so the speculative queue is gone before scene loading begins.
    document.addEventListener('click', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);
    document.addEventListener('touchend', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);

    window.__assetLoadScheduler = {
        maxConcurrent: MAX_CONCURRENT,
        suppressed: [...SUPPRESSED],
        beginGameplayLoading,
        get gameStarted() { return gameStarted; },
        get queued() { return queue.length; },
        get active() { return active; },
    };
})();
