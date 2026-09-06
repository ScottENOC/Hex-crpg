// graphicsSettings.js
// B1 (mobile roadmap): manual graphics options, since testing on only one
// or two real devices can't cover the full range of phones this might run
// on — same reasoning as offering a settings menu instead of hand-tuning a
// single "is this phone terrible" auto-detect. Device *preference*, not game
// state, so these persist in localStorage (same convention as
// rpg_allegiance_outline_mode, ui.js) rather than the save file.

// --- Frame rate: Auto (the existing adaptive backoff, gameEngine.js) or a
// manual pin. A manual choice sets every tier to the same interval so the
// adaptive logic can't override it, and is re-applied on load.
const FRAMERATE_INTERVALS = { 60: 16, 30: 33, 15: 66 };
window.frameRateMode = localStorage.getItem('rpg_framerate_mode') || 'auto';
function setFrameRateMode(mode) {
    window.frameRateMode = mode;
    localStorage.setItem('rpg_framerate_mode', mode);
    if (mode === 'auto') {
        if (window._resetRenderPacing) window._resetRenderPacing();
    } else if (window._setManualRenderInterval) {
        window._setManualRenderInterval(FRAMERATE_INTERVALS[mode] || 16);
    }
}
window.setFrameRateMode = setFrameRateMode;

// --- Render scale: backing-store resolution vs. the displayed CSS size —
// see resizeCanvas (hexMap.js) for why this needs no other coordinate-math
// changes anywhere.
window.renderScale = parseFloat(localStorage.getItem('rpg_render_scale') || '1');
window._renderScale = window.renderScale;
function setRenderScale(value) {
    const scale = parseFloat(value);
    window.renderScale = scale;
    window._renderScale = scale;
    localStorage.setItem('rpg_render_scale', String(scale));
    if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
    if (window.resizeCanvas) window.resizeCanvas();
}
window.setRenderScale = setRenderScale;

// --- Reduce motion: gates screen shake, the melee-lunge transform, and
// floating-text drift at their existing call sites (combatFX.js/
// gameEngine.js) rather than adding a new animation system to skip.
window.reduceMotion = localStorage.getItem('rpg_reduce_motion') === 'true';
function setReduceMotion(enabled) {
    window.reduceMotion = !!enabled;
    localStorage.setItem('rpg_reduce_motion', enabled ? 'true' : 'false');
}
window.setReduceMotion = setReduceMotion;

// --- Foliage detail: "Simple" skips the seasonal-tint recolor pass on
// foliage overlays in the terrain buffer (hexMap.js's renderTerrainPass) —
// one of the pricier per-hex operations in that pass.
window.foliageDetail = localStorage.getItem('rpg_foliage_detail') || 'full';
function setFoliageDetail(mode) {
    window.foliageDetail = mode;
    localStorage.setItem('rpg_foliage_detail', mode);
    if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
}
window.setFoliageDetail = setFoliageDetail;

// Sync the settings-modal controls to the persisted values whenever the
// modal opens, same pattern as the existing allegiance-outline/tutorial
// controls (ui.js's openSettingsModal-equivalent code).
function syncGraphicsSettingsUI() {
    const fr = document.getElementById('graphics-framerate-mode');
    if (fr) fr.value = window.frameRateMode;
    const rs = document.getElementById('graphics-render-scale');
    if (rs) rs.value = String(window.renderScale);
    const rm = document.getElementById('graphics-reduce-motion');
    if (rm) rm.checked = window.reduceMotion;
    const fd = document.getElementById('graphics-foliage-detail');
    if (fd) fd.value = window.foliageDetail;
}
window.syncGraphicsSettingsUI = syncGraphicsSettingsUI;

