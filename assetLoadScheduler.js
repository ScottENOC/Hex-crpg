// assetLoadScheduler.js
// Keep character-creator image traffic bounded. While the creator is open we
// can use spare network time to warm likely gameplay art; once the player
// starts, gameplay requests take priority without abandoning Image objects
// that the renderer has already created and cached.
(() => {
    'use strict';

    if (window.__assetLoadSchedulerInstalled) return;
    window.__assetLoadSchedulerInstalled = true;

    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc || typeof nativeSrc.set !== 'function' || typeof nativeSrc.get !== 'function') return;

    // Keep speculative creator traffic conservative. At Start, allow extra
    // slots so gameplay can begin immediately even if a few warmups are still
    // in flight; HTTP/2 still remains far below the old unbounded Promise.all.
    const CREATOR_MAX_CONCURRENT = 4;
    const GAME_MAX_CONCURRENT = 8;
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

    function concurrencyLimit() {
        return gameStarted ? GAME_MAX_CONCURRENT : CREATOR_MAX_CONCURRENT;
    }

    function priorityFor(path) {
        // Once gameplay starts, every newly requested image outranks all
        // creator-time warmups still waiting in the queue.
        if (gameStarted) return -10;
        if (/\/body_front\.png$/.test(path)) return 0;
        if (/\/hair_[^/]+_front\.png$/.test(path)) return 0;
        if (/\.svg$/.test(path)) return 1;
        if (/body_broad_|_back\.png$|_side\.png$/.test(path)) return 3;
        return 2;
    }

    function pump() {
        const limit = concurrencyLimit();
        while (active < limit && queue.length) {
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

        // Do not delete queued requests: humanoidRenderer.js creates/caches
        // Image objects before first use, so abandoning one would strand that
        // sprite forever. Instead move every creator-time warmup behind future
        // gameplay requests. Raising the concurrency ceiling from 4 to 8 also
        // gives gameplay four immediate transfer slots even if all creator
        // slots were occupied at the instant Start was pressed.
        for (const job of queue) {
            if (job.queuedBeforeGameStart) job.priority = 50;
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
    // startGame, so gameplay priority is active before scene loading begins.
    document.addEventListener('click', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);
    document.addEventListener('touchend', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);

    window.__assetLoadScheduler = {
        creatorMaxConcurrent: CREATOR_MAX_CONCURRENT,
        gameMaxConcurrent: GAME_MAX_CONCURRENT,
        suppressed: [...SUPPRESSED],
        beginGameplayLoading,
        get gameStarted() { return gameStarted; },
        get queued() { return queue.length; },
        get active() { return active; },
    };
})();
