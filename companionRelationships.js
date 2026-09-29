// companionRelationships.js
// Player<->companion relationship state and respectful clothing-boundary gates.
//
// The game already owns approval through window.companionAttitude (0..100).
// This module adds the two dimensions that approval cannot sensibly stand in for:
//   familiarity: how well the companion knows the player (0..100)
//   trust:       how safe/reliable the player feels to them (0..100)
//
// Clothing permissions use familiarity + trust, never approval or romance.
// A companion can also author a permanent stricter boundary via
// companionClothingPolicy.allowRevealing=false.
(() => {
    'use strict';

    const BUILD = '20260929-companion-relationships-v2';
    const CLOTHING_SLOTS = ['shirt', 'pants', 'bra', 'underwear'];
    const DEFAULT_RELATIONSHIP = Object.freeze({ familiarity: 10, trust: 10 });
    const DEFAULT_APPROVAL = 50;
    const DEFAULT_POLICY = Object.freeze({
        styleFamiliarity: 30,
        revealingFamiliarity: 30,
        revealingTrust: 70,
        allowRevealing: true,
    });
    const FEEDBACK_COOLDOWN_MS = 1200;
    const EPSILON = 0.0001;
    let systemBypassDepth = 0;

    function clamp(value, min, max) {
        const n = Number(value);
        return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
    }

    function canonicalPartyMember(entity) {
        if (!entity || !Array.isArray(window.party)) return null;
        if (window.party.includes(entity)) return entity;
        if (!entity.name) return null;
        return window.party.find(member => member?.name === entity.name) || null;
    }

    function mainCharacter() {
        return Array.isArray(window.party) && window.party.length ? window.party[0] : null;
    }

    function isGovernedCompanion(entity) {
        const canonical = canonicalPartyMember(entity);
        if (!canonical || canonical === mainCharacter()) return false;
        if (canonical.companionClothingBoundaries === false) return false;
        // Only true party members are governed. Temporary allies, summons and
        // mounts that merely use side:'player' never inherit social boundaries.
        return true;
    }

    function syncFieldByName(source, field) {
        if (!source?.name) return;
        for (const target of [...(window.party || []), ...(window.entities || [])]) {
            if (!target || target === source || target.name !== source.name) continue;
            target[field] = JSON.parse(JSON.stringify(source[field]));
        }
    }

    function relationshipSeed(entity) {
        const authored = entity?.companionRelationshipStart || {};
        return {
            familiarity: authored.familiarity ?? DEFAULT_RELATIONSHIP.familiarity,
            trust: authored.trust ?? DEFAULT_RELATIONSHIP.trust,
        };
    }

    function approvalFor(entity) {
        const canonical = canonicalPartyMember(entity) || entity;
        if (!canonical?.name) return DEFAULT_APPROVAL;
        window.companionAttitude = window.companionAttitude || {};

        if (window.companionAttitude[canonical.name] === undefined) {
            const authored = canonical.companionRelationshipStart?.approval;
            const legacy = canonical.playerRelationship?.approval;
            // v1 briefly stored a second -100..100 approval value on the party
            // member. If a development save contains it and the canonical meter
            // has no value yet, migrate it once into the established 0..100
            // companionAttitude scale, then ensureRelationship removes the copy.
            if (legacy !== undefined) {
                window.companionAttitude[canonical.name] = clamp((Number(legacy) + 100) / 2, 0, 100);
            } else {
                window.companionAttitude[canonical.name] = clamp(authored ?? DEFAULT_APPROVAL, 0, 100);
            }
        }
        return clamp(window.companionAttitude[canonical.name], 0, 100);
    }

    function ensureRelationship(entity) {
        const canonical = canonicalPartyMember(entity) || entity;
        if (!canonical) return null;
        // Migrate v1 approval before deleting its duplicate field.
        approvalFor(canonical);
        const seed = relationshipSeed(canonical);
        const current = (canonical.playerRelationship && typeof canonical.playerRelationship === 'object')
            ? canonical.playerRelationship
            : {};
        current.familiarity = clamp(current.familiarity ?? seed.familiarity, 0, 100);
        current.trust = clamp(current.trust ?? seed.trust, 0, 100);
        delete current.approval;
        if (!Array.isArray(current.history)) current.history = [];
        if (!Array.isArray(current.knownConversationKeys)) current.knownConversationKeys = [];
        canonical.playerRelationship = current;
        if (canonical !== entity && entity) entity.playerRelationship = JSON.parse(JSON.stringify(current));
        return current;
    }

    function relationshipSnapshot(entity) {
        const canonical = canonicalPartyMember(entity) || entity;
        const rel = ensureRelationship(canonical);
        if (!rel) return null;
        return {
            familiarity: rel.familiarity,
            trust: rel.trust,
            approval: approvalFor(canonical),
        };
    }

    function relationshipPolicy(entity) {
        const canonical = canonicalPartyMember(entity) || entity;
        const authored = canonical?.companionClothingPolicy;
        if (authored === false) return { ...DEFAULT_POLICY, allowRevealing: false };
        return { ...DEFAULT_POLICY, ...(authored || {}) };
    }

    function relationshipTier(entity) {
        const rel = ensureRelationship(entity);
        if (!rel) return 'none';
        const policy = relationshipPolicy(entity);
        if (rel.familiarity < policy.styleFamiliarity) return 'new';
        if (policy.allowRevealing !== false &&
            rel.familiarity >= policy.revealingFamiliarity &&
            rel.trust >= policy.revealingTrust) return 'trusted';
        return 'familiar';
    }

    function emitRelationshipChange(canonical, previous, reason) {
        const current = relationshipSnapshot(canonical);
        const stored = ensureRelationship(canonical);
        if (reason && current && (
            previous.familiarity !== current.familiarity ||
            previous.trust !== current.trust ||
            previous.approval !== current.approval
        )) {
            stored.history.push({ reason: String(reason), ...current });
            if (stored.history.length > 24) stored.history.splice(0, stored.history.length - 24);
        }
        syncFieldByName(canonical, 'playerRelationship');
        try {
            window.dispatchEvent(new CustomEvent('companionRelationshipChanged', {
                detail: { companion: canonical, previous, current: current ? { ...current } : null, reason },
            }));
        } catch (_) { /* CustomEvent can be absent in narrow test harnesses. */ }
        return current;
    }

    // Absolute setter is primarily for authored starts, migrations, dev tools
    // and deterministic tests. Story approval changes should normally keep
    // using adjustCompanionAttitude so existing approve/disapprove feedback and
    // departure-at-zero behaviour stay authoritative.
    function setRelationship(entity, patch, reason = 'authored relationship change') {
        const canonical = canonicalPartyMember(entity) || entity;
        if (!canonical) return null;
        const previous = relationshipSnapshot(canonical);
        const current = ensureRelationship(canonical);
        patch = patch || {};
        if (patch.familiarity !== undefined) current.familiarity = clamp(patch.familiarity, 0, 100);
        if (patch.trust !== undefined) current.trust = clamp(patch.trust, 0, 100);
        if (patch.approval !== undefined && canonical.name) {
            window.companionAttitude = window.companionAttitude || {};
            window.companionAttitude[canonical.name] = clamp(patch.approval, 0, 100);
        }
        return emitRelationshipChange(canonical, previous, reason);
    }

    function adjustRelationship(entity, delta, reason = 'authored relationship change') {
        const canonical = canonicalPartyMember(entity) || entity;
        if (!canonical) return null;
        const previous = relationshipSnapshot(canonical);
        const current = ensureRelationship(canonical);
        delta = delta || {};
        current.familiarity = clamp(current.familiarity + Number(delta.familiarity || 0), 0, 100);
        current.trust = clamp(current.trust + Number(delta.trust || 0), 0, 100);

        const approvalDelta = Number(delta.approval || 0);
        if (approvalDelta) {
            if (typeof window.adjustCompanionAttitude === 'function') {
                window.adjustCompanionAttitude(canonical.name, approvalDelta, reason);
            } else {
                window.companionAttitude = window.companionAttitude || {};
                window.companionAttitude[canonical.name] = clamp(approvalFor(canonical) + approvalDelta, 0, 100);
            }
        }
        return emitRelationshipChange(canonical, previous, reason);
    }

    // Narrative code can award familiarity for genuinely new conversations by
    // passing a stable key. Repeating the same node does not farm familiarity.
    function noteConversation(entity, key, gain = 4) {
        const canonical = canonicalPartyMember(entity) || entity;
        const rel = ensureRelationship(canonical);
        if (!rel || !key) return relationshipSnapshot(canonical);
        const stableKey = String(key);
        if (rel.knownConversationKeys.includes(stableKey)) return relationshipSnapshot(canonical);
        rel.knownConversationKeys.push(stableKey);
        if (rel.knownConversationKeys.length > 80) rel.knownConversationKeys.splice(0, rel.knownConversationKeys.length - 80);
        return adjustRelationship(canonical, { familiarity: Math.max(0, Number(gain) || 0) }, `conversation:${stableKey}`);
    }

    function semanticLayer(layer) {
        const label = String(layer?.label || '').toLowerCase();
        const id = String(layer?.id || '').toLowerCase();
        if (label.includes('main') || label.includes('base') || id === 'dark' || id === 'base' || id === 'main') return 'main';
        if (label.includes('trim') || id === 'light' || id === 'trim') return 'trim';
        return id || label || 'part';
    }

    function withSystemOverride(fn) {
        systemBypassDepth++;
        try { return fn(); }
        finally { systemBypassDepth--; }
    }

    function captureClothingBaseline(entity, { force = false } = {}) {
        const canonical = canonicalPartyMember(entity) || entity;
        if (!canonical) return null;
        if (canonical.clothingBoundaryBaseline && !force) return canonical.clothingBoundaryBaseline;
        const cs = window.clothingSystem;
        if (!cs) return null;

        // Capture what the companion actually arrived wearing. Do not invent a
        // default outfit here: an authored empty slot is itself meaningful.
        withSystemOverride(() => cs.migrateLegacyEquipment?.(canonical));
        const ea = window.equipmentAppearanceSystem;
        const slots = {};
        for (const slot of CLOTHING_SLOTS) {
            const itemId = canonical.equipped?.[slot] || null;
            const itemSpec = itemId ? cs.getItemSpec?.(itemId) : null;
            const layers = {};
            for (const layer of itemSpec?.layers || []) {
                const colour = cs.getLayerColour?.(canonical, itemId, layer) || layer.defaultColor || { opacity: 1 };
                layers[semanticLayer(layer)] = {
                    minOpacity: clamp(colour.opacity ?? 1, 0, 1),
                    sourceLayerId: layer.id,
                };
            }
            slots[slot] = {
                initiallyOccupied: !!itemId,
                initiallyVisible: itemId ? (ea?.isSlotVisible?.(canonical, slot) !== false) : false,
                initialItemId: itemId,
                layers,
            };
        }
        canonical.clothingBoundaryBaseline = { version: 1, slots };
        syncFieldByName(canonical, 'clothingBoundaryBaseline');
        return canonical.clothingBoundaryBaseline;
    }

    function baselineSlot(entity, slot) {
        return captureClothingBaseline(entity)?.slots?.[slot] || {
            initiallyOccupied: false,
            initiallyVisible: false,
            initialItemId: null,
            layers: {},
        };
    }

    function baselineOpacity(entity, slot, layer) {
        const baseline = baselineSlot(entity, slot);
        const semantic = semanticLayer(layer);
        if (baseline.layers?.[semantic]) return baseline.layers[semantic].minOpacity;
        // A new colour part on a replacement garment has no authored initial
        // transparency. While only styling is allowed, default conservatively
        // to opaque rather than creating a loophole through a new layer ID.
        return baseline.initiallyOccupied ? 1 : 0;
    }

    function canUseRevealingControls(entity) {
        const rel = ensureRelationship(entity);
        const policy = relationshipPolicy(entity);
        return !!rel && policy.allowRevealing !== false &&
            rel.familiarity >= policy.revealingFamiliarity &&
            rel.trust >= policy.revealingTrust;
    }

    function permission(entity, change = {}) {
        if (systemBypassDepth > 0 || !isGovernedCompanion(entity)) {
            return { allowed: true, tier: 'unrestricted', reason: null };
        }
        const canonical = canonicalPartyMember(entity) || entity;
        const rel = ensureRelationship(canonical);
        const policy = relationshipPolicy(canonical);
        const tier = relationshipTier(canonical);
        captureClothingBaseline(canonical);

        if (rel.familiarity < policy.styleFamiliarity) {
            return { allowed: false, tier, reason: 'new_companion' };
        }

        let revealing = !!change.revealing;
        const slot = change.slot;
        const baseline = slot ? baselineSlot(canonical, slot) : null;

        if (change.type === 'unequip' && baseline?.initiallyOccupied && canonical.equipped?.[slot]) revealing = true;
        if (change.type === 'visibility' && change.visible === false && baseline?.initiallyOccupied && baseline.initiallyVisible) revealing = true;

        if (change.type === 'layer' && slot && change.layer) {
            const floor = baselineOpacity(canonical, slot, change.layer);
            const currentOpacity = clamp(change.currentOpacity ?? 1, 0, 1);
            const nextOpacity = clamp(change.nextOpacity ?? currentOpacity, 0, 1);
            // If an old save/high-trust edit is already below baseline, becoming
            // more opaque is always permitted. Only a further revealing move is
            // gated; this never traps a companion in a revealing state.
            if (nextOpacity + EPSILON < floor && nextOpacity + EPSILON < currentOpacity) revealing = true;
        }

        if (change.type === 'equip' && slot && change.itemId) {
            const cs = window.clothingSystem;
            const itemSpec = cs?.getItemSpec?.(change.itemId);
            for (const layer of itemSpec?.layers || []) {
                const floor = baselineOpacity(canonical, slot, layer);
                const colour = cs.getLayerColour?.(canonical, change.itemId, layer) || layer.defaultColor || { opacity: 1 };
                if (clamp(colour.opacity ?? 1, 0, 1) + EPSILON < floor) {
                    revealing = true;
                    break;
                }
            }
        }

        if (!revealing) return { allowed: true, tier, reason: null };
        if (policy.allowRevealing === false) return { allowed: false, tier, reason: 'hard_boundary' };
        if (!canUseRevealingControls(canonical)) return { allowed: false, tier, reason: 'needs_trust' };
        return { allowed: true, tier, reason: null };
    }

    function boundaryText(entity, reason) {
        const authored = entity?.companionBoundaryDialogue || {};
        if (reason === 'new_companion') {
            return authored.clothingNew || "We've only just met. I'd rather choose my own clothes.";
        }
        if (reason === 'hard_boundary') {
            return authored.clothingHardBoundary || "I'm happy to choose colours and clothes with you, but I want to keep that boundary.";
        }
        return authored.clothingRevealing || "Colours and different clothes are fine. I'm not comfortable making it more revealing.";
    }

    function showBoundaryDialogue(entity, reason) {
        if (!entity || !reason) return;
        const canonical = canonicalPartyMember(entity) || entity;
        const now = Date.now();
        const feedback = canonical.companionBoundaryFeedback || (canonical.companionBoundaryFeedback = {});
        if (feedback.reason === reason && now - Number(feedback.at || 0) < FEEDBACK_COOLDOWN_MS) return;
        feedback.reason = reason;
        feedback.at = now;
        const text = boundaryText(canonical, reason);
        if (typeof window.showDialogue === 'function') {
            window.showDialogue(canonical, text, [{ label: 'Understood.', action: () => {} }]);
        } else if (typeof window.showMessage === 'function') {
            window.showMessage(`${canonical.name || 'Companion'}: “${text}”`);
        }
    }

    function enforce(entity, change) {
        const result = permission(entity, change);
        if (!result.allowed) showBoundaryDialogue(canonicalPartyMember(entity) || entity, result.reason);
        return result;
    }

    function wrapClothingSystem() {
        const cs = window.clothingSystem;
        if (!cs?.setLayerColour || cs.setLayerColour.__companionBoundaryAware) return false;
        const base = cs.setLayerColour;
        const wrapped = function(entity, itemId, layerId, next) {
            const spec = cs.getItemSpec?.(itemId);
            const layer = spec?.layers?.find(part => part.id === layerId) || { id: layerId, label: layerId };
            if (spec?.slot && CLOTHING_SLOTS.includes(spec.slot)) {
                const current = cs.getLayerColour?.(entity, itemId, layer) || { opacity: 1 };
                const check = enforce(entity, {
                    type: 'layer', slot: spec.slot, itemId, layer,
                    currentOpacity: current.opacity ?? 1,
                    nextOpacity: next?.opacity ?? current.opacity ?? 1,
                });
                if (!check.allowed) return false;
            }
            base.apply(this, arguments);
            return true;
        };
        wrapped.__companionBoundaryAware = true;
        wrapped.__baseSetLayerColour = base;
        cs.setLayerColour = wrapped;
        return true;
    }

    function wrapEquipmentAppearance() {
        const ea = window.equipmentAppearanceSystem;
        if (!ea?.setSlotVisible || ea.setSlotVisible.__companionBoundaryAware) return false;
        const base = ea.setSlotVisible;
        const wrapped = function(entity, slot, visible) {
            if (CLOTHING_SLOTS.includes(slot)) {
                const currentlyVisible = ea.isSlotVisible?.(entity, slot) !== false;
                if (currentlyVisible !== !!visible) {
                    const check = enforce(entity, { type: 'visibility', slot, visible: !!visible });
                    if (!check.allowed) return false;
                }
            }
            base.apply(this, arguments);
            return true;
        };
        wrapped.__companionBoundaryAware = true;
        wrapped.__baseSetSlotVisible = base;
        ea.setSlotVisible = wrapped;
        return true;
    }

    function wrapInventoryActions() {
        if (typeof window.equipItem === 'function' && !window.equipItem.__companionBoundaryAware) {
            const baseEquip = window.equipItem;
            const wrappedEquip = function(itemId) {
                const entity = window.player;
                const spec = window.clothingSystem?.getItemSpec?.(itemId);
                if (entity && spec?.slot && CLOTHING_SLOTS.includes(spec.slot)) {
                    const check = enforce(entity, { type: 'equip', slot: spec.slot, itemId });
                    if (!check.allowed) return false;
                }
                return baseEquip.apply(this, arguments);
            };
            wrappedEquip.__companionBoundaryAware = true;
            wrappedEquip.__baseEquipItem = baseEquip;
            window.equipItem = wrappedEquip;
        }

        if (typeof window.unequipItem === 'function' && !window.unequipItem.__companionBoundaryAware) {
            const baseUnequip = window.unequipItem;
            const wrappedUnequip = function(slot) {
                const entity = window.player;
                if (entity && CLOTHING_SLOTS.includes(slot)) {
                    const check = enforce(entity, { type: 'unequip', slot });
                    if (!check.allowed) return false;
                }
                return baseUnequip.apply(this, arguments);
            };
            wrappedUnequip.__companionBoundaryAware = true;
            wrappedUnequip.__baseUnequipItem = baseUnequip;
            window.unequipItem = wrappedUnequip;
        }
        return true;
    }

    function installHooks() {
        wrapClothingSystem();
        wrapEquipmentAppearance();
        wrapInventoryActions();
    }

    const api = {
        build: BUILD,
        defaults: {
            relationship: { familiarity: DEFAULT_RELATIONSHIP.familiarity, trust: DEFAULT_RELATIONSHIP.trust, approval: DEFAULT_APPROVAL },
            clothingPolicy: { ...DEFAULT_POLICY },
        },
        clothingSlots: [...CLOTHING_SLOTS],
        canonicalPartyMember,
        isGovernedCompanion,
        ensureRelationship,
        getRelationship: relationshipSnapshot,
        getApproval: approvalFor,
        setRelationship,
        adjustRelationship,
        noteConversation,
        getTier: relationshipTier,
        getClothingPolicy: relationshipPolicy,
        captureClothingBaseline,
        getClothingPermission: permission,
        canUseRevealingControls,
        showBoundaryDialogue,
        withSystemOverride,
        refreshHooks: installHooks,
    };

    window.companionRelationships = api;
    window.ensureCompanionRelationship = ensureRelationship;
    window.getCompanionRelationship = relationshipSnapshot;
    window.setCompanionRelationship = setRelationship;
    window.adjustCompanionRelationship = adjustRelationship;
    window.noteCompanionConversation = noteConversation;
    window.captureCompanionClothingBaseline = captureClothingBaseline;
    window.getCompanionClothingPermission = permission;
    window.withSystemCompanionClothingOverride = withSystemOverride;

    installHooks();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHooks, { once: true });
    else installHooks();

    // clothingSystem/equipmentAppearance are dynamically injected by
    // characterCreation.js. Keep this short-lived retry so slow mobile script
    // loading cannot leave one path unguarded.
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        installHooks();
        const clothingReady = !!window.clothingSystem?.setLayerColour?.__companionBoundaryAware;
        const appearanceReady = !!window.equipmentAppearanceSystem?.setSlotVisible?.__companionBoundaryAware;
        const inventoryReady = (typeof window.equipItem !== 'function' || !!window.equipItem.__companionBoundaryAware) &&
            (typeof window.unequipItem !== 'function' || !!window.unequipItem.__companionBoundaryAware);
        if ((clothingReady && appearanceReady && inventoryReady) || attempts >= 200) clearInterval(timer);
    }, 50);

    window.COMPANION_RELATIONSHIPS_BUILD = BUILD;
})();