// ---------------------------------------------------------------------------
// Mobile performance layer
// ---------------------------------------------------------------------------
// Kept here because this file loads before gameEngine/main, while the setup
// itself runs after DOMContentLoaded when every global renderer/entity helper
// exists. This lets old call sites keep calling drawMap()/renderEntities()
// without each gesture/tick being able to force several invisible renders
// between two physical display refreshes.
document.addEventListener('DOMContentLoaded', () => {
    // Cache Entity#getAllHexes while an entity has not moved. This removes a
    // large amount of tiny array/object allocation from dense render scans.
    if (window.Entity && !window.Entity.prototype.__perfCachedHexes) {
        const originalGetAllHexes = window.Entity.prototype.getAllHexes;
        window.Entity.prototype.getAllHexes = function() {
            if (!this.hex) return [];
            const extras = this.extraHexes || [];
            let sig = `${this.hex.q},${this.hex.r}`;
            for (let i = 0; i < extras.length; i++) sig += `|${extras[i].q},${extras[i].r}`;
            if (this.__perfHexSig === sig && this.__perfHexCache) return this.__perfHexCache;
            const result = originalGetAllHexes.call(this);
            this.__perfHexSig = sig;
            this.__perfHexCache = result;
            return result;
        };
        window.Entity.prototype.__perfCachedHexes = true;
    }

    // Spatial index for getEntityAtHex. Entity.hex is wrapped so both
    // `entity.hex = {q,r}` and direct `entity.hex.q = ...` movement invalidate
    // the index. New entities are wrapped lazily when they first appear.
    let entityIndex = new Map();
    let entityIndexDirty = true;
    let indexedEntityCount = -1;
    const wrappedEntities = new WeakSet();

    function markEntityIndexDirty() { entityIndexDirty = true; }
    window.invalidateEntitySpatialIndex = markEntityIndexDirty;

    function wrapHexObject(value) {
        const raw = value || { q: 0, r: 0 };
        if (raw && raw.__perfHexProxy) return raw;
        const proxy = new Proxy(raw, {
            set(target, prop, val) {
                if ((prop === 'q' || prop === 'r') && target[prop] !== val) entityIndexDirty = true;
                target[prop] = val;
                return true;
            }
        });
        try { Object.defineProperty(proxy, '__perfHexProxy', { value: true, enumerable: false }); } catch (_) {}
        return proxy;
    }

    function wrapEntity(entity) {
        if (!entity || wrappedEntities.has(entity)) return;
        let hexValue = wrapHexObject(entity.hex);
        try {
            Object.defineProperty(entity, 'hex', {
                configurable: true,
                enumerable: true,
                get() { return hexValue; },
                set(v) { hexValue = wrapHexObject(v); entityIndexDirty = true; }
            });
            wrappedEntities.add(entity);
        } catch (_) {
            // A non-configurable foreign/network entity can still participate;
            // it just causes conservative index rebuilds via entity count.
        }
    }

    function rebuildEntityIndex() {
        const entities = window.entities || [];
        entityIndex = new Map();
        for (const entity of entities) {
            wrapEntity(entity);
            if (!entity || !entity.alive || !entity.hex) continue;
            const occupied = entity.getAllHexes ? entity.getAllHexes() : [entity.hex];
            for (const h of occupied) {
                const key = `${h.q},${h.r}`;
                let bucket = entityIndex.get(key);
                if (!bucket) entityIndex.set(key, bucket = []);
                bucket.push(entity);
            }
        }
        indexedEntityCount = entities.length;
        entityIndexDirty = false;
    }

    function ensureEntityIndex() {
        const entities = window.entities || [];
        if (entityIndexDirty || indexedEntityCount !== entities.length) rebuildEntityIndex();
        return entityIndex;
    }
    window.rebuildEntitySpatialIndex = rebuildEntityIndex;
    window.getEntitiesAtHexFast = (q, r) => ensureEntityIndex().get(`${q},${r}`) || [];

    // Classic-script global function declarations are reflected on window,
    // so replacing the property also upgrades existing gameEngine/hexMap call
    // sites without having to rewrite every caller.
    if (window.getEntityAtHex && !window.getEntityAtHex.__spatialIndexed) {
        const fastGetEntityAtHex = function(q, r) {
            const bucket = ensureEntityIndex().get(`${q},${r}`);
            if (!bucket) return undefined;
            for (const e of bucket) if (e.alive) return e;
            return undefined;
        };
        fastGetEntityAtHex.__spatialIndexed = true;
        window.getEntityAtHex = fastGetEntityAtHex;
    }

    // Coalesce redraw requests onto requestAnimationFrame. On iOS, touchmove
    // and pinch events can arrive multiple times between display refreshes;
    // rendering every intermediate state burns CPU for frames the user never
    // sees. A drawMap request dominates a renderEntities-only request because
    // drawMap already invokes renderEntities internally.
    if (window.drawMap && window.renderEntities && !window.__renderCoalescerInstalled) {
        const originalDrawMap = window.drawMap;
        const originalRenderEntities = window.renderEntities;
        let rafPending = false;
        let wantsMap = false;
        let wantsEntities = false;
        const stats = window.performanceRenderStats = {
            requests: 0,
            frames: 0,
            coalesced: 0,
            lastFrameMs: 0,
            avgFrameMs: 0
        };

        function flushRender() {
            rafPending = false;
            const doMap = wantsMap;
            const doEntities = wantsEntities;
            wantsMap = false;
            wantsEntities = false;
            const t0 = performance.now();

            // originalDrawMap calls window.renderEntities; temporarily expose
            // the original renderer so that one real frame stays internally
            // consistent rather than scheduling a second RAF from inside it.
            window.renderEntities = originalRenderEntities;
            try {
                if (doMap) originalDrawMap();
                else if (doEntities) originalRenderEntities();
            } finally {
                window.renderEntities = queuedRenderEntities;
            }

            const dt = performance.now() - t0;
            stats.frames++;
            stats.lastFrameMs = dt;
            stats.avgFrameMs += (dt - stats.avgFrameMs) / Math.min(stats.frames, 120);
            rebuildEntityIndex(); // fresh for game logic/rendering after movement this frame
        }

        function queue() {
            stats.requests++;
            if (rafPending) {
                stats.coalesced++;
                return;
            }
            rafPending = true;
            requestAnimationFrame(flushRender);
        }
        function queuedDrawMap() { wantsMap = true; queue(); }
        function queuedRenderEntities() { wantsEntities = true; queue(); }

        window.drawMap = queuedDrawMap;
        window.renderEntities = queuedRenderEntities;
        window.requestGameRender = queuedDrawMap;
        window.__renderCoalescerInstalled = true;
    }

    // Cheap zoom LOD. Below 0.55x there is no useful phone-screen benefit
    // from doing seasonal foliage recolours; below 0.35x combat text and
    // projectile animation are too small to read, so they can be skipped.
    // Core terrain/entities remain fully present, so this does not alter game
    // information or collision/visibility rules.
    if (window.drawMap && !window.__zoomLodInstalled) {
        const queuedDraw = window.drawMap;
        window.drawMap = function() {
            const zoom = window.cameraZoom || 1;
            if (zoom < 0.55) window.__performanceForceSimpleFoliage = true;
            else window.__performanceForceSimpleFoliage = false;
            return queuedDraw();
        };
        window.__zoomLodInstalled = true;
    }

    // Optional diagnostic overlay. Enable from console with
    // setPerformanceOverlay(true), or add ?perf=1 to the URL.
    let perfOverlay = null;
    function setPerformanceOverlay(enabled) {
        if (!enabled) {
            if (perfOverlay) perfOverlay.remove();
            perfOverlay = null;
            return;
        }
        if (!perfOverlay) {
            perfOverlay = document.createElement('div');
            perfOverlay.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:99999;background:rgba(0,0,0,.72);color:#9ef;font:11px monospace;padding:6px;border-radius:4px;pointer-events:none;white-space:pre;';
            document.body.appendChild(perfOverlay);
        }
        const update = () => {
            if (!perfOverlay) return;
            const s = window.performanceRenderStats || {};
            perfOverlay.textContent = `entities ${(window.entities || []).length}\nzoom ${(window.cameraZoom || 1).toFixed(2)}\nframe ${(s.lastFrameMs || 0).toFixed(1)} ms\navg ${(s.avgFrameMs || 0).toFixed(1)} ms\ncoalesced ${s.coalesced || 0}`;
            requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }
    window.setPerformanceOverlay = setPerformanceOverlay;
    try {
        if (new URLSearchParams(location.search).get('perf') === '1') setPerformanceOverlay(true);
    } catch (_) {}
});
