// renderHotPathCache.js
// Keeps only the lightweight initiative-card optimisation.
// Character clothing is rendered exclusively by clothingLayers.js; final humanoid
// composites are cached by humanoidRenderer.js.
(() => {
    'use strict';

    const root = window;
    const BUILD = '20261005-render-hotpath-v2';

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
        return installStableTurnIndicator();
    }

    function beginInstall() {
        installAll();
        const timer = setInterval(() => {
            if (installAll()) clearInterval(timer);
        }, 100);
        setTimeout(() => clearInterval(timer), 15000);
    }

    root.RENDER_HOT_PATH_CACHE_BUILD = BUILD;
    root.__renderHotPathCacheBuild = BUILD;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(beginInstall, 0), { once: true });
    } else {
        setTimeout(beginInstall, 0);
    }
})();

