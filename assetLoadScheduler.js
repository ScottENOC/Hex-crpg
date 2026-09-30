// assetLoadScheduler.js
// Phase-aware image scheduler. Character creation and gameplay each have an
// explicit loading gate; non-critical art is deferred instead of competing for
// GitHub Pages connections before it is needed.
(() => {
    'use strict';

    if (window.__assetLoadSchedulerInstalled) return;
    window.__assetLoadSchedulerInstalled = true;

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
    }));

    const SUPPRESSED = new Set([
        'images/humanfemale.png','images/humanfemalehair.png','images/humanmale.png','images/humanmalehair.png',
        'images/elffemale.png','images/elffemalehair.png','images/elf.png','images/elfleatherarmour.png','images/elfchainarmour.png',
    ]);
    const CREATOR_MAX_CONCURRENT = 4;
    const GAME_MAX_CONCURRENT = 4;
    const TRANSIENT_RETRY_DELAY_MS = 180;
    const GAMEPLAY_WARMUP_GRACE_MS = 750;

    const ARENA_CRITICAL = [
        'images/terrain/bases/arena/floor_1.png','images/terrain/bases/arena/floor_2.png',
        'images/terrain/bases/arena/floor_3.png','images/terrain/bases/arena/floor_4.png',
        'images/characters/npcs/arena/announcer.png','images/characters/npcs/arena/shopkeeper.png',
        'images/characters/npcs/arena/mercenary.png','images/props/structures/fence_horizontal.svg',
        'images/props/structures/fence_vertical.svg',
    ];
    const ARENA_SOON = [
        'images/characters/creatures/goblin.png','images/characters/creatures/orc.png',
        'images/characters/creatures/skeleton.svg','images/characters/creatures/zombie.svg',
        'images/characters/creatures/imp.svg','images/characters/creatures/spider_1.png',
        'images/characters/creatures/spider_2.png','images/characters/creatures/troll.png',
        'images/characters/creatures/wraith.svg','images/characters/creatures/basilisk.svg',
        'images/characters/creatures/harpy.svg','images/characters/creatures/minotaur.png',
        'images/characters/creatures/revenant.svg','images/characters/creatures/elite_goblin.svg',
        'images/characters/creatures/wolf.png','images/characters/creatures/boar.png',
        'images/characters/creatures/tiger.png','images/characters/creatures/horse.png',
    ];
    const CAMPAIGN2_NEARBY = [
        'images/terrain/bases/wood_floor.svg','images/terrain/bases/path.svg',
        'images/props/furniture/table.svg','images/props/furniture/bench.svg',
        'images/props/furniture/fireplace_base.svg','images/props/furniture/fireplace_flame.svg',
        'images/props/furniture/fireplace_unlit.svg','images/props/structures/door_open.svg',
        'images/props/structures/door_closed.svg','images/props/structures/signpost.svg',
    ];

    let active = 0;
    let gameStarted = false;
    let order = 0;
    let phase = 'creator-loading';
    let gameplayWarmupResumeAt = 0;
    let warmupResumeTimer = null;
    let pumpScheduled = false;
    let startGateRunning = false;
    const queue = [];
    const deferred = [];
    const phaseCritical = new Set();
    const phaseImages = new Set();

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

    function selectedCampaign() {
        return document.getElementById('campaign-select')?.value || '1';
    }

    function creatorRelevant(path) {
        if (path.startsWith('images/equipment/clothing/')) return true;
        if (path.startsWith('images/characters/legacy/elf_male/')) return true;
        if (path.startsWith('images/characters/legacy/dwarf_')) return true;
        if (path === 'images/characters/creatures/goblin.png' || path === 'images/characters/creatures/orc.png') return true;
        if (path.startsWith('images/characters/human_female/') ||
            path.startsWith('images/characters/human_male/') ||
            path.startsWith('images/characters/elf_female/')) {
            return /_front\.png$|\/body_front\.png$/.test(path);
        }
        return false;
    }

    function mayStartNow(path) {
        if (phase === 'game') return true;
        if (phaseCritical.has(path)) return true;
        return creatorRelevant(path);
    }

    function priorityFor(path) {
        if (phaseCritical.has(path)) return -100;
        if (gameStarted) return -10;
        if (creatorRelevant(path)) return 0;
        return 20;
    }

    function concurrencyLimit() {
        return gameStarted ? GAME_MAX_CONCURRENT : CREATOR_MAX_CONCURRENT;
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
            queue.sort((a,b) => a.priority - b.priority || a.order - b.order);
            const job = queue[0];
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

    function schedulePump() {
        if (pumpScheduled) return;
        pumpScheduled = true;
        queueMicrotask(() => {
            pumpScheduled = false;
            pump();
        });
    }

    function enqueue(path, start) {
        queue.push({path,start,priority:priorityFor(path),order:order++,queuedBeforeGameStart:!gameStarted});
        schedulePump();
    }

    function dispatchSyntheticError(img,path,reason) {
        queueMicrotask(() => {
            const event = new Event('error');
            event.assetLoadSchedulerReason = reason;
            event.assetPath = path;
            try { img.dispatchEvent(event); } catch (_) {}
        });
    }

    function queueImageAssignment(img, requestedValue, requestedPath, canonical) {
        const targetSrc = canonical === requestedPath ? requestedValue : canonical;
        enqueue(canonical, done => {
            let retriesRemaining = 1;
            const armAttempt = () => {
                const onLoad = () => { cleanup(); done(); };
                const onError = event => {
                    cleanup();
                    if (retriesRemaining > 0) {
                        retriesRemaining--;
                        event?.preventDefault?.();
                        event?.stopImmediatePropagation?.();
                        setTimeout(armAttempt, TRANSIENT_RETRY_DELAY_MS);
                        return;
                    }
                    done();
                };
                const cleanup = () => {
                    img.removeEventListener('load', onLoad, true);
                    img.removeEventListener('error', onError, true);
                };
                img.addEventListener('load', onLoad, {once:true,capture:true});
                img.addEventListener('error', onError, {once:true,capture:true});
                nativeSrc.set.call(img, targetSrc);
            };
            armAttempt();
        });
    }

    function deferImage(img, value, requestedPath, canonical) {
        const previous = deferred.findIndex(entry => entry.img === img);
        if (previous >= 0) deferred.splice(previous,1);
        deferred.push({img,value,requestedPath,canonical});
    }

    function releaseDeferred(predicate = () => true) {
        for (let i=deferred.length-1;i>=0;i--) {
            const entry = deferred[i];
            if (!predicate(entry.canonical)) continue;
            deferred.splice(i,1);
            queueImageAssignment(entry.img,entry.value,entry.requestedPath,entry.canonical);
        }
    }

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable:nativeSrc.configurable,
        enumerable:nativeSrc.enumerable,
        get:nativeSrc.get,
        set(value) {
            const img = this;
            const requestedPath = normalise(value);
            if (SUPPRESSED.has(requestedPath)) {
                dispatchSyntheticError(img,requestedPath,'obsolete-unused-asset');
                return;
            }
            const canonical = LEGACY_ASSET_REDIRECTS.get(requestedPath) || requestedPath;
            if (!mayStartNow(canonical)) {
                deferImage(img,value,requestedPath,canonical);
                return;
            }
            queueImageAssignment(img,value,requestedPath,canonical);
        },
    });

    function hash(text) {
        let h=2166136261;
        for (const ch of String(text||'')) { h^=ch.charCodeAt(0); h=Math.imul(h,16777619); }
        return h>>>0;
    }

    function currentCreatorCharacterAssets(allViews=false) {
        const race=document.getElementById('race-select')?.value||'human';
        const gender=document.getElementById('gender-select')?.value||'female';
        const bodyType=document.getElementById('body-type-select')?.value||'average';
        const hair=document.getElementById('hair-style-select')?.value||'brown_1';
        const views=allViews?['front','side','back']:['front'];
        const paths=[];
        if (race==='human' || (race==='elf'&&gender==='female')) {
            const root=race==='elf'?'images/characters/elf_female':`images/characters/human_${gender}`;
            const bodyBase=(race==='human'&&bodyType==='broad')?'body_broad':'body';
            for (const view of views) {
                paths.push(`${root}/${bodyBase}_${view}.png`);
                paths.push(`images/characters/human_female/hair_${hair}_${view}.png`);
            }
        } else if (race==='elf') {
            paths.push('images/characters/legacy/elf_male/body.png','images/characters/legacy/elf_male/hair.png');
        } else if (race==='dwarf') {
            paths.push(`images/characters/legacy/dwarf_${gender}/body.png`,`images/characters/legacy/dwarf_${gender}/hair.png`);
        } else if (race==='goblin') {
            paths.push('images/characters/creatures/goblin.png');
        } else if (race==='orc') {
            paths.push('images/characters/creatures/orc.png');
        }
        return paths;
    }

    function currentClothingAssets(allViews=false) {
        const race=document.getElementById('race-select')?.value||'human';
        const gender=document.getElementById('gender-select')?.value||'female';
        const feminine=gender==='female';
        const tops=feminine
            ? ['top_blouse','top_dress','top_shirt_f']
            : ['top_masc_toggle','top_masc_lacework','top_masc_laced','top_masc_buttoned'];
        // Creator preview has a deterministic race/gender seed. The live player's
        // final name can choose a different starter top, so gameplay must have the
        // whole gender-appropriate starter pool ready before the gate opens.
        const selectedTops=allViews ? tops : [tops[hash(`${race}_${gender}|top`)%tops.length]];
        const paths=[...selectedTops.map(top=>`images/equipment/clothing/${top}.png`),'images/equipment/clothing/pants_trousers.png'];
        if (allViews) paths.push('images/equipment/clothing/pants_trousers_back.png');
        paths.push('images/equipment/clothing/briefs_female_front.png');
        if (allViews) paths.push('images/equipment/clothing/briefs_female_back.png');
        if (feminine) {
            paths.push('images/equipment/clothing/bra_front.png');
            if (allViews) paths.push('images/equipment/clothing/bra_back.png');
        }
        return paths;
    }

    function currentStartingEquipmentAssets() {
        const cls=document.getElementById('class-select')?.value||'fighter';
        if (cls==='cleric') return ['images/equipment/weapons/club.svg','images/equipment/shields/round.png'];
        if (cls==='druid') return ['images/equipment/weapons/club.svg'];
        // Dagger currently shares the sword paper-doll art; fighter uses it directly.
        return ['images/equipment/weapons/sword.png'];
    }

    function creatorManifest() {
        return [...new Set([...currentCreatorCharacterAssets(false),...currentClothingAssets(false)])];
    }

    function gameManifest() {
        const scenario = selectedCampaign()==='1' ? [...ARENA_CRITICAL,...ARENA_SOON] : [...CAMPAIGN2_NEARBY];
        return [...new Set([...currentCreatorCharacterAssets(true),...currentClothingAssets(true),...currentStartingEquipmentAssets(),...scenario])];
    }

    function ensureOverlay() {
        let style=document.getElementById('hex-loading-gate-style');
        if (!style) {
            style=document.createElement('style');
            style.id='hex-loading-gate-style';
            style.textContent=`
                #hex-loading-gate{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(180deg,#151515,#090909);display:flex;align-items:center;justify-content:center;color:#f4ead2;font-family:Georgia,serif;padding:24px;box-sizing:border-box}
                #hex-loading-gate[hidden]{display:none!important}
                .hex-loading-card{width:min(520px,92vw);padding:28px;border:1px solid #8f7445;border-radius:10px;background:#201d19;box-shadow:0 18px 60px #000a;text-align:center}
                .hex-loading-title{font-size:1.55rem;margin:0 0 14px}.hex-loading-count{font-size:1rem;margin:0 0 14px;color:#d7c9a7}
                .hex-loading-track{height:12px;border-radius:999px;overflow:hidden;background:#0d0c0a;border:1px solid #5f5037}.hex-loading-bar{height:100%;width:0;background:#b89a5c;transition:width .12s linear}
                .hex-loading-error{margin-top:14px;color:#efb0a8}.hex-loading-retry{margin-top:12px;padding:9px 16px;cursor:pointer}
            `;
            document.head.appendChild(style);
        }
        let overlay=document.getElementById('hex-loading-gate');
        if (!overlay) {
            overlay=document.createElement('div');
            overlay.id='hex-loading-gate';
            overlay.innerHTML='<div class="hex-loading-card"><h2 class="hex-loading-title"></h2><p class="hex-loading-count"></p><div class="hex-loading-track"><div class="hex-loading-bar"></div></div><div class="hex-loading-error" hidden></div><button class="hex-loading-retry" hidden>Retry</button></div>';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function showOverlay(title,total,loaded=0) {
        const overlay=ensureOverlay();
        overlay.hidden=false;
        overlay.querySelector('.hex-loading-title').textContent=title;
        updateOverlay(loaded,total);
        overlay.querySelector('.hex-loading-error').hidden=true;
        overlay.querySelector('.hex-loading-retry').hidden=true;
        return overlay;
    }

    function updateOverlay(loaded,total) {
        const overlay=ensureOverlay();
        overlay.querySelector('.hex-loading-count').textContent=`Loaded ${loaded} / ${total} art assets`;
        overlay.querySelector('.hex-loading-bar').style.width=`${total ? Math.round(loaded*100/total) : 100}%`;
    }

    function hideOverlay() {
        const overlay=document.getElementById('hex-loading-gate');
        if (overlay) overlay.hidden=true;
    }

    function loadOne(path) {
        return new Promise((resolve,reject) => {
            const img=new Image();
            phaseImages.add(img);
            const cleanup=()=>phaseImages.delete(img);
            img.onload=()=>{cleanup();resolve(path);};
            img.onerror=()=>{cleanup();reject(path);};
            img.src=path;
        });
    }

    async function runGate(title,manifest) {
        const paths=[...new Set(manifest.map(canonicalPath))];
        paths.forEach(path=>phaseCritical.add(path));
        releaseDeferred(path=>phaseCritical.has(path));
        let loaded=0;
        const overlay=showOverlay(title,paths.length,0);
        const results=await Promise.allSettled(paths.map(path=>loadOne(path).then(value=>{loaded++;updateOverlay(loaded,paths.length);return value;})));
        const failed=results.filter(r=>r.status==='rejected').map(r=>r.reason);
        if (!failed.length) {
            paths.forEach(path=>phaseCritical.delete(path));
            return true;
        }
        const error=overlay.querySelector('.hex-loading-error');
        const retry=overlay.querySelector('.hex-loading-retry');
        error.textContent=`Could not load ${failed.length} art asset${failed.length===1?'':'s'}.`;
        error.hidden=false;
        retry.hidden=false;
        await new Promise(resolve=>retry.onclick=resolve);
        paths.forEach(path=>phaseCritical.delete(path));
        return runGate(title,paths);
    }

    function beginGameplayLoading() {
        if (gameStarted) return;
        gameStarted=true;
        gameplayWarmupResumeAt=performance.now()+GAMEPLAY_WARMUP_GRACE_MS;
        for (const job of queue) if (job.queuedBeforeGameStart) job.priority=50;
        pump();
    }

    async function loadCreator() {
        try {
            await runGate('Loading character creator…',creatorManifest());
            phase='creator-ready';
            hideOverlay();
            window.updateAppearancePreview?.();
        } catch (error) {
            console.error('Character creator loading gate failed',error);
        }
    }

    async function loadGameAndStart() {
        if (startGateRunning || phase==='game') return;
        startGateRunning=true;
        phase='game-loading';
        try {
            await runGate('Loading game…',gameManifest());
            phase='game';
            beginGameplayLoading();
            releaseDeferred();
            if (typeof window.startGame==='function') window.startGame();
            requestAnimationFrame(hideOverlay);
        } catch (error) {
            console.error('Game loading gate failed',error);
            phase='creator-ready';
            startGateRunning=false;
        }
    }

    function interceptStart(event) {
        const target=event.target?.closest?.('#createCharacterButton');
        if (!target || phase==='game') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        loadGameAndStart();
    }

    ensureOverlay();
    showOverlay('Loading character creator…',0,0);
    document.addEventListener('click',interceptStart,true);
    document.addEventListener('touchend',interceptStart,true);
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',loadCreator,{once:true});
    else loadCreator();

    window.__assetLoadScheduler={
        creatorMaxConcurrent:CREATOR_MAX_CONCURRENT,
        gameMaxConcurrent:GAME_MAX_CONCURRENT,
        gameplayWarmupGraceMs:GAMEPLAY_WARMUP_GRACE_MS,
        transientRetryDelayMs:TRANSIENT_RETRY_DELAY_MS,
        suppressed:[...SUPPRESSED],
        legacyRedirectCount:LEGACY_ASSET_REDIRECTS.size,
        canonicalPathFor:canonicalPath,
        priorityFor:path=>priorityFor(canonicalPath(path)),
        beginGameplayLoading,
        reprioritiseCreatorQueue(){for(const job of queue)job.priority=priorityFor(job.path);schedulePump();},
        warmSelectedScenario(){},
        get gameStarted(){return gameStarted;},
        get phase(){return phase;},
        get queued(){return queue.length;},
        get deferred(){return deferred.length;},
        get active(){return active;},
    };
})();
