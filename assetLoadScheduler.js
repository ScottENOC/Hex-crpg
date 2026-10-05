// assetLoadScheduler.js
// Shared image loading. AssetManager is the sole owner of image requests,
// decoding, cache reuse and retries. Assets are loaded lazily on demand.
(() => {
    'use strict';

    const SCHEDULER_VERSION = '6';
    if (window.__assetLoadSchedulerInstalled && window.__assetLoadSchedulerVersion === SCHEDULER_VERSION) return;
    // index.html loads this before the other game scripts in a normal page load.
    if (window.__assetLoadSchedulerInstalled) return;
    window.__assetLoadSchedulerInstalled = true;
    window.__assetLoadSchedulerVersion = SCHEDULER_VERSION;

    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc || typeof nativeSrc.set !== 'function' || typeof nativeSrc.get !== 'function') return;

    const LEGACY_ASSET_REDIRECTS = new Map(Object.entries({
        'images/Grishnak.png':'images/characters/npcs/grishnak.png',
        'images/arenaannouncer.png':'images/characters/npcs/arena/announcer.png',
        'images/arenamercenary.png':'images/characters/npcs/arena/mercenary.png',
        'images/arenashopkeeper.png':'images/characters/npcs/arena/shopkeeper.png',
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
        'images/equipment/clothing/pants_trousers.png':'images/equipment/clothing/pants_trousers_front.png',
    }));

    const SUPPRESSED = new Set([
        'images/humanfemale.png','images/humanfemalehair.png','images/humanmale.png','images/humanmalehair.png',
        'images/elffemale.png','images/elffemalehair.png','images/elf.png','images/elfleatherarmour.png','images/elfchainarmour.png',
    ]);
    const MANAGER_MAX_RETRIES = 2;
    const MANAGER_RETRY_DELAYS_MS = [180, 600];
    const MANAGER_ERROR_RETRY_BASE_MS = 1800;
    const MANAGER_ERROR_RETRY_MAX_MS = 15000;

    // No campaign-specific preload lists live in the asset manager.
    // Campaigns request assets through their actual render/content paths when
    // those assets become necessary. Keeping "critical", "soon", or
    // "nearby" lists here would make the loader own knowledge of game
    // scenarios and would undermine true demand-driven loading.

    let active = 0;
    let order = 0;
    let pumpScheduled = false;
    const queue = [];
    const managerRecords = new Map();
    const domBindingTokens = new WeakMap();

    function normalise(src) {
        try {
            const url = new URL(String(src), document.baseURI);
            const baseDir = new URL('.', document.baseURI);
            const basePath = baseDir.pathname.endsWith('/') ? baseDir.pathname : `${baseDir.pathname}/`;
            if (url.origin === baseDir.origin && url.pathname.startsWith(basePath)) {
                return decodeURIComponent(url.pathname.slice(basePath.length)).replace(/^\/+/, '');
            }
            return decodeURIComponent(url.pathname).replace(/^\/+/, '');
        } catch (_) {
            return String(src).replace(/^\.\//, '').split('?')[0];
        }
    }

    function canonicalPath(value) {
        const requested = normalise(value);
        return LEGACY_ASSET_REDIRECTS.get(requested) || requested;
    }

    function currentBuild() {
        return document.querySelector('meta[name="app-build"]')?.content || window.PRESENTATION_BUILD || 'asset-manager-v6';
    }

    function managedUrl(value, {retry=0, freshReason='retry'}={}) {
        const raw = String(value || '');
        if (/^(?:data:|blob:)/i.test(raw)) return raw;
        const requestedPath = normalise(raw);
        const canonical = LEGACY_ASSET_REDIRECTS.get(requestedPath) || requestedPath;
        let url;
        try {
            url = new URL(raw, document.baseURI);
            const baseDir = new URL('.', document.baseURI);
            const basePath = baseDir.pathname.endsWith('/') ? baseDir.pathname : `${baseDir.pathname}/`;
            if (url.origin !== baseDir.origin || !url.pathname.startsWith(basePath)) return raw;
            const original = url;
            url = new URL(canonical, baseDir);
            for (const [key,val] of original.searchParams.entries()) url.searchParams.append(key,val);
            url.searchParams.set('build', currentBuild());
            if (retry) url.searchParams.set('assetRetry', `${freshReason}-${retry}`);
            return url.href;
        } catch (_) {
            const sep = canonical.includes('?') ? '&' : '?';
            return `${canonical}${sep}build=${encodeURIComponent(currentBuild())}${retry ? `&assetRetry=${encodeURIComponent(freshReason)}-${retry}` : ''}`;
        }
    }

    function selectedCampaign() {
        return document.getElementById('campaign-select')?.value || '1';
    }

    function priorityFor(path) { return 0; }

    function pump() {
        const limit = 4;
        while (active < limit && queue.length) {
            queue.sort((a,b) => a.priority - b.priority || a.order - b.order);
            const job = queue.shift();
            active++;
            job.start(() => {
                active = Math.max(0, active - 1);
                pump();
            });
        }
    }

    function schedulePump() {
        if (pumpScheduled) return;
        pumpScheduled = true;
        queueMicrotask(() => {
            pumpScheduled = false;
            pump();
        });
    }

    function enqueue(path, start, priorityOverride=null) {
        queue.push({
            path,
            start,
            priority:priorityOverride ?? priorityFor(path),
            order:order++,
        });
        schedulePump();
    }

    function recordKey(value) {
        const requested = normalise(value);
        return SUPPRESSED.has(requested) ? requested : canonicalPath(value);
    }

    function createRecordPromise(record) {
        let resolvePromise, rejectPromise;
        const promise = new Promise((resolve,reject) => { resolvePromise=resolve; rejectPromise=reject; });
        promise.catch(() => {});
        record.promise=promise;
        record.resolve=resolvePromise;
        record.reject=rejectPromise;
    }

    function recordFor(value) {
        const requested = normalise(value);
        const suppressed = SUPPRESSED.has(requested);
        const path = suppressed ? requested : canonicalPath(value);
        let record = managerRecords.get(path);
        if (record) return record;
        const image = new Image();
        record = {
            path,image,promise:null,resolve:null,reject:null,
            status:suppressed?'suppressed':'idle',queued:false,attempt:0,error:null,
            failureCount:0,nextRetryAt:0,
        };
        createRecordPromise(record);
        managerRecords.set(path,record);
        if (suppressed) {
            record.error = new Error(`Suppressed obsolete asset: ${requested}`);
            record.reject(record.error);
        }
        return record;
    }

    function rearmFailedRecord(record) {
        if (!record || record.status!=='error') return record;
        createRecordPromise(record);
        record.status='idle';
        record.queued=false;
        record.attempt=0;
        record.error=null;
        record.nextRetryAt=0;
        return record;
    }

    let recoveryRedrawQueued = false;
    function redrawAfterRecovery() {
        if (recoveryRedrawQueued) return;
        recoveryRedrawQueued = true;
        const run = () => {
            recoveryRedrawQueued = false;
            try {
                window.drawMap?.();
                window.renderEntities?.();
                window.refreshDirectionalTurnPortraits?.();
                window.updateAppearancePreview?.();
            } catch (error) {
                console.warn('Asset recovery redraw failed', error);
            }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function settleLoaded(record) {
        const finish = () => {
            if (record.status === 'ready') return;
            const recovered = record.failureCount > 0;
            record.status='ready';
            record.error=null;
            record.failureCount=0;
            record.nextRetryAt=0;
            record.resolve(record.image);
            if (recovered) redrawAfterRecovery();
        };
        if (typeof record.image.decode === 'function') {
            // A successful network load is not necessarily a usable decoded
            // image on iOS/WebKit. Decode failures must enter the same retry
            // path as network failures rather than being reported as ready.
            return record.image.decode().then(
                () => finish(),
                error => Promise.reject(error || new Error(`Failed to decode image: ${record.path}`))
            );
        }
        finish();
        return Promise.resolve();
    }

    function startManagerRecord(record, done) {
        record.queued=false;
        record.status='loading';
        const attemptLoad = () => {
            const cleanup = () => {
                record.image.removeEventListener('load', onLoad, true);
                record.image.removeEventListener('error', onError, true);
            };
            const onLoad = () => {
                cleanup();
                settleLoaded(record).then(
                    () => done(),
                    error => {
                        console.warn('Image decoded load failed; retrying:', record.path, error);
                        onError();
                    }
                );
            };
            const onError = () => {
                cleanup();
                if (record.attempt < MANAGER_MAX_RETRIES) {
                    const delay = MANAGER_RETRY_DELAYS_MS[record.attempt] || MANAGER_RETRY_DELAYS_MS.at(-1);
                    record.attempt += 1;
                    setTimeout(attemptLoad, delay);
                    return;
                }
                record.status='error';
                record.error=new Error(`Failed to load image: ${record.path}`);
                record.failureCount += 1;
                const retryDelay=Math.min(
                    MANAGER_ERROR_RETRY_MAX_MS,
                    MANAGER_ERROR_RETRY_BASE_MS * (2 ** Math.max(0,record.failureCount-1)),
                );
                record.nextRetryAt=performance.now()+retryDelay;
                record.reject(record.error);
                done();
            };
            record.image.addEventListener('load',onLoad,{once:true,capture:true});
            record.image.addEventListener('error',onError,{once:true,capture:true});
            nativeSrc.set.call(record.image, managedUrl(record.path,{retry:record.attempt,freshReason:'manager'}));
        };
        attemptLoad();
    }

    function requestManaged(value,{priority=null,immediate=false}={}) {
        const record=recordFor(value);
        if (record.status==='suppressed') return record.image;
        if (record.status==='error') {
            if (record.nextRetryAt && performance.now() < record.nextRetryAt) return record.image;
            rearmFailedRecord(record);
        }
        if (record.status==='ready' || record.status==='loading' || record.queued) return record.image;
        const start=() => {
            if (record.status!=='idle') return;
            record.queued=true;
            enqueue(record.path, done=>startManagerRecord(record,done), priority);
        };
        start();
        return record.image;
    }

    function ensureManagedStarted(value,opts={}) {
        const record=recordFor(value);
        if (record.status==='deferred') record.status='idle';
        requestManaged(value,{...opts,immediate:true});
        return record;
    }

    function loadManaged(value,opts={}) {
        return ensureManagedStarted(value,opts).promise;
    }

    function waitManaged(value) {
        return recordFor(value).promise;
    }

    function whenReady(value,opts={}) {
        return loadManaged(value,opts);
    }

    function bindManagedElement(element,value,{priority=-20,onError=null}={}) {
        if (!(element instanceof HTMLImageElement)) throw new TypeError('assetManager.bind expects an HTMLImageElement');
        if (!value) return element;
        const token=Symbol('managed-dom-image');
        domBindingTokens.set(element,token);
        element.dataset.assetManagerPath=canonicalPath(value);
        loadManaged(value,{priority,immediate:true}).then(source=>{
            if(domBindingTokens.get(element)!==token)return;
            const resolved=source.currentSrc || nativeSrc.get.call(source);
            if(resolved) nativeSrc.set.call(element,resolved);
        }).catch(error=>{
            if(domBindingTokens.get(element)!==token)return;
            element.removeAttribute('src');
            if(typeof onError==='function')onError(error,element);
        });
        return element;
    }

    function createManagedDOMImage(value=null,opts={}) {
        const element=document.createElement('img');
        if(value)bindManagedElement(element,value,opts);
        return element;
    }

    const SWEEP_INTERVAL_MS = 2000;
    const SWEEP_MAX_FAILURES = 6;
    function sweepFailedRecords() {
        const now = performance.now();
        for (const record of managerRecords.values()) {
            if (record.status !== 'error') continue;
            if (record.failureCount >= SWEEP_MAX_FAILURES) continue;
            if (record.nextRetryAt && now < record.nextRetryAt) continue;
            requestManaged(record.path, { immediate: true });
        }
    }

    window.assetManager = {
        version:SCHEDULER_VERSION,
        sweepFailed:sweepFailedRecords,
        request:requestManaged,
        load:loadManaged,
        wait:waitManaged,
        whenReady,
        bind:bindManagedElement,
        createDOMImage:createManagedDOMImage,
        canonicalPathFor:canonicalPath,
        urlFor:managedUrl,
        get(path){return managerRecords.get(recordKey(path))?.image || null;},
        // Release a decoded source image once a final composite has been built.
        // A later appearance can request the path again; this is deliberately
        // not persistent image caching.
        release(paths) {
            const list = Array.isArray(paths) ? paths : [paths];
            for (const value of list) {
                const key = recordKey(value);
                const record = managerRecords.get(key);
                if (!record || record.status === 'loading' || record.queued) continue;
                managerRecords.delete(key);
                try { record.image.removeAttribute('src'); } catch (_) {}
            }
        },
        status(path){return managerRecords.get(recordKey(path))?.status || 'unrequested';},
        get cacheSize(){return managerRecords.size;},
    };

    window.__assetLoadScheduler={
        version:SCHEDULER_VERSION,
        maxConcurrent:4,
        transientRetryDelayMs:MANAGER_RETRY_DELAYS_MS[0],
        suppressed:[...SUPPRESSED],
        legacyRedirectCount:LEGACY_ASSET_REDIRECTS.size,
        canonicalPathFor:canonicalPath,
        priorityFor:path=>priorityFor(canonicalPath(path)),
        get queued(){return queue.length;},
        get active(){return active;},
        get cacheSize(){return managerRecords.size;},
    };
})();