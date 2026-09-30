// renderHotPathCache.js
// Runtime simplification for the two hottest character/UI paths:
// 1) shirt/dress layers are flattened once, then drawn as one stretched image;
// 2) the initiative bar keeps stable cards/portraits and only updates changing text/order.
(() => {
    'use strict';

    const root = window;
    const BUILD = '20260930-render-hotpath-cache-v1';
    const MAX_SHIRT_CACHE = 192;
    const sourceImages = new Map();
    const sourceBounds = new WeakMap();
    const shirtCompositeCache = new Map();

    function resolvedView(view) {
        if (view === 'up' || view === 'back') return 'back';
        if (view === 'left' || view === 'right' || view === 'side') return 'side';
        return 'front';
    }

    function sourceForLayer(layer, view) {
        const v = resolvedView(view);
        if (layer?.views?.[v]) return layer.views[v];
        if (v === 'side') return layer?.views?.front || layer?.views?.back || null;
        return layer?.views?.front || null;
    }

    function requestRedraw() {
        shirtCompositeCache.clear();
        if (typeof root.requestGameRender === 'function') root.requestGameRender();
        else if (typeof root.drawMap === 'function') root.drawMap();
        root.refreshDirectionalTurnPortraits?.();
        root.updateAppearancePreview?.();
    }

    function loadSource(src) {
    if (!src) return null;
    if (sourceImages.has(src)) return sourceImages.get(src);
    const img = window.assetManager.request(src);
    sourceImages.set(src, img);
    window.assetManager.whenReady(src).then(requestRedraw).catch(() => console.warn('Shirt hot-path asset failed:', src));
    return img;
  }

  function imageReady(img) {
        return !!img && ((img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
            || (img.width > 0 && img.height > 0));
    }

    // One alpha scan per authored source. If a source image needs something more
    // sophisticated than a single bounding rectangle, fix the source asset once
    // instead of paying for runtime strip warping on every frame.
    function alphaBounds(img) {
        if (sourceBounds.has(img)) return sourceBounds.get(img);
        const w = img.naturalWidth || img.width || 1;
        const h = img.naturalHeight || img.height || 1;
        let result = { x: 0, y: 0, w, h };
        try {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const pixels = ctx.getImageData(0, 0, w, h).data;
            let left = w, top = h, right = -1, bottom = -1;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (pixels[(y * w + x) * 4 + 3] < 8) continue;
                    if (x < left) left = x;
                    if (x > right) right = x;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                }
            }
            if (right >= left && bottom >= top) {
                result = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
            }
        } catch (_) {
            // SVG/cross-origin edge cases simply use the full authored rectangle.
        }
        sourceBounds.set(img, result);
        return result;
    }

    function targetForShirt(system, itemId, spec, view) {
        const set = system.clothingTargets?.[resolvedView(view)] || system.clothingTargets?.front;
        if (!set) return null;
        const isLongGarment = spec?.fitMode === 'dressSplit' || itemId === 'top_dress';
        let target = isLongGarment ? (set.dress || set.shirt) : set.shirt;
        if (!target) return null;
        // Keep the one useful placement correction from the old fitter without
        // retaining any of its per-strip deformation work.
        if (itemId === 'top_shirt_f') target = { ...target, y: target.y - 0.03, h: target.h + 0.06 };
        return target;
    }

    function colourSignature(system, entity, itemId, spec) {
        return spec.layers.map(layer => {
            const c = system.getLayerColour(entity, itemId, layer) || {};
            return `${layer.id}:${Number(c.hue || 0).toFixed(2)},${Number(c.saturation || 0).toFixed(2)},${Number(c.value || 0).toFixed(2)},${Number(c.opacity ?? 1).toFixed(3)}`;
        }).join('|');
    }

    function cachePut(key, value) {
        shirtCompositeCache.set(key, value);
        if (shirtCompositeCache.size <= MAX_SHIRT_CACHE) return;
        const oldest = shirtCompositeCache.keys().next().value;
        shirtCompositeCache.delete(oldest);
    }

    function buildSimpleShirt(system, entity, itemId, spec, view, width, height) {
        const target = targetForShirt(system, itemId, spec, view);
        if (!target) return null;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        let drew = false;

        for (const layer of spec.layers) {
            const src = sourceForLayer(layer, view);
            const img = loadSource(src);
            if (!imageReady(img)) continue;
            const colour = system.getLayerColour(entity, itemId, layer);
            const rendered = layer.tint === false
                ? img
                : (system.tintWholeLayer?.(img, colour, layer) || img);
            const trim = alphaBounds(img);
            const dx = target.x * canvas.width;
            const dy = target.y * canvas.height;
            const dw = target.w * canvas.width;
            const dh = target.h * canvas.height;
            ctx.drawImage(rendered, trim.x, trim.y, trim.w, trim.h, dx, dy, dw, dh);
            drew = true;
        }
        return drew ? canvas : null;
    }

    function installSimpleShirtRenderer() {
        const system = root.clothingSystem;
        if (!system?.drawSlot || system.drawSlot.__simpleCachedShirts) return !!system?.drawSlot?.__simpleCachedShirts;
        const originalDrawSlot = system.drawSlot;

        const cachedDrawSlot = function(ctx, entity, slot, view, bounds) {
            if (slot !== 'shirt') return originalDrawSlot.apply(this, arguments);
            if (!ctx || !entity || !bounds || entity.displayClothes === false) return false;
            if (root.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) === false) return false;

            system.migrateLegacyEquipment?.(entity);
            system.ensureDefaultOutfit?.(entity, { player: entity.side === 'player' });
            const itemId = entity.equipped?.shirt;
            const spec = itemId && system.getItemSpec?.(itemId);
            if (!spec || spec.slot !== 'shirt') return false;

            const width = Math.max(1, Math.ceil(bounds.width));
            const height = Math.max(1, Math.ceil(bounds.height));
            const key = [
                resolvedView(view), itemId, width, height,
                colourSignature(system, entity, itemId, spec),
                spec.fitMode || 'stretch'
            ].join('::');

            let composite = shirtCompositeCache.get(key);
            if (!composite) {
                composite = buildSimpleShirt(system, entity, itemId, spec, view, width, height);
                if (!composite) return false; // source still loading; normal redraw fires on load
                cachePut(key, composite);
            }
            ctx.drawImage(composite, bounds.left, bounds.top, bounds.width, bounds.height);
            return true;
        };

        cachedDrawSlot.__simpleCachedShirts = true;
        cachedDrawSlot.__originalDrawSlot = originalDrawSlot;
        system.drawSlot = cachedDrawSlot;
        root.clearShirtRenderCache = () => shirtCompositeCache.clear();
        return true;
    }

    // ----- Initiative tracker -------------------------------------------------
    const turnEntityKeys = new WeakMap();
    let turnEntitySerial = 0;
    let turnIndicatorInstalled = false;

    function turnKey(entity) {
        if (!entity || typeof entity !== 'object') return String(entity);
        if (!turnEntityKeys.has(entity)) {
            const stableHint = entity.id !== undefined && entity.id !== null
                ? `id:${entity.id}`
                : (entity.networkId ? `net:${entity.networkId}` : 'entity');
            turnEntityKeys.set(entity, `${stableHint}|obj:${++turnEntitySerial}`);
        }
        return turnEntityKeys.get(entity);
    }

    function safeJson(value) {
        try { return JSON.stringify(value) || ''; }
        catch (_) { return String(value ?? ''); }
    }

    function appearanceKey(entity) {
        return safeJson({
            name: entity.name, side: entity.side,
            race: entity.race, gender: entity.gender, bodyType: entity.bodyType,
            hairStyle: entity.hairStyle, hairHue: entity.hairHue,
            hairLightMult: entity.hairLightMult, hairSatMult: entity.hairSatMult,
            skinHue: entity.skinHue, skinSaturation: entity.skinSaturation, skinLightness: entity.skinLightness,
            equipped: entity.equipped, clothingColors: entity.clothingColors,
            displayArmour: entity.displayArmour, displayClothes: entity.displayClothes,
            goldGear: entity.goldGear, customImage: entity.customImage,
            shieldAppearance: entity.shieldAppearance, equipmentAppearance: entity.equipmentAppearance
        });
    }

    function visibleTurnEntities() {
        const entities = [...(root.entities || [])]
            .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
        if (root.isInCombat) entities.sort((a, b) => b.timePoints - a.timePoints);
        return entities;
    }

    function activeSpellKey() {
        return safeJson((root.activeSpells || []).map(s => [s.spellInstanceId, s.name, s.casterName, s.targetEntityId, s.entityId]));
    }

    function structuralSignature(entities) {
        return [
            root.isInCombat ? 'combat' : 'realtime',
            activeSpellKey(),
            ...entities.map(e => `${turnKey(e)}:${appearanceKey(e)}:${e.disconnected ? 1 : 0}:${e.riding ? turnKey(e.riding) : '-'}:${(e.maxMana > 0 || e.currentMana > 0) ? 1 : 0}`).sort()
        ].join('||');
    }

    function setOnlyTextNode(element, text) {
        if (!element) return false;
        const node = Array.from(element.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (!node) return false;
        if (node.nodeValue !== text) node.nodeValue = text;
        return true;
    }

    function updateExistingCard(card, entity, order) {
        card.style.order = String(order);
        card.classList.toggle('current-turn', entity === root.currentTurnEntity);
        const portrait = card.querySelector('.turn-indicator-portrait');
        if (portrait) portrait.style.transform = entity.isFlying ? 'translateY(-5px)' : '';

        const info = card.querySelector('.turn-indicator-info');
        if (!info) return false;
        const rows = info.querySelectorAll('p');
        let row = 1; // row 0 is the stable name/disconnected label
        const hpText = `HP: ${Math.ceil(entity.hp)}/${entity.maxHp}${root.isInCombat ? ` | TP: ${Math.floor(entity.timePoints)}` : ''}`;
        if (!setOnlyTextNode(rows[row++], hpText)) return false;
        if (entity.maxMana > 0 || entity.currentMana > 0) {
            if (!setOnlyTextNode(rows[row++], `MP: ${Math.floor(entity.currentMana)}/${entity.maxMana || 0}`)) return false;
        }
        if (entity.riding) {
            const m = entity.riding;
            const mountText = `${m.name}: ${Math.ceil(m.hp)}/${m.maxHp} HP${root.isInCombat ? ` | ${Math.floor(m.timePoints)} TP` : ''}`;
            if (!setOnlyTextNode(rows[row++], mountText)) return false;
        }
        return true;
    }

    function installStableTurnIndicator() {
        if (turnIndicatorInstalled) return true;
        const current = root.updateTurnIndicator;
        if (typeof current !== 'function') return false;
        if (current.__stableTurnCards) { turnIndicatorInstalled = true; return true; }
        // graphicsSettings may already have wrapped the original with a 4 Hz
        // non-combat throttle. Once the fast path below is installed, the cheap
        // text/order update can safely run at call cadence; only rebuilds stay heavy.
        const base = current.__nonCombatThrottled && current.__original ? current.__original : current;
        let lastStructure = null;
        let cards = new Map();

        function rebuild(entities, signature) {
            base();
            const bar = document.getElementById('turn-indicator-bar');
            if (!bar) return;
            const nodes = Array.from(bar.children).filter(node => node.classList?.contains('turn-indicator-item'));
            cards = new Map();
            entities.forEach((entity, index) => {
                const card = nodes[index];
                if (!card) return;
                const key = turnKey(entity);
                card.dataset.turnEntityKey = key;
                card.style.order = String(index);
                cards.set(key, card);
            });
            lastStructure = signature;
            // Direct portraits are now treated as cached card content: compose
            // once after a structural/appearance rebuild, not after HP/TP text updates.
            root.refreshDirectionalTurnPortraits?.();
        }

        const stable = function() {
            const bar = document.getElementById('turn-indicator-bar');
            if (!bar) return base();
            const entities = visibleTurnEntities();
            const signature = structuralSignature(entities);
            if (signature !== lastStructure || cards.size !== entities.length) {
                rebuild(entities, signature);
                return;
            }

            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                const card = cards.get(turnKey(entity));
                if (!card || !card.isConnected || !updateExistingCard(card, entity, i)) {
                    rebuild(entities, signature);
                    return;
                }
            }
        };
        stable.__stableTurnCards = true;
        stable.__original = base;
        root.updateTurnIndicator = stable;
        root.invalidateTurnIndicatorCache = () => { lastStructure = null; };
        turnIndicatorInstalled = true;
        return true;
    }

    function installAll() {
        const shirts = installSimpleShirtRenderer();
        const turns = installStableTurnIndicator();
        return shirts && turns;
    }

    function beginInstall() {
        installAll();
        const timer = setInterval(() => {
            if (installAll()) clearInterval(timer);
        }, 100);
        setTimeout(() => clearInterval(timer), 15000);
    }

    root.RENDER_HOT_PATH_CACHE_BUILD = BUILD;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(beginInstall, 0), { once: true });
    } else {
        setTimeout(beginInstall, 0);
    }
})();
