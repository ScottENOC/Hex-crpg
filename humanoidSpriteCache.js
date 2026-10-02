// humanoidSpriteCache.js
// Out-of-combat humanoids usually keep the same body, hair, clothing and
// equipment for many frames. The direct compositor can issue dozens of canvas
// draws per character, so cache the finished sprite and move that one bitmap
// around instead of recomposing every render. This deliberately includes the
// player party: world position is not baked into the composite, and facing /
// appearance changes are already part of the cache key.
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
        playerHits:0,
        npcHits:0,
        buildMs:0,
        maxBuildMs:0,
    };

    function safeJson(value) {
        try { return JSON.stringify(value) || ''; }
        catch (_) { return String(value ?? ''); }
    }

    function directHumanoid(entity) {
        if (!entity?.race || !entity?.gender) return false;
        return !!window.DIRECT_HUMANOID_RIGS?.[`${entity.race}_${entity.gender}`];
    }

    function isCacheableHumanoid(entity) {
        if (!entity || window.isInCombat) return false;
        return directHumanoid(entity);
    }

    function appearanceKey(entity, z, flyOff=0) {
        return [
            entity.facing || 'down', entity.race || '', entity.gender || '', entity.bodyType || '',
            entity.hairStyle || '', entity.hairHue ?? '', entity.hairLightMult ?? '', entity.hairSatMult ?? '',
            entity.skinHue ?? '', entity.skinSaturation ?? '', entity.skinLightness ?? '',
            entity.displayArmour === false ? 0 : 1, entity.displayClothes === false ? 0 : 1,
            entity.goldGear ? 1 : 0,
            Number(z || 1).toFixed(3), Number(flyOff || 0).toFixed(3), Number(window.hexSize || 30).toFixed(2),
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
        const size = Math.max(64, Math.ceil(hs * scale * CACHE_PAD_HEXES * 2));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const off = canvas.getContext('2d');
        if (!off) return null;
        const cx = size / 2;
        const cy = size / 2;
        const before = Number(window.__humanoidRendererDrawCount || 0);
        const t0 = performance.now();
        original(off, entity, cx, cy, z, flyOff);
        const elapsed = performance.now() - t0;
        stats.buildMs += elapsed;
        stats.maxBuildMs = Math.max(stats.maxBuildMs, elapsed);
        const after = Number(window.__humanoidRendererDrawCount || 0);
        // Do not cache an empty/legacy fallback frame while the body is still
        // unavailable. Once the body can be composed, subsequent world frames
        // should only blit this bitmap rather than repeating per-pixel work.
        if (after <= before || window.__humanoidRendererLastDraw?.entity !== entity) return null;
        stats.builds++;
        return { canvas, key:appearanceKey(entity,z,flyOff), cx, cy };
    }

    function install() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (wrapperChainHas(current, '__stableNpcCompositeCache')) {
            stats.installed = true;
            return true;
        }

        const wrapped = function(ctx, entity, x, y, z=1, flyOff=0) {
            if (!ctx || !isCacheableHumanoid(entity)) {
                stats.bypasses++;
                return current.apply(this, arguments);
            }

            const key = appearanceKey(entity, z, flyOff);
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
                if (entity.side === 'player') stats.playerHits++;
                else stats.npcHits++;
            }

            ctx.drawImage(entry.canvas, x - entry.cx, y - entry.cy);
            return undefined;
        };

        wrapped.__stableNpcCompositeCache = true;
        wrapped.__original = current;
        if (wrapperChainHas(current, '__directHumanoidCompositor')) wrapped.__directHumanoidCompositor = true;
        window.drawPlayerCharacter = wrapped;
        window.clearHumanoidSpriteCache = entity => {
            if (entity) cache.delete(entity);
        };
        stats.installed = true;
        return true;
    }

    function installReportStats() {
        const current = window.getPerformanceReport;
        if (typeof current !== 'function') return false;
        if (current.__npcSpriteCacheStats) return true;
        const wrapped = function(...args) {
            const report = current.apply(this, args);
            const s = window.humanoidSpriteCacheStats || {};
            const lookups = Number(s.hits || 0) + Number(s.misses || 0);
            const hitRate = lookups ? (100 * Number(s.hits || 0) / lookups).toFixed(1) : '0.0';
            const avgBuild = s.builds ? (Number(s.buildMs || 0) / s.builds).toFixed(2) : '0.00';
            return `${report}\n\nHUMANOID COMPOSITE CACHE\n========================\nInstalled: ${!!s.installed} | hits=${s.hits || 0} misses=${s.misses || 0} hitRate=${hitRate}%\nPlayer hits=${s.playerHits || 0} NPC hits=${s.npcHits || 0}\nBuilds=${s.builds || 0} failedBuilds=${s.failedBuilds || 0} bypasses=${s.bypasses || 0} rewraps=${s.rewraps || 0}\nBuild avg=${avgBuild}ms max=${Number(s.maxBuildMs || 0).toFixed(2)}ms`;
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
        const avgBuild = stats.builds ? (stats.buildMs / stats.builds).toFixed(1) : '0.0';
        el.textContent = `hum-cache ${live ? 'LIVE' : 'LOST'} hit ${stats.hits}/${lookups} (${rate}%) P${stats.playerHits} N${stats.npcHits} build ${stats.builds} fail ${stats.failedBuilds} ${avgBuild}ms avg`;
    }

    window.HumanoidSpriteCache = { install, installReportStats, updateOverlayStats, stats, CACHE_PAD_HEXES };

    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    }
    if (!installReportStats()) {
        const reportTimer = setInterval(() => { if (installReportStats()) clearInterval(reportTimer); }, INSTALL_RETRY_MS);
    }

    setInterval(() => {
        const current = window.drawPlayerCharacter;
        if (typeof current === 'function' && !wrapperChainHas(current, '__stableNpcCompositeCache')) {
            stats.installed = false;
            if (install()) stats.rewraps++;
        }
        updateOverlayStats();
    }, HEALTHCHECK_MS);
})();
