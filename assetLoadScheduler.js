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

    // Historical flat image URLs are translated here so old call sites do not
    // require physical compatibility aliases in images/. All browser requests
    // therefore resolve to the canonical asset folders.
    const LEGACY_ASSET_REDIRECTS = new Map(Object.entries({
        'images/Grishnak.png':'images/characters/npcs/grishnak.png',
        'images/arenaannouncer.png':'images/characters/npcs/arena/announcer.png',
        'images/arenamercenary.png':'images/characters/npcs/arena/mercenary.png',
        'images/arenashopkeeper.png':'images/characters/npcs/arena/shopkeeper.png',

        'images/elf.png':'images/characters/legacy/elf/body.png',
        'images/elffemale.png':'images/characters/legacy/elf_female/body.png',
        'images/elffemalehair.png':'images/characters/legacy/elf_female/hair.png',
        'images/elfmale.png':'images/characters/legacy/elf_male/body.png',
        'images/elfmalehair.png':'images/characters/legacy/elf_male/hair.png',
        'images/dwarffemale.png':'images/characters/legacy/dwarf_female/body.png',
        'images/dwarffemalehair.png':'images/characters/legacy/dwarf_female/hair.png',
        'images/dwarfmale.png':'images/characters/legacy/dwarf_male/body.png',
        'images/dwarfmalehair.png':'images/characters/legacy/dwarf_male/hair.png',

        'images/basilisk.svg':'images/characters/creatures/basilisk.svg',
        'images/boar.png':'images/characters/creatures/boar.png',
        'images/dragon.svg':'images/characters/creatures/dragon.svg',
        'images/eagle.png':'images/characters/creatures/eagle.png',
        'images/eagleflying.png':'images/characters/creatures/eagle_flying.png',
        'images/elite_goblin.svg':'images/characters/creatures/elite_goblin.svg',
        'images/goblin.png':'images/characters/creatures/goblin.png',
        'images/harpy.svg':'images/characters/creatures/harpy.svg',
        'images/horse.png':'images/characters/creatures/horse.png',
        'images/imp.svg':'images/characters/creatures/imp.svg',
        'images/minotaur.png':'images/characters/creatures/minotaur.png',
        'images/orc.png':'images/characters/creatures/orc.png',
        'images/revenant.svg':'images/characters/creatures/revenant.svg',
        'images/sheep.svg':'images/characters/creatures/sheep.svg',
        'images/skeleton.svg':'images/characters/creatures/skeleton.svg',
        'images/skeletonBase.svg':'images/characters/creatures/skeleton_base.svg',
        'images/spider1.png':'images/characters/creatures/spider_1.png',
        'images/spider2.png':'images/characters/creatures/spider_2.png',
        'images/tiger.png':'images/characters/creatures/tiger.png',
        'images/troll.png':'images/characters/creatures/troll.png',
        'images/unicorn.png':'images/characters/creatures/unicorn.png',
        'images/wolf.png':'images/characters/creatures/wolf.png',
        'images/wraith.svg':'images/characters/creatures/wraith.svg',
        'images/zombie.svg':'images/characters/creatures/zombie.svg',

        'images/elfchainarmour.png':'images/equipment/armour/elf/chain.png',
        'images/elfleatherarmour.png':'images/equipment/armour/elf/leather.png',
        'images/humanlightarmour.png':'images/equipment/armour/human/light.png',
        'images/humanlightarmour_back.svg':'images/equipment/armour/human/light_back.svg',
        'images/humanmediumarmour.png':'images/equipment/armour/human/medium.png',
        'images/humanmediumarmour_back.svg':'images/equipment/armour/human/medium_back.svg',
        'images/humanheavyarmour.png':'images/equipment/armour/human/heavy.png',
        'images/humanheavyarmour_back.svg':'images/equipment/armour/human/heavy_back.svg',
        'images/nasalHelm.png':'images/equipment/helmets/nasal_helm.png',
        'images/nasalHelm_back.svg':'images/equipment/helmets/nasal_helm_back.svg',
        'images/shield.png':'images/equipment/shields/round.png',
        'images/shield_back.svg':'images/equipment/shields/round_back.svg',
        'images/kiteshield.png':'images/equipment/shields/kite.png',
        'images/barding_light.svg':'images/equipment/mounts/barding_light.svg',
        'images/barding_medium.svg':'images/equipment/mounts/barding_medium.svg',
        'images/barding_heavy.svg':'images/equipment/mounts/barding_heavy.svg',
        'images/locket.svg':'images/equipment/accessories/locket.svg',
        'images/axe.png':'images/equipment/weapons/axe.png',
        'images/battering_ram.svg':'images/equipment/weapons/battering_ram.svg',
        'images/bow.svg':'images/equipment/weapons/bow.svg',
        'images/club.svg':'images/equipment/weapons/club.svg',
        'images/giant_club.png':'images/equipment/weapons/giant_club.png',
        'images/spear.png':'images/equipment/weapons/spear.png',
        'images/sword.png':'images/equipment/weapons/sword.png',

        'images/arenaHexFloor1.png':'images/terrain/bases/arena/floor_1.png',
        'images/arenaHexFloor2.png':'images/terrain/bases/arena/floor_2.png',
        'images/arenaHexFloor3.png':'images/terrain/bases/arena/floor_3.png',
        'images/arenaHexFloor4.png':'images/terrain/bases/arena/floor_4.png',
        'images/dirt.svg':'images/terrain/bases/dirt.svg',
        'images/grass_1.svg':'images/terrain/bases/grass_1.svg',
        'images/grass_2.svg':'images/terrain/bases/grass_2.svg',
        'images/grass_3.svg':'images/terrain/bases/grass_3.svg',
        'images/path.svg':'images/terrain/bases/path.svg',
        'images/water.png':'images/terrain/bases/water.png',
        'images/water_1.svg':'images/terrain/bases/water_1.svg',
        'images/water_2.svg':'images/terrain/bases/water_2.svg',
        'images/wood_floor.svg':'images/terrain/bases/wood_floor.svg',

        'images/altar_unholy.svg':'images/props/furniture/altar_unholy.svg',
        'images/bed.svg':'images/props/furniture/bed.svg',
        'images/bench.svg':'images/props/furniture/bench.svg',
        'images/fireplace_base.svg':'images/props/furniture/fireplace_base.svg',
        'images/fireplace_flame.svg':'images/props/furniture/fireplace_flame.svg',
        'images/fireplace_unlit.svg':'images/props/furniture/fireplace_unlit.svg',
        'images/fountain.svg':'images/props/furniture/fountain.svg',
        'images/mediumpillar.png':'images/props/furniture/pedestal.png',
        'images/table.svg':'images/props/furniture/table.svg',
        'images/throne.svg':'images/props/furniture/throne.svg',

        'images/door_closed.svg':'images/props/structures/door_closed.svg',
        'images/door_open.svg':'images/props/structures/door_open.svg',
        'images/fence_broken.svg':'images/props/structures/fence_broken.svg',
        'images/fence_h.svg':'images/props/structures/fence_horizontal.svg',
        'images/fence_v.svg':'images/props/structures/fence_vertical.svg',
        'images/gate_arch.svg':'images/props/structures/gate_arch.svg',
        'images/hut.svg':'images/props/structures/hut.svg',
        'images/hut_large.svg':'images/props/structures/hut_large.svg',
        'images/ladder.svg':'images/props/structures/ladder.svg',
        'images/signpost.svg':'images/props/structures/signpost.svg',
        'images/watchtower.svg':'images/props/structures/watchtower.svg',

        'images/bush_large.svg':'images/props/nature/bush_large.svg',
        'images/bush_small.svg':'images/props/nature/bush_small.svg',
        'images/foliage.png':'images/props/nature/foliage.png',
        'images/tree_large.svg':'images/props/nature/tree_large.svg',
        'images/tree_small.svg':'images/props/nature/tree_small.svg',
        'images/ore_vein.svg':'images/props/resources/ore_vein.svg',
        'images/apple.svg':'images/props/items/apple.svg',
        'images/journal.svg':'images/props/items/journal.svg',
        'images/oil_barrel.svg':'images/props/interactives/oil_barrel.svg',
        'images/torch_lit.svg':'images/props/interactives/torch_lit.svg',
        'images/overlay blood.png':'images/props/effects/blood_overlay.png',
        'images/overlay skull.png':'images/props/effects/skull_overlay.png',
        'images/corpse_marker.svg':'images/props/effects/corpse_marker.svg',
        'images/spiderweb.png':'images/props/effects/spiderweb.png',
    }));

    // Four simultaneous image streams is deliberately conservative for
    // GitHub Pages/HTTP2. We previously jumped to eight on Start; Chrome was
    // intermittently reporting ERR_HTTP2_PROTOCOL_ERROR with a 200 response
    // while several large directional character PNGs arrived together.
    const CREATOR_MAX_CONCURRENT = 4;
    const GAME_MAX_CONCURRENT = 4;
    const GAMEPLAY_WARMUP_GRACE_MS = 750;
    const TRANSIENT_RETRY_DELAY_MS = 180;
    let active = 0;
    let gameStarted = false;
    let gameplayWarmupResumeAt = 0;
    let warmupResumeTimer = null;
    const queue = [];

    // Compatibility guard only. Direct-rendered humans/elf-female must not
    // fall back to their superseded flat single-image sprites.
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
        if (gameStarted) return -10;
        if (/\/body_front\.png$/.test(path)) return 0;
        if (/\/hair_[^/]+_front\.png$/.test(path)) return 0;
        if (/\.svg$/.test(path)) return 1;
        if (/body_broad_|_back\.png$|_side\.png$/.test(path)) return 3;
        return 2;
    }

    function scheduleWarmupResume() {
        if (warmupResumeTimer || !gameStarted) return;
        const delay = Math.max(0, gameplayWarmupResumeAt - performance.now());
        if (delay <= 0) return;
        warmupResumeTimer = setTimeout(() => {
            warmupResumeTimer = null;
            pump();
        }, delay + 1);
    }

    function pump() {
        const limit = concurrencyLimit();
        while (active < limit && queue.length) {
            queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
            const job = queue[0];

            // Start is the most latency-sensitive moment. Give requests made
            // after the click a short exclusive window instead of immediately
            // filling newly-free slots with old creator-time warmups. Nothing
            // is discarded: the warmups resume automatically after the grace
            // period, so their Image objects/promises still settle normally.
            if (gameStarted && job.queuedBeforeGameStart && performance.now() < gameplayWarmupResumeAt) {
                scheduleWarmupResume();
                return;
            }

            queue.shift();
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
        gameplayWarmupResumeAt = performance.now() + GAMEPLAY_WARMUP_GRACE_MS;
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
            const requestedPath = normalise(value);

            if (SUPPRESSED.has(requestedPath)) {
                dispatchSyntheticError(img, requestedPath, 'obsolete-direct-humanoid-asset');
                return;
            }

            const canonicalPath = LEGACY_ASSET_REDIRECTS.get(requestedPath) || requestedPath;
            const targetSrc = canonicalPath === requestedPath ? value : canonicalPath;
            enqueue(canonicalPath, done => {
                let retriesRemaining = 1;

                const armAttempt = () => {
                    const onLoad = () => {
                        cleanup();
                        done();
                    };
                    const onError = (event) => {
                        cleanup();
                        if (retriesRemaining > 0) {
                            retriesRemaining--;
                            // This first error is treated as transient. Stop it
                            // before renderer/main.js handlers mark the Image as
                            // permanently broken; retry the exact same URL after
                            // a tiny backoff. A second error is allowed through.
                            if (event) {
                                event.preventDefault?.();
                                event.stopImmediatePropagation?.();
                            }
                            setTimeout(armAttempt, TRANSIENT_RETRY_DELAY_MS);
                            return;
                        }
                        done();
                    };
                    const cleanup = () => {
                        img.removeEventListener('load', onLoad, true);
                        img.removeEventListener('error', onError, true);
                    };

                    // Capture phase lets the scheduler suppress only the first
                    // transient error before existing onerror/load listeners
                    // see it. The retry bypasses our overridden setter so it
                    // does not create a second queue job or consume another
                    // concurrency slot.
                    img.addEventListener('load', onLoad, {once:true, capture:true});
                    img.addEventListener('error', onError, {once:true, capture:true});
                    nativeSrc.set.call(img, targetSrc);
                };

                armAttempt();
            });
        },
    });

    document.addEventListener('click', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);
    document.addEventListener('touchend', event => {
        if (event.target?.id === 'createCharacterButton') beginGameplayLoading();
    }, true);

    window.__assetLoadScheduler = {
        creatorMaxConcurrent: CREATOR_MAX_CONCURRENT,
        gameMaxConcurrent: GAME_MAX_CONCURRENT,
        gameplayWarmupGraceMs: GAMEPLAY_WARMUP_GRACE_MS,
        transientRetryDelayMs: TRANSIENT_RETRY_DELAY_MS,
        suppressed: [...SUPPRESSED],
        legacyRedirectCount: LEGACY_ASSET_REDIRECTS.size,
        canonicalPathFor(path) { return LEGACY_ASSET_REDIRECTS.get(normalise(path)) || normalise(path); },
        beginGameplayLoading,
        get gameStarted() { return gameStarted; },
        get queued() { return queue.length; },
        get active() { return active; },
    };
})();