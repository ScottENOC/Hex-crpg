// humanoidSpriteCache.js
// Out-of-combat NPCs usually keep the same body, hair, clothing and equipment
// for many frames. The direct humanoid compositor can issue dozens of canvas
// draws per character (notably shaped armour), so cache the finished NPC sprite
// and move that one bitmap around instead of recomposing it every render.
(() => {
    'use strict';

    const CACHE_PAD_HEXES = 4;
    const INSTALL_RETRY_MS = 500;
    const cache = new WeakMap();
    const stats = window.humanoidSpriteCacheStats = {
        installed:false,
        hits:0,
        misses:0,
        builds:0,
        bypasses:0,
        failedBuilds:0,
    };

    function safeJson(value) {
        try { return JSON.stringify(value) || ''; }
        catch (_) { return String(value ?? ''); }
    }

    function isStableNpc(entity) {
        if (!entity || window.isInCombat) return false;
        if (entity.side === 'player') return false;
        return !!(entity.isNPC || entity.isGeneratedCivilian);
    }

    function appearanceKey(entity, z) {
        return [
            entity.facing || 'down', entity.race || '', entity.gender || '', entity.bodyType || '',
            entity.hairStyle || '', entity.hairHue ?? '', entity.hairLightMult ?? '', entity.hairSatMult ?? '',
            entity.skinHue ?? '', entity.skinSaturation ?? '', entity.skinLightness ?? '',
            entity.displayArmour === false ? 0 : 1, entity.displayClothes === false ? 0 : 1,
            entity.goldGear ? 1 : 0,
            Number(z || 1).toFixed(3), Number(window.hexSize || 30).toFixed(2),
            safeJson(entity.equipped), safeJson(entity.clothingColors),
            safeJson(entity.shieldAppearance), safeJson(entity.equipmentAppearance),
        ].join('|');
    }

    function buildComposite(original, entity, z, flyOff, key) {
        const hs = Math.max(1, Number(window.hexSize || 30));
        const scale = Math.max(.1, Number(z || 1));
        // 8 hexes square leaves generous room for long weapons, shields and
        // tall race rigs while keeping the cache modest at normal zoom.
        const size = Math.max(64, Math.ceil(hs * scale * CACHE_PAD_HEXES * 2));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const off = canvas.getContext('2d');
        if (!off) return null;
        const cx = size / 2;
        const cy = size / 2;
        const before = Number(window.__humanoidRendererDrawCount || 0);
        original(off, entity, cx, cy, z, flyOff);
        const after = Number(window.__humanoidRendererDrawCount || 0);
        // Do not cache an empty/legacy fallback frame while directional assets
        // are still loading. A later normal render gets another chance to build.
        if (after <= before || window.__humanoidRendererLastDraw?.entity !== entity) return null;
        stats.builds++;
        return { canvas, key, cx, cy };
    }

    function install() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (current.__stableNpcCompositeCache) { stats.installed = true; return true; }

        const wrapped = function(ctx, entity, x, y, z=1, flyOff=0) {
            if (!ctx || !isStableNpc(entity)) {
                stats.bypasses++;
                return current.apply(this, arguments);
            }

            const key = appearanceKey(entity, z);
            let entry = cache.get(entity);
            if (!entry || entry.key !== key) {
                stats.misses++;
                entry = buildComposite(current, entity, z, flyOff, key);
                if (!entry) {
                    stats.failedBuilds++;
                    return current.apply(this, arguments);
                }
                cache.set(entity, entry);
            } else {
                stats.hits++;
            }

            ctx.drawImage(entry.canvas, x - entry.cx, y - entry.cy);
            return undefined;
        };

        wrapped.__stableNpcCompositeCache = true;
        wrapped.__original = current;
        // Preserve the marker used by later presentation modules/tests.
        if (current.__directHumanoidCompositor) wrapped.__directHumanoidCompositor = true;
        window.drawPlayerCharacter = wrapped;
        window.clearHumanoidSpriteCache = entity => {
            if (entity) cache.delete(entity);
            // WeakMap cannot be cleared wholesale; replacing individual entries
            // is sufficient for normal appearance/equipment changes because the
            // signature invalidates automatically.
        };
        stats.installed = true;
        return true;
    }

    window.HumanoidSpriteCache = { install, stats, CACHE_PAD_HEXES };
    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    }
})();
