// humanoidSpriteCache.js
// Out-of-combat non-party humanoids usually keep the same body, hair, clothing
// and equipment for many frames. The direct compositor can issue dozens of
// canvas draws per character (notably shaped armour), so cache the finished
// sprite and move that one bitmap around instead of recomposing every render.
(() => {
    'use strict';

    const CACHE_PAD_HEXES = 4;
    const INSTALL_RETRY_MS = 500;
    const HEALTHCHECK_MS = 1000;
    const cache = new WeakMap();
    const stats = window.humanoidSpriteCacheStats = {
        installed:false,
        hits:0,
        misses:0,
        builds:0,
        bypasses:0,
        failedBuilds:0,
        rewraps:0,
    };

    function safeJson(value) {
        try { return JSON.stringify(value) || ''; }
        catch (_) { return String(value ?? ''); }
    }

    function directHumanoid(entity) {
        if (!entity?.race || !entity?.gender) return false;
        return !!window.DIRECT_HUMANOID_RIGS?.[`${entity.race}_${entity.gender}`];
    }

    function isStableNpc(entity) {
        if (!entity || window.isInCombat) return false;
        if (entity.side === 'player') return false;
        return directHumanoid(entity);
    }

    function appearanceKey(entity, z) {
        return [
            entity.facing || 'down', entity.race || '', entity.gender || '', entity.bodyType || '',
            entity.hairStyle || '', entity.hairHue ?? '', entity.hairLightMult ?? '', entity.hairSatMult ?? '',
            entity.skinHue ?? '', entity.skinSaturation ?? '', entity.skinLightness ?? '',
            entity.displayArmour === false ? 0 : 1, entity.displayClothes === false ? 0 : 1,
            entity.goldGear ? 1 : 0,
            Number(z || 1).toFixed(3), Number(window.hexSize || 30).toFixed(2),
            safeJson(entity.equipped), safeJson(entity.clothing), safeJson(entity.equippedClothing),
            safeJson(entity.clothingColors), safeJson(entity.shieldAppearance), safeJson(entity.equipmentAppearance),
        ].join('|');
    }

    function wrapperChainHas(fn, marker) {
        const seen = new Set();
        const pending = [fn];
        const links = ['__original','__previous','__legacyDrawPlayerCharacter','__braidWrappedFunction','__alignmentWrappedFunction','__preciseBase'];
        while (pending.length) {
            const current = pending.pop();
            if (typeof current !== 'function' || seen.has(current)) continue;
            seen.add(current);
            if (current[marker]) return true;
            for (const link of links) if (typeof current[link] === 'function') pending.push(current[link]);
        }
        return false;
    }

    function buildComposite(original, entity, z, flyOff) {
        const hs = Math.max(1, Number(window.hexSize || 30));
        const scale = Math.max(.1, Number(z || 1));
        // 8 hexes square leaves generous room for long weapons, shields and
        // tall race rigs while keeping coordinates identical to the world draw.
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
        // Rendering may initialise skin/hair defaults. Capture the key AFTER the
        // first successful composition so that initialisation does not force an
        // unnecessary miss on the very next frame.
        return { canvas, key:appearanceKey(entity,z), cx, cy };
    }

    function install() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (wrapperChainHas(current, '__stableNpcCompositeCache')) {
            stats.installed = true;
            return true;
        }

        const wrapped = function(ctx, entity, x, y, z=1, flyOff=0) {
            if (!ctx || !isStableNpc(entity)) {
                stats.bypasses++;
                return current.apply(this, arguments);
            }

            const key = appearanceKey(entity, z);
            let entry = cache.get(entity);
            if (!entry || entry.key !== key) {
                stats.misses++;
                entry = buildComposite(current, entity, z, flyOff);
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
        if (wrapperChainHas(current, '__directHumanoidCompositor')) wrapped.__directHumanoidCompositor = true;
        window.drawPlayerCharacter = wrapped;
        window.clearHumanoidSpriteCache = entity => {
            if (entity) cache.delete(entity);
        };
        stats.installed = true;
        return true;
    }

    function installReportStats() {
        // Useful for direct callers of window.getPerformanceReport. The profiler
        // UI currently calls its private getReport() closure instead, so the live
        // overlay below is the authoritative on-device cache diagnostic.
        const current = window.getPerformanceReport;
        if (typeof current !== 'function') return false;
        if (current.__npcSpriteCacheStats) return true;
        const wrapped = function(...args) {
            const report = current.apply(this, args);
            const s = window.humanoidSpriteCacheStats || {};
            const lookups = Number(s.hits || 0) + Number(s.misses || 0);
            const hitRate = lookups ? (100 * Number(s.hits || 0) / lookups).toFixed(1) : '0.0';
            return `${report}\n\nNPC HUMANOID COMPOSITE CACHE\n============================\nInstalled: ${!!s.installed} | hits=${s.hits || 0} misses=${s.misses || 0} hitRate=${hitRate}%\nBuilds=${s.builds || 0} failedBuilds=${s.failedBuilds || 0} bypasses=${s.bypasses || 0} rewraps=${s.rewraps || 0}`;
        };
        wrapped.__npcSpriteCacheStats = true;
        wrapped.__original = current;
        window.getPerformanceReport = wrapped;
        return true;
    }

    function updateOverlayStats() {
        const overlay = document.getElementById('performance-monitor-overlay');
        if (!overlay) return;
        let el = document.getElementById('npc-sprite-cache-summary');
        if (!el) {
            el = document.createElement('div');
            el.id = 'npc-sprite-cache-summary';
            el.style.cssText = 'white-space:pre;line-height:1.3;margin-top:3px;color:#ffe59a;pointer-events:none;';
            const summary = overlay.querySelector('#performance-monitor-summary');
            summary?.insertAdjacentElement('afterend', el);
        }
        const lookups = stats.hits + stats.misses;
        const rate = lookups ? (100 * stats.hits / lookups).toFixed(0) : '0';
        const live = wrapperChainHas(window.drawPlayerCharacter, '__stableNpcCompositeCache');
        el.textContent = `npc-cache ${live ? 'LIVE' : 'LOST'} hit ${stats.hits}/${lookups} (${rate}%) build ${stats.builds} fail ${stats.failedBuilds}`;
    }

    window.HumanoidSpriteCache = { install, installReportStats, updateOverlayStats, stats, CACHE_PAD_HEXES };

    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    }
    if (!installReportStats()) {
        const reportTimer = setInterval(() => { if (installReportStats()) clearInterval(reportTimer); }, INSTALL_RETRY_MS);
    }

    // Presentation modules are still installed asynchronously during startup.
    // If a later module replaces drawPlayerCharacter instead of wrapping through
    // us, re-attach the cache to the final chain. This check is only 1 Hz and does
    // no rendering work itself.
    setInterval(() => {
        const current = window.drawPlayerCharacter;
        if (typeof current === 'function' && !wrapperChainHas(current, '__stableNpcCompositeCache')) {
            stats.installed = false;
            if (install()) stats.rewraps++;
        }
        updateOverlayStats();
    }, HEALTHCHECK_MS);
})();
