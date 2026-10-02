// humanoidSpriteCache.js
// Four-direction runtime composite cache for layered humanoid characters.
(() => {
    'use strict';

    const BUILD = '20261002-four-direction-cache-v1';
    const CACHE_PAD_HEXES = 4;
    const FACING_ORDER = Object.freeze(['down', 'up', 'right', 'left']);
    const FACING_LABELS = Object.freeze({down:'front', up:'back', right:'side-right', left:'side-left'});
    const cache = new WeakMap();
    const identityIds = new WeakMap();
    const observedObjects = new WeakMap();
    const scheduled = new WeakSet();
    let identitySerial = 0;
    let installed = false;
    let lifecycleInstalled = false;
    let discoveryTimer = null;

    const stats = window.humanoidSpriteCacheStats = {
        build: BUILD,
        installed:false,
        hits:0,
        misses:0,
        builds:0,
        failedBuilds:0,
        bypasses:0,
        playerHits:0,
        npcHits:0,
        invalidations:0,
        scheduledRebuilds:0,
        warmedCharacters:0,
        warmedViews:0,
        lastWarmExpectedCharacters:0,
        lastWarmExpectedViews:0,
        lastWarmFailures:0,
        buildMs:0,
        maxBuildMs:0,
        rewraps:0,
    };

    function toArray(value) {
        if (value == null) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        if (typeof value?.[Symbol.iterator] === 'function') {
            try { return Array.from(value); } catch (_) {}
        }
        if (typeof value === 'object') return Object.values(value);
        return [];
    }

    function uniqueObjects(values) {
        const result = [];
        const seen = new Set();
        for (const value of toArray(values)) {
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);
            result.push(value);
        }
        return result;
    }

    function combatIsActive() {
        try {
            return typeof window.isInCombat === 'function' ? !!window.isInCombat() : !!window.isInCombat;
        } catch (_) {
            return true;
        }
    }

    function rigKey(entity) {
        return entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    }

    function isCacheCandidate(entity) {
        if (!entity || entity.customImage || !entity.race || !entity.gender) return false;
        const rigs = window.DIRECT_HUMANOID_RIGS;
        return !!(rigs && rigs[rigKey(entity)]);
    }

    function identityFor(entity) {
        if (!identityIds.has(entity)) identityIds.set(entity, ++identitySerial);
        const stable = entity.id ?? entity.entityId ?? entity.networkId ?? entity.populationId ?? entity.civilianId ?? entity.name ?? 'humanoid';
        return `${String(stable)}#${identityIds.get(entity)}`;
    }

    function stateFor(entity) {
        let state = cache.get(entity);
        if (!state) {
            state = {
                identity: identityFor(entity),
                version: 1,
                views: new Map(),
                observed: false,
                warming: null,
                suppressInvalidation: 0,
                lastFailure: null,
            };
            cache.set(entity, state);
        }
        return state;
    }

    function invalidate(entity, reason='appearance-change', {schedule=true}={}) {
        if (!entity || !isCacheCandidate(entity)) return false;
        const state = stateFor(entity);
        if (state.suppressInvalidation > 0) return false;
        state.version += 1;
        state.views.clear();
        state.lastFailure = null;
        stats.invalidations += 1;
        if (schedule && window.__characterCompositeGameplayReady) scheduleWarmEntity(entity, reason);
        return true;
    }

    function observeScalar(entity, prop) {
        const desc = Object.getOwnPropertyDescriptor(entity, prop);
        if (desc && (!desc.configurable || desc.get || desc.set)) return;
        let value = entity[prop];
        try {
            Object.defineProperty(entity, prop, {
                configurable: true,
                enumerable: true,
                get() { return value; },
                set(next) {
                    if (Object.is(value, next)) return;
                    value = next;
                    invalidate(entity, prop);
                },
            });
        } catch (_) {}
    }

    function reactiveObject(entity, value, seen = new WeakMap()) {
        if (!value || typeof value !== 'object') return value;
        if (seen.has(value)) return seen.get(value);
        if (observedObjects.has(value)) return observedObjects.get(value);
        const proxy = new Proxy(value, {
            get(target, prop, receiver) {
                const result = Reflect.get(target, prop, receiver);
                return result && typeof result === 'object' ? reactiveObject(entity, result, seen) : result;
            },
            set(target, prop, next, receiver) {
                const old = target[prop];
                const changed = !Object.is(old, next);
                const ok = Reflect.set(target, prop, next, receiver);
                if (ok && changed) invalidate(entity, `object:${String(prop)}`);
                return ok;
            },
            deleteProperty(target, prop) {
                const had = Object.prototype.hasOwnProperty.call(target, prop);
                const ok = Reflect.deleteProperty(target, prop);
                if (ok && had) invalidate(entity, `delete:${String(prop)}`);
                return ok;
            },
        });
        seen.set(value, proxy);
        observedObjects.set(value, proxy);
        return proxy;
    }

    function observeObjectProperty(entity, prop) {
        const desc = Object.getOwnPropertyDescriptor(entity, prop);
        if (desc && (!desc.configurable || desc.get || desc.set)) return;
        let value = reactiveObject(entity, entity[prop]);
        try {
            Object.defineProperty(entity, prop, {
                configurable: true,
                enumerable: true,
                get() { return value; },
                set(next) {
                    if (Object.is(value, next)) return;
                    value = reactiveObject(entity, next);
                    invalidate(entity, prop);
                },
            });
        } catch (_) {}
    }

    function observeEntity(entity) {
        if (!isCacheCandidate(entity)) return;
        const state = stateFor(entity);
        if (state.observed) return;
        state.suppressInvalidation += 1;
        try {
            for (const prop of [
                'race','gender','bodyType','hairStyle','hairHue','hairLightMult','hairSatMult',
                'skinHue','skinSaturation','skinLightness','facialHairStyle','facialHairHue',
                'facialHairLightMult','facialHairSatMult','displayArmour','displayClothes','goldGear',
            ]) observeScalar(entity, prop);
            for (const prop of ['equipped','clothingColors','equipmentColors','equipmentVisibility','shieldAppearance','equipmentAppearance']) {
                if (entity[prop] && typeof entity[prop] === 'object') observeObjectProperty(entity, prop);
            }
            state.observed = true;
        } finally {
            state.suppressInvalidation = Math.max(0, state.suppressInvalidation - 1);
        }
    }

    function viewForFacing(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function slotVisible(entity, slot) {
        return window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) !== false;
    }

    function addPath(set, path) {
        if (typeof path === 'string' && path) set.add(path);
    }

    function baseAssetPaths(entity, facing) {
        const paths = new Set();
        const view = viewForFacing(facing);
        const key = rigKey(entity);
        const characterPaths = window.DIRECTIONAL_CHARACTER_PATHS?.[key];
        const bodyType = entity.bodyType || 'average';
        const bodySet = characterPaths?.body?.[bodyType] || characterPaths?.body?.average;
        addPath(paths, bodySet?.[view]);

        const helmetVisible = !!entity.equipped?.helmet && slotVisible(entity, 'helmet');
        if (!helmetVisible) {
            const hairStyle = entity.hairStyle || 'brown_1';
            const hairSet = characterPaths?.hair?.[hairStyle] || characterPaths?.hair?.brown_1;
            addPath(paths, hairSet?.[view] || characterPaths?.hair?.brown_1?.[view]);
        }

        const clothing = window.clothingSystem;
        if (clothing?.resolveOutfitAssetPaths) {
            for (const path of toArray(clothing.resolveOutfitAssetPaths(entity, [view]))) addPath(paths, path);
        }

        if (view !== 'back') {
            window.assignNpcFacialHair?.(entity);
            const style = window.FACIAL_HAIR_STYLES?.[entity.facialHairStyle];
            addPath(paths, style?.[view === 'side' ? 'side' : 'front']);
        }

        if (entity.displayArmour !== false && entity.equipped?.armor && slotVisible(entity, 'armor')) {
            const item = window.items?.[entity.equipped.armor];
            const reduction = Number(item?.reduction || 0);
            const tier = reduction >= 3 ? 'heavy' : reduction >= 2 ? 'medium' : 'light';
            addPath(paths, view === 'back'
                ? `images/equipment/armour/human/${tier}_back.webp`
                : `images/equipment/armour/human/${tier}.png`);
        }

        if (helmetVisible) {
            addPath(paths, view === 'back'
                ? 'images/equipment/helmets/nasal_helm_back.svg'
                : 'images/equipment/helmets/nasal_helm.png');
        }

        for (const slot of ['weapon','offhand']) {
            if (!slotVisible(entity, slot)) continue;
            const itemId = entity.equipped?.[slot];
            const item = itemId && window.items?.[itemId];
            if (!item) continue;
            if (item.type === 'shield') {
                const visual = item.shieldVisual || 'round';
                if (visual === 'kite') addPath(paths, view === 'back' ? 'images/equipment/shields/kite_back.png' : 'images/equipment/shields/kite.png');
                else addPath(paths, view === 'back' ? 'images/equipment/shields/round_back.svg' : 'images/equipment/shields/round.png');
                continue;
            }
            if (item.type !== 'weapon') continue;
            const lower = String(itemId).toLowerCase();
            if (lower.includes('bow')) addPath(paths, 'images/equipment/weapons/bow.svg');
            else if (lower.includes('spear')) addPath(paths, 'images/equipment/weapons/spear.png');
            else if (lower.includes('axe') || lower.includes('pickaxe')) addPath(paths, 'images/equipment/weapons/axe.png');
            else if (lower.includes('club') || lower.includes('chair')) addPath(paths, 'images/equipment/weapons/club.svg');
            else if (lower.includes('dagger') || lower.includes('sword')) addPath(paths, 'images/equipment/weapons/sword.png');
        }

        return [...paths];
    }

    function imageReady(image) {
        return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }

    async function ensureAssets(paths) {
        const manager = window.assetManager;
        if (!manager?.whenReady) return {ready:false, failed:[{path:'(asset manager unavailable)', error:new Error('Asset manager unavailable')}]};
        const unique = [...new Set(toArray(paths).filter(path => typeof path === 'string' && path))];
        const settled = await Promise.allSettled(unique.map(async path => {
            const image = await manager.whenReady(path, {priority:-100, immediate:true});
            const resolved = image || manager.get?.(path);
            if (!imageReady(resolved)) throw new Error(`Asset decoded without usable dimensions: ${path}`);
            return path;
        }));
        const failed = [];
        settled.forEach((result, index) => {
            if (result.status === 'rejected') failed.push({path:unique[index], error:result.reason});
        });
        return {ready:failed.length === 0, failed, paths:unique};
    }

    async function prepareFacingSources(entity, facing) {
        const clothing = window.clothingSystem;
        if (clothing?.ensureDefaultOutfit) clothing.ensureDefaultOutfit(entity, {player:entity.side === 'player'});
        window.footwearSystem?.ensureDefaultFootwear?.(entity);
        const view = viewForFacing(facing);
        const paths = baseAssetPaths(entity, facing);
        const result = await ensureAssets(paths);
        if (!result.ready) return result;
        if (clothing?.visibleSlotsReady && !clothing.visibleSlotsReady(entity, view)) {
            return {ready:false, failed:[{path:`clothing:${view}`, error:new Error(`Visible clothing layers are not ready for ${view}`)}], paths};
        }
        return result;
    }

    function buildComposite(original, entity, facing, version) {
        const hs = Math.max(1, Number(window.hexSize || 30));
        const size = Math.max(64, Math.ceil(hs * CACHE_PAD_HEXES * 2));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const cx = size / 2;
        const cy = size / 2;
        const previousFacing = entity.facing;
        const before = Number(window.__humanoidRendererDrawCount || 0);
        const t0 = performance.now();
        try {
            entity.facing = facing;
            original(ctx, entity, cx, cy, 1, 0);
        } finally {
            entity.facing = previousFacing;
        }
        const elapsed = performance.now() - t0;
        stats.buildMs += elapsed;
        stats.maxBuildMs = Math.max(stats.maxBuildMs, elapsed);
        const after = Number(window.__humanoidRendererDrawCount || 0);
        const last = window.__humanoidRendererLastDraw;
        if (after <= before || last?.entity !== entity || last?.facing !== facing) return null;
        stats.builds += 1;
        return {
            canvas,
            cx,
            cy,
            facing,
            version,
            hexSize: hs,
            key: `${identityFor(entity)}|v${version}|${FACING_LABELS[facing]}|h${hs.toFixed(2)}`,
        };
    }

    function yieldToUi() {
        return new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
            else setTimeout(resolve, 0);
        });
    }

    async function warmEntity(entity, {onView=null, force=false}={}) {
        if (!isCacheCandidate(entity)) return {entity, skipped:true, views:0, failures:[]};
        observeEntity(entity);
        const state = stateFor(entity);
        if (state.warming && !force) return state.warming;

        const task = (async () => {
            const failures = [];
            let completed = 0;
            let restartBudget = 2;
            while (restartBudget-- > 0) {
                const version = state.version;
                const pending = new Map();
                state.suppressInvalidation += 1;
                try {
                    window.clothingSystem?.ensureDefaultOutfit?.(entity, {player:entity.side === 'player'});
                    window.footwearSystem?.ensureDefaultFootwear?.(entity);
                } finally {
                    state.suppressInvalidation = Math.max(0, state.suppressInvalidation - 1);
                }

                failures.length = 0;
                completed = 0;
                for (const facing of FACING_ORDER) {
                    const prepared = await prepareFacingSources(entity, facing);
                    if (!prepared.ready) {
                        failures.push(...prepared.failed.map(f => ({...f, entity, facing})));
                        break;
                    }
                    if (state.version !== version) break;
                    const entry = buildComposite(window.drawPlayerCharacter?.__humanoidFourDirectionBase || window.drawPlayerCharacter, entity, facing, version);
                    if (!entry) {
                        failures.push({entity, facing, path:'(composite)', error:new Error(`Composite draw failed for ${FACING_LABELS[facing]}`)});
                        break;
                    }
                    pending.set(facing, entry);
                    completed += 1;
                    if (typeof onView === 'function') onView(entity, facing, completed);
                    await yieldToUi();
                }
                if (state.version !== version) continue;
                if (!failures.length && pending.size === FACING_ORDER.length) {
                    state.views = pending;
                    state.lastFailure = null;
                    stats.warmedViews += pending.size;
                    return {entity, views:pending.size, failures:[]};
                }
                break;
            }
            state.lastFailure = failures.slice();
            stats.failedBuilds += 1;
            return {entity, views:completed, failures};
        })();

        state.warming = task;
        try { return await task; }
        finally { if (state.warming === task) state.warming = null; }
    }

    function collectCacheableCharacters(source=window.entities) {
        const candidates = uniqueObjects(source).filter(isCacheCandidate);
        const player = window.player;
        if (isCacheCandidate(player) && !candidates.includes(player)) candidates.unshift(player);
        return candidates;
    }

    function overlayParts() {
        const overlay = document.getElementById('hex-loading-gate');
        if (!overlay) return null;
        const title = overlay.querySelector('.hex-loading-title');
        const count = overlay.querySelector('.hex-loading-count');
        const bar = overlay.querySelector('.hex-loading-bar');
        const error = overlay.querySelector('.hex-loading-error');
        const retry = overlay.querySelector('.hex-loading-retry');
        const proceed = overlay.querySelector('.hex-loading-continue');
        if (proceed) proceed.textContent = 'Proceed anyway — danger';
        if (error) error.style.cssText += ';max-height:180px;overflow:auto;text-align:left;';
        return {overlay,title,count,bar,error,retry,proceed};
    }

    function showProgress(charDone, charTotal, viewDone, viewTotal) {
        const ui = overlayParts();
        if (!ui) return;
        ui.overlay.hidden = false;
        if (ui.title) ui.title.textContent = 'Preparing characters…';
        if (ui.count) ui.count.textContent = `Preparing characters… ${charDone} / ${charTotal} · directional views ${viewDone} / ${viewTotal}`;
        if (ui.bar) ui.bar.style.width = `${viewTotal ? Math.round(viewDone * 100 / viewTotal) : 100}%`;
        if (ui.error) ui.error.hidden = true;
        if (ui.retry) ui.retry.hidden = true;
        if (ui.proceed) ui.proceed.hidden = true;
    }

    async function chooseFailureAction(failures) {
        const ui = overlayParts();
        if (!ui) return 'proceed';
        ui.overlay.hidden = false;
        if (ui.title) ui.title.textContent = 'Character art preparation failed';
        const unique = [];
        const seen = new Set();
        for (const failure of failures) {
            const name = failure.entity?.name || failure.entity?.id || 'Unnamed character';
            const view = FACING_LABELS[failure.facing] || failure.facing || 'unknown view';
            const path = failure.path || failure.error?.message || '(unknown asset)';
            const key = `${name}|${view}|${path}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({name,view,path});
        }
        if (ui.count) ui.count.textContent = `${unique.length} character/view asset problem${unique.length === 1 ? '' : 's'} need attention.`;
        if (ui.error) {
            ui.error.innerHTML = `<div style="margin-bottom:6px">No incomplete composite has been cached. Retry after the source art loads, or proceed using uncached rendering for affected characters.</div><ul style="margin:0;padding-left:20px">${unique.map(f => `<li><strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.view)} — ${escapeHtml(f.path)}</li>`).join('')}</ul>`;
            ui.error.hidden = false;
        }
        if (ui.retry) {
            ui.retry.textContent = 'Retry';
            ui.retry.hidden = false;
        }
        if (ui.proceed) ui.proceed.hidden = false;
        return new Promise(resolve => {
            if (ui.retry) ui.retry.onclick = () => { cleanup(); resolve('retry'); };
            if (ui.proceed) ui.proceed.onclick = () => { cleanup(); resolve('proceed'); };
            function cleanup() {
                if (ui.retry) { ui.retry.onclick = null; ui.retry.hidden = true; }
                if (ui.proceed) { ui.proceed.onclick = null; ui.proceed.hidden = true; }
                if (ui.error) ui.error.hidden = true;
            }
        });
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    async function warmAll(source=window.entities, {reason='initial-load', allowProceed=true}={}) {
        const characters = collectCacheableCharacters(source);
        const totalViews = characters.length * FACING_ORDER.length;
        stats.lastWarmExpectedCharacters = characters.length;
        stats.lastWarmExpectedViews = totalViews;
        let charDone = 0;
        let viewDone = 0;
        let failures = [];
        showProgress(0, characters.length, 0, totalViews);

        const runPass = async list => {
            const failedEntities = [];
            for (const entity of list) {
                const result = await warmEntity(entity, {
                    force:true,
                    onView() {
                        viewDone += 1;
                        showProgress(charDone, characters.length, viewDone, totalViews);
                    },
                });
                if (result.failures?.length) {
                    failures.push(...result.failures);
                    failedEntities.push(entity);
                } else {
                    charDone += 1;
                    stats.warmedCharacters += 1;
                }
                showProgress(charDone, characters.length, viewDone, totalViews);
                await yieldToUi();
            }
            return failedEntities;
        };

        let pending = characters;
        while (pending.length) {
            failures = [];
            const failedEntities = await runPass(pending);
            if (!failedEntities.length) break;
            stats.lastWarmFailures = failures.length;
            if (!allowProceed) return {complete:false, characters:characters.length, views:viewDone, failures};
            const action = await chooseFailureAction(failures);
            if (action === 'proceed') {
                return {complete:false, characters:characters.length, views:viewDone, failures};
            }
            await new Promise(resolve => (typeof window.setTimeout === 'function' ? window.setTimeout(resolve, 1900) : resolve()));
            viewDone = Math.max(0, (charDone * FACING_ORDER.length));
            pending = failedEntities;
            showProgress(charDone, characters.length, viewDone, totalViews);
        }
        stats.lastWarmFailures = 0;
        return {complete:true, characters:characters.length, views:characters.length * FACING_ORDER.length, failures:[]};
    }

    function hidePreparationOverlay() {
        const overlay = document.getElementById('hex-loading-gate');
        if (overlay) overlay.hidden = true;
    }

    function scheduleWarmEntity(entity, reason='appearance-change') {
        if (!isCacheCandidate(entity) || scheduled.has(entity)) return;
        scheduled.add(entity);
        stats.scheduledRebuilds += 1;
        const run = async () => {
            scheduled.delete(entity);
            try {
                await warmEntity(entity, {force:true});
                window.requestGameRender?.();
                window.refreshDirectionalTurnPortraits?.();
            } catch (error) {
                console.warn('[humanoid-cache] Background rebuild failed:', reason, entity?.name || entity?.id, error);
            }
        };
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => run(), {timeout:500});
        else if (typeof window.setTimeout === 'function') window.setTimeout(run, 0);
        // Browser environments always provide one of the above. Test/embedded
        // sandboxes may intentionally omit timers; a cache miss can safely
        // fall back to the uncached renderer until the next normal discovery pass.

    }

    function installMutationHooks() {
        const cs = window.clothingSystem;
        if (cs && !cs.__humanoidCacheReadinessFixed) {
            const originalVisible = cs.visibleSlotsReady;
            cs.visibleSlotsReady = function(entity, view='front') {
                const paths = toArray(cs.resolveOutfitAssetPaths?.(entity, [view]));
                for (const path of paths) {
                    const image = window.assetManager?.get?.(path) || window.assetManager?.request?.(path);
                    if (!imageReady(image)) return false;
                }
                return originalVisible ? !!originalVisible.call(this, entity, view) : true;
            };
            cs.whenOutfitReady = async function(entity, views=['front','side','back']) {
                const paths = toArray(cs.resolveOutfitAssetPaths?.(entity, toArray(views)));
                const result = await ensureAssets(paths);
                if (!result.ready) {
                    const error = new Error(`Clothing art failed: ${result.failed.map(f => f.path).join(', ')}`);
                    error.failedAssets = result.failed;
                    throw error;
                }
                return result.paths;
            };
            if (typeof cs.setLayerColour === 'function') {
                const base = cs.setLayerColour;
                cs.setLayerColour = function(entity, ...args) {
                    const result = base.call(this, entity, ...args);
                    invalidate(entity, 'clothing-colour');
                    return result;
                };
            }
            cs.__humanoidCacheReadinessFixed = true;
        }

        const ea = window.equipmentAppearanceSystem;
        if (ea && !ea.__humanoidCacheInvalidationHooks) {
            for (const name of ['setSlotVisible','setWeaponMaterial','setArmourMaterial']) {
                if (typeof ea[name] !== 'function') continue;
                const base = ea[name];
                ea[name] = function(entity, ...args) {
                    const result = base.call(this, entity, ...args);
                    invalidate(entity, `equipment:${name}`);
                    return result;
                };
            }
            ea.__humanoidCacheInvalidationHooks = true;
        }
    }

    function wrapperChainHas(fn, marker) {
        const seen = new Set();
        const stack = [fn];
        const links = ['__original','__previous','__legacyDrawPlayerCharacter','__braidWrappedFunction','__alignmentWrappedFunction','__preciseBase'];
        while (stack.length) {
            const current = stack.pop();
            if (typeof current !== 'function' || seen.has(current)) continue;
            seen.add(current);
            if (current[marker]) return true;
            for (const link of links) if (typeof current[link] === 'function') stack.push(current[link]);
        }
        return false;
    }

    function installDrawCache() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (current.__fourDirectionHumanoidCache) {
            installed = true;
            stats.installed = true;
            return true;
        }

        const wrapped = function(ctx, entity, x, y, z=1, flyOff=0) {
            if (!ctx || !isCacheCandidate(entity) || combatIsActive()) {
                stats.bypasses += 1;
                return current.apply(this, arguments);
            }
            observeEntity(entity);
            const state = stateFor(entity);
            const facing = FACING_ORDER.includes(entity.facing) ? entity.facing : 'down';
            const entry = state.views.get(facing);
            const hs = Math.max(1, Number(window.hexSize || 30));
            if (entry && entry.version === state.version && Math.abs(entry.hexSize - hs) < 0.01) {
                const scale = Math.max(0.01, Number(z || 1));
                ctx.drawImage(
                    entry.canvas,
                    x - entry.cx * scale,
                    y + Number(flyOff || 0) - entry.cy * scale,
                    entry.canvas.width * scale,
                    entry.canvas.height * scale,
                );
                stats.hits += 1;
                if (entity.side === 'player') stats.playerHits += 1;
                else stats.npcHits += 1;
                return undefined;
            }
            stats.misses += 1;
            if (entry && Math.abs(entry.hexSize - hs) >= 0.01) invalidate(entity, 'hex-size-change', {schedule:false});
            if (window.__characterCompositeGameplayReady) scheduleWarmEntity(entity, 'cache-miss');
            return current.apply(this, arguments);
        };
        wrapped.__fourDirectionHumanoidCache = true;
        wrapped.__stableNpcCompositeCache = true;
        wrapped.__original = current;
        wrapped.__humanoidFourDirectionBase = current;
        if (wrapperChainHas(current, '__directHumanoidCompositor')) wrapped.__directHumanoidCompositor = true;
        window.drawPlayerCharacter = wrapped;
        window.__hexHumanoidCachedDraw = wrapped;
        try { (0, eval)('drawPlayerCharacter = window.__hexHumanoidCachedDraw'); } catch (_) {}
        window.clearHumanoidSpriteCache = entity => {
            if (entity) invalidate(entity, 'explicit-clear');
            else {
                for (const character of collectCacheableCharacters()) invalidate(character, 'explicit-clear-all');
            }
        };
        window.invalidateHumanoidAppearance = (entity, reason='explicit') => invalidate(entity, reason);
        installed = true;
        stats.installed = true;
        return true;
    }

    function suspendTick() {
        const hadTick = !!window.tickInterval;
        if (hadTick) {
            clearInterval(window.tickInterval);
            window.tickInterval = null;
        }
        return hadTick;
    }

    function resumeTick(shouldRun) {
        if (!shouldRun || window.tickInterval || typeof window.tick !== 'function') return;
        window.tickInterval = setInterval(window.tick, 10);
    }

    async function runBlockingWarm(reason, source, tickWasRunning) {
        window.__characterCompositeGameplayReady = false;
        try {
            installMutationHooks();
            installDrawCache();
            while (true) {
                try {
                    const result = await warmAll(source, {reason, allowProceed:true});
                    if (!result.complete) console.warn('[humanoid-cache] Proceeding with uncached fallback for failed character views:', result.failures);
                    return result;
                } catch (error) {
                    console.error('Campaign art preparation failed', error);
                    const action = await chooseFailureAction([{entity:null, facing:null, path:error?.message || String(error), error}]);
                    if (action !== 'retry') return {complete:false, characters:0, views:0, failures:[{error}]};
                    await new Promise(resolve => (typeof window.setTimeout === 'function' ? window.setTimeout(resolve, 100) : resolve()));
                }
            }
        } finally {
            window.__characterCompositeGameplayReady = true;
            resumeTick(tickWasRunning || !!window.player);
            hidePreparationOverlay();
            window.requestGameRender?.();
            window.refreshDirectionalTurnPortraits?.();
        }
    }

    function installLifecycleHooks() {
        if (lifecycleInstalled) return true;
        if (typeof window.startGameCore !== 'function' || typeof window.loadGame !== 'function') return false;

        const baseStartGameCore = window.startGameCore;
        if (!baseStartGameCore.__fourDirectionWarmGate) {
            const wrappedStartGameCore = function(isLoading=false) {
                if (isLoading) return baseStartGameCore.apply(this, arguments);
                window.__characterCompositeGameplayReady = false;
                showProgress(0, 0, 0, 0);
                const result = baseStartGameCore.apply(this, arguments);
                const tickWasRunning = suspendTick();
                void runBlockingWarm('initial-load', window.entities, tickWasRunning);
                return result;
            };
            wrappedStartGameCore.__fourDirectionWarmGate = true;
            wrappedStartGameCore.__original = baseStartGameCore;
            window.startGameCore = wrappedStartGameCore;
        }

        const baseLoadGame = window.loadGame;
        if (!baseLoadGame.__fourDirectionWarmGate) {
            const wrappedLoadGame = function(...args) {
                window.__characterCompositeGameplayReady = false;
                showProgress(0, 0, 0, 0);
                const tickWasRunningBefore = suspendTick();
                const result = baseLoadGame.apply(this, args);
                const tickWasRunningAfter = suspendTick();
                void runBlockingWarm('save-load', window.entities, tickWasRunningBefore || tickWasRunningAfter);
                return result;
            };
            wrappedLoadGame.__fourDirectionWarmGate = true;
            wrappedLoadGame.__original = baseLoadGame;
            window.loadGame = wrappedLoadGame;
        }

        lifecycleInstalled = true;
        return true;
    }

    function discoverNewCharacters() {
        installMutationHooks();
        const previousDraw = window.drawPlayerCharacter;
        const wasCachedWrapper = !!previousDraw?.__fourDirectionHumanoidCache;
        const installedNow = installDrawCache();
        if (installedNow && !wasCachedWrapper && window.drawPlayerCharacter?.__fourDirectionHumanoidCache) stats.rewraps += 1;
        installLifecycleHooks();
        for (const entity of collectCacheableCharacters()) {
            if (!cache.has(entity)) {
                observeEntity(entity);
                if (window.__characterCompositeGameplayReady) scheduleWarmEntity(entity, 'new-character');
            }
        }
    }

    function init() {
        installMutationHooks();
        installDrawCache();
        installLifecycleHooks();
        overlayParts();
        discoveryTimer = setInterval(discoverNewCharacters, 1000);
        window.__characterCompositeGameplayReady = true;
    }

    window.HumanoidSpriteCache = {
        build: BUILD,
        facings: FACING_ORDER.slice(),
        facingLabels: {...FACING_LABELS},
        stats,
        isCacheCandidate,
        collectCacheableCharacters,
        warmEntity,
        warmAll,
        invalidate,
        install: installDrawCache,
        installLifecycleHooks,
        getEntry(entity, facing) { return cache.get(entity)?.views?.get(facing) || null; },
        getVersion(entity) { return cache.get(entity)?.version || 0; },
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
})();
