// contentSafety.js
// Device-local content presentation policy and one-time atomic humanoid-frame gate.
// Safe-mode coverage is visual only: it never equips, unequips, adds, removes,
// or saves fallback garments on the real entity.
(() => {
  'use strict';

  const BUILD = '20261001-content-safety-v3-latched';
  const STORAGE_KEY = 'rpg_adult_content_enabled';
  const COVERAGE_EPSILON = 0.02;
  const BASE_COVERAGE_SLOTS = ['underwear', 'bra', 'pants', 'shirt'];
  const watchedAssetSources = new Set();
  const watchedImages = new WeakSet();
  const planCache = new WeakMap();
  const latchedGeneration = new WeakMap();
  const pendingCharacters = new Map();
  let safetyGeneration = 1;
  let portraitObserver = null;
  let installedStyle = false;
  let preloadSource = null;
  let preloadCache = BASE_COVERAGE_SLOTS;
  let retryQueued = false;

  function storedAdultPreference() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored !== 'false';
  }

  window.adultContentEnabled = storedAdultPreference();

  function isAdultContentEnabled() {
    return window.adultContentEnabled !== false;
  }

  function syncModeClass() {
    document.body?.classList.toggle('content-safety-safe', !isAdultContentEnabled());
  }

  function invalidateCaches() {
    safetyGeneration++;
    pendingCharacters.clear();
  }

  function requestRedraw() {
    window.invalidateTurnIndicatorCache?.();
    window.drawMap?.();
    window.renderEntities?.();
    window.refreshDirectionalTurnPortraits?.();
    window.updateAppearancePreview?.();
    queueMicrotask(syncPortraitSafety);
  }

  function setAdultContentEnabled(enabled) {
    window.adultContentEnabled = !!enabled;
    localStorage.setItem(STORAGE_KEY, window.adultContentEnabled ? 'true' : 'false');
    invalidateCaches();
    syncModeClass();
    syncSettingsUI();
    if (!isAdultContentEnabled()) {
      document.querySelectorAll?.('canvas[data-direct-humanoid-canvas="true"]')
        .forEach(canvas => canvas.classList.remove('content-safety-frame-ready'));
    }
    installAll();
    window.dispatchEvent?.(new CustomEvent('contentmodechange', {
      detail: { adultContentEnabled: window.adultContentEnabled }
    }));
    requestRedraw();
  }

  window.setAdultContentEnabled = setAdultContentEnabled;
  window.isAdultContentEnabled = isAdultContentEnabled;

  function injectSettingsUI() {
    const settings = document.getElementById('settings-content');
    if (!settings || document.getElementById('adult-content-toggle')) return !!settings;

    const section = document.createElement('div');
    section.id = 'content-safety-settings';
    section.innerHTML = `
      <h3>Content</h3>
      <div class="form-group">
        <label><input type="checkbox" id="adult-content-toggle"> 18+ content</label>
        <small style="color:#aaa;display:block;margin-top:3px;">On by default. Turn off to enforce visible underwear and outer clothing without changing equipped items.</small>
      </div>`;

    const headings = Array.from(settings.querySelectorAll('h3'));
    const saveHeading = headings.find(h => h.textContent.trim() === 'Save Code');
    if (saveHeading) settings.insertBefore(section, saveHeading);
    else settings.appendChild(section);

    const toggle = document.getElementById('adult-content-toggle');
    toggle?.addEventListener('change', () => setAdultContentEnabled(toggle.checked));
    syncSettingsUI();
    return true;
  }

  function syncSettingsUI() {
    const toggle = document.getElementById('adult-content-toggle');
    if (toggle) toggle.checked = isAdultContentEnabled();
  }

  window.syncContentSafetySettingsUI = syncSettingsUI;

  function installPortraitStyle() {
    if (installedStyle) return;
    installedStyle = true;
    const style = document.createElement('style');
    style.id = 'content-safety-atomic-portrait-style';
    style.textContent = `
      body.content-safety-safe #turn-indicator-bar canvas[data-direct-humanoid-canvas="true"]:not(.content-safety-frame-ready) {
        visibility: hidden !important;
      }
      body.content-safety-safe #appearance-preview-canvas.content-safety-frame-pending {
        visibility: hidden !important;
      }`;
    document.head.appendChild(style);
  }

  function viewForFacing(facing) {
    if (facing === 'up' || facing === 'back') return 'back';
    if (facing === 'left' || facing === 'right' || facing === 'side') return 'side';
    return 'front';
  }

  function imageReady(image) {
    return !!image && ((image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
      || (image.width > 0 && image.height > 0));
  }

  function queuePendingRetry() {
    if (retryQueued || !pendingCharacters.size) return;
    retryQueued = true;
    queueMicrotask(() => {
      retryQueued = false;
      retryPendingCharacters();
    });
  }

  function watchImage(image) {
    if (!image || imageReady(image) || watchedImages.has(image)) return image;
    watchedImages.add(image);
    const done = () => queuePendingRetry();
    image.addEventListener?.('load', done, { once:true });
    image.addEventListener?.('error', done, { once:true });
    return image;
  }

  function watchAsset(src) {
    if (!src || !window.assetManager) return null;
    const image = window.assetManager.request(src);
    watchImage(image);
    if (!watchedAssetSources.has(src)) {
      watchedAssetSources.add(src);
      window.assetManager.whenReady(src).then(() => {
        queuePendingRetry();
      }).catch(() => {
        // Asset manager owns retries and in-game failure diagnostics. Keep the
        // character gated rather than expose an incomplete PG frame.
      });
    }
    return image;
  }

  function layerSource(layer, view) {
    const resolved = viewForFacing(view);
    if (layer?.views?.[resolved]) return layer.views[resolved];
    if (resolved === 'side') return layer?.views?.front || layer?.views?.back || null;
    return layer?.views?.front || null;
  }

  function slotVisible(entity, slot) {
    if (!entity || entity.displayClothes === false) return false;
    return window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) !== false;
  }

  function specFor(itemId) {
    if (!itemId) return null;
    return window.clothingSystem?.getItemSpec?.(window.getEquipmentBaseId?.(itemId) || itemId) || null;
  }

  function coverageLayer(spec) {
    if (!spec?.layers?.length) return null;
    return spec.layers.find(layer => layer.id === 'base')
      || spec.layers.find(layer => layer.id === 'dark')
      || spec.layers[0];
  }

  function coverageOpacity(entity, itemId, spec) {
    const layer = coverageLayer(spec);
    if (!layer) return 0;
    const colour = window.clothingSystem?.getLayerColour?.(entity, itemId, layer);
    return Number(colour?.opacity ?? layer.defaultColor?.opacity ?? 1);
  }

  function visibleCoverageGarment(entity, slot, itemId) {
    if (!itemId || !slotVisible(entity, slot)) return false;
    const spec = specFor(itemId);
    return !!spec && coverageOpacity(entity, itemId, spec) > COVERAGE_EPSILON;
  }

  function fullBodyOuterGarment(itemId) {
    const spec = specFor(itemId);
    if (!spec) return false;
    const item = window.items?.[window.getEquipmentBaseId?.(itemId) || itemId];
    return spec.slot === 'shirt' && (spec.fitMode === 'dressSplit' || item?.clothingCoverage === 'full');
  }

  function planSignature(entity) {
    const equipped = entity?.equipped || {};
    const visibility = entity?.equipmentVisibility || {};
    const parts = ['safe', entity?.gender || '', entity?.displayClothes === false ? 'hide' : 'show'];
    for (const slot of BASE_COVERAGE_SLOTS) {
      const id = equipped[slot];
      parts.push(`${slot}:${id || '-'}:${visibility[slot] === false ? 0 : 1}`);
      parts.push(`${slot}Covered:${visibleCoverageGarment(entity, slot, id) ? 1 : 0}`);
    }
    return parts.join('|');
  }

  function resolveCoveragePlan(entity) {
    if (isAdultContentEnabled()) {
      return { items:entity?.equipped || {}, forceOpaque:new Set(), forceVisible:new Set(), signature:'adult' };
    }

    const signature = planSignature(entity);
    const cached = planCache.get(entity);
    if (cached?.signature === signature) return cached.plan;

    const equipped = entity?.equipped || {};
    const items = Object.fromEntries(BASE_COVERAGE_SLOTS.map(slot => [slot, equipped[slot] || null]));
    const forceOpaque = new Set();
    const forceVisible = new Set();
    const female = entity?.gender === 'female';

    if (!visibleCoverageGarment(entity, 'underwear', items.underwear)) {
      items.underwear = 'underwear_briefs';
      forceOpaque.add('underwear');
      forceVisible.add('underwear');
    }
    if (female && !visibleCoverageGarment(entity, 'bra', items.bra)) {
      items.bra = 'underwear_bra';
      forceOpaque.add('bra');
      forceVisible.add('bra');
    }

    const shirtVisible = visibleCoverageGarment(entity, 'shirt', items.shirt);
    const dressCoversAll = shirtVisible && fullBodyOuterGarment(items.shirt);
    const pantsVisible = visibleCoverageGarment(entity, 'pants', items.pants);

    if (female) {
      if (!dressCoversAll) {
        if (!shirtVisible) {
          items.shirt = 'top_shirt_f';
          forceOpaque.add('shirt');
          forceVisible.add('shirt');
        }
        if (!pantsVisible) {
          items.pants = 'pants_trousers';
          forceOpaque.add('pants');
          forceVisible.add('pants');
        }
      }
    } else if (!dressCoversAll && !pantsVisible) {
      // Male safe presentation deliberately permits a bare chest.
      items.pants = 'pants_trousers';
      forceOpaque.add('pants');
      forceVisible.add('pants');
    }

    const plan = { items, forceOpaque, forceVisible, signature };
    planCache.set(entity, { signature, plan });
    return plan;
  }

  function cloneForSafeSlot(entity, slot, itemId, forceOpaque) {
    const proxy = Object.create(entity || null);
    proxy.__contentSafetyRenderProxy = true;
    proxy.clothingDefaultsApplied = true;
    proxy.displayClothes = true;
    proxy.equipped = { ...(entity?.equipped || {}), [slot]: itemId };
    proxy.equipmentVisibility = { ...(entity?.equipmentVisibility || {}), [slot]: true };
    proxy.clothingColors = { ...(entity?.clothingColors || {}) };

    if (forceOpaque && itemId) {
      const spec = specFor(itemId);
      const original = entity?.clothingColors?.[itemId] || {};
      const copy = { ...original };
      for (const layer of spec?.layers || []) {
        copy[layer.id] = { ...(original[layer.id] || layer.defaultColor || {}), opacity: 1 };
      }
      proxy.clothingColors[itemId] = copy;
    }
    return proxy;
  }

  function installSafeClothingDraw() {
    const system = window.clothingSystem;
    const current = system?.drawSlot;
    if (!system || typeof current !== 'function') return false;
    if (current.__contentSafetyDraw) return true;

    const wrapped = function contentSafetyDrawSlot(ctx, entity, slot, view, bounds) {
      if (isAdultContentEnabled() || entity?.__contentSafetyRenderProxy || !BASE_COVERAGE_SLOTS.includes(slot)) {
        return current.apply(this, arguments);
      }
      const plan = resolveCoveragePlan(entity);
      const plannedItem = plan.items[slot];
      if (!plannedItem) return current.apply(this, arguments);
      const mustForce = plan.forceOpaque.has(slot) || plan.forceVisible.has(slot);
      if (!mustForce && plannedItem === entity?.equipped?.[slot]) return current.apply(this, arguments);
      const proxy = cloneForSafeSlot(entity, slot, plannedItem, plan.forceOpaque.has(slot));
      return current.call(this, ctx, proxy, slot, view, bounds);
    };
    wrapped.__contentSafetyDraw = true;
    wrapped.__contentSafetyPrevious = current;
    system.drawSlot = wrapped;
    return true;
  }

  function preloadSlots() {
    const source = window.clothingSystem?.preloadSlots;
    if (source === preloadSource) return preloadCache;
    preloadSource = source;
    preloadCache = Array.from(new Set(source || BASE_COVERAGE_SLOTS));
    return preloadCache;
  }

  function clothingFrameReady(entity, view) {
    const system = window.clothingSystem;
    if (!system) return false;
    system.migrateLegacyEquipment?.(entity);
    system.ensureDefaultOutfit?.(entity, { player: entity?.side === 'player' });

    const plan = resolveCoveragePlan(entity);
    let ready = true;
    for (const slot of preloadSlots()) {
      const planned = plan.items?.[slot];
      const itemId = planned !== undefined ? planned : entity?.equipped?.[slot];
      if (!itemId) continue;
      const forced = !!plan.forceVisible?.has(slot);
      if (!forced && !slotVisible(entity, slot)) continue;
      const spec = specFor(itemId);
      if (!spec) continue;
      for (const layer of spec.layers || []) {
        const src = layerSource(layer, view);
        if (!src) continue;
        if (!imageReady(watchAsset(src))) ready = false;
      }
    }
    return ready;
  }

  function equipmentFrameReady(entity, view) {
    const visible = slot => window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) !== false;
    if (entity?.displayArmour !== false && entity?.equipped?.armor && visible('armor')) {
      const item = window.items?.[entity.equipped.armor];
      const reduction = Number(item?.reduction || 0);
      const tier = reduction >= 3 ? 'heavy' : reduction >= 2 ? 'medium' : 'light';
      const authored = view === 'back'
        ? window.ARMOUR_VISUAL_ASSETS?.[tier]?.back
        : window.ARMOUR_VISUAL_ASSETS?.[tier]?.front;
      const legacy = tier === 'heavy' ? window.gameVisuals?.humanHeavy
        : tier === 'medium' ? window.gameVisuals?.humanMedium : window.gameVisuals?.humanLight;
      if (!imageReady(authored) && !imageReady(legacy)) {
        watchImage(authored);
        watchImage(legacy);
        return false;
      }
    }

    if (entity?.equipped?.helmet && visible('helmet')) {
      const front = window.gameVisuals?.nasal_helm;
      const rear = window.REAR_HUMAN_EQUIPMENT_ASSETS?.helmet;
      if (view === 'back') {
        if (!imageReady(rear) && !imageReady(front)) {
          watchImage(rear);
          watchImage(front);
          return false;
        }
      } else if (!imageReady(front)) {
        watchImage(front);
        return false;
      }
    }
    return true;
  }

  function bodyAndHairReady(entity, facing) {
    const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    const assets = window.DIRECTIONAL_CHARACTER_ASSETS?.[key];
    if (!assets) return true;
    const view = viewForFacing(facing);
    const bodyType = entity.bodyType || 'average';
    const body = (assets.body?.[bodyType] || assets.body?.average)?.[view];
    if (!imageReady(body)) {
      watchImage(body);
      return false;
    }

    const hasVisibleHelmet = !!entity?.equipped?.helmet
      && window.equipmentAppearanceSystem?.isSlotVisible?.(entity, 'helmet') !== false;
    if (!hasVisibleHelmet) {
      const hairStyle = entity.hairStyle || 'brown_1';
      const hairSet = assets.hair?.[hairStyle] || assets.hair?.brown_1;
      const hair = hairSet?.[view] || assets.hair?.brown_1?.[view];
      if (hair && !imageReady(hair)) {
        watchImage(hair);
        return false;
      }
    }
    return true;
  }

  function scanCharacterOnce(entity) {
    // Load and validate all directional views in this single character-level
    // pass. Once this succeeds the character is permanently latched ready for
    // the current content-mode generation; facing changes do not re-scan it.
    for (const facing of ['down', 'left', 'up']) {
      const view = viewForFacing(facing);
      const ready = bodyAndHairReady(entity, facing)
        && clothingFrameReady(entity, view)
        && equipmentFrameReady(entity, view);
      if (!ready) return false;
    }
    return true;
  }

  function markCharacterReady(entity) {
    latchedGeneration.set(entity, safetyGeneration);
    pendingCharacters.delete(entity);
  }

  function retryPendingCharacters() {
    if (isAdultContentEnabled() || !pendingCharacters.size) return;
    let becameReady = false;
    for (const [entity, generation] of [...pendingCharacters]) {
      if (generation !== safetyGeneration) {
        pendingCharacters.delete(entity);
        continue;
      }
      if (!scanCharacterOnce(entity)) continue;
      markCharacterReady(entity);
      becameReady = true;
    }
    if (becameReady) requestRedraw();
  }

  function isHumanoidFrameReady(entity, facing = 'down') {
    if (!entity) return false;
    if (isAdultContentEnabled()) return true;
    const key = entity.race && entity.gender ? `${entity.race}_${entity.gender}` : '';
    if (!window.DIRECT_HUMANOID_RIGS?.[key]) return true;

    if (latchedGeneration.get(entity) === safetyGeneration) return true;
    if (pendingCharacters.get(entity) === safetyGeneration) return false;

    // This is the only synchronous readiness scan for this character. If an
    // asset is still loading, image load events drive the next attempt.
    pendingCharacters.set(entity, safetyGeneration);
    if (!scanCharacterOnce(entity)) return false;
    markCharacterReady(entity);
    return true;
  }

  function installAtomicMapWrapper() {
    if (!window.__humanoidRendererInstalled) return false;
    const current = window.drawPlayerCharacter;
    if (typeof current !== 'function') return false;
    if (current.__contentSafetyAtomicFrame) return true;

    const wrapped = function atomicHumanoidFrame(ctx, entity, x, y, z, flyOff) {
      if (!isAdultContentEnabled()) {
        const key = entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
        if (window.DIRECT_HUMANOID_RIGS?.[key]) {
          const facing = entity?.facing || 'down';
          if (!isHumanoidFrameReady(entity, facing)) return;
        }
      }
      return current.apply(this, arguments);
    };
    wrapped.__contentSafetyAtomicFrame = true;
    wrapped.__contentSafetyPrevious = current;
    window.drawPlayerCharacter = wrapped;
    return true;
  }

  function installAtomicExternalWrappers() {
    for (const name of ['drawDirectionalHumanoidInBounds', 'drawDirectionalCharacterBase', 'drawHumanFemaleDirectionalBase']) {
      const current = window[name];
      if (typeof current !== 'function' || current.__contentSafetyAtomicFrame) continue;
      const wrapped = function(ctx, entity, bounds, facing = 'down') {
        if (!isAdultContentEnabled() && !isHumanoidFrameReady(entity, facing)) return true;
        return current.apply(this, arguments);
      };
      wrapped.__contentSafetyAtomicFrame = true;
      wrapped.__contentSafetyPrevious = current;
      window[name] = wrapped;
    }
  }

  function makeCreatorProbe() {
    const race = document.getElementById('race-select')?.value;
    const gender = document.getElementById('gender-select')?.value;
    if (!race || !gender) return null;
    const probe = {
      race, gender, side:'player', facing:'down',
      bodyType:document.getElementById('body-type-select')?.value || 'average',
      hairStyle:document.getElementById('hair-style-select')?.value || 'brown_1',
      equipped:{}, clothingColors:{}, equipmentVisibility:{},
      displayArmour:true, displayClothes:true
    };
    window.clothingSystem?.ensureDefaultOutfit?.(probe, { player:true });
    return probe;
  }

  function installAtomicCreatorWrapper() {
    const current = window.updateAppearancePreview;
    if (typeof current !== 'function' || !current.__directHumanoidPreview) return false;
    if (current.__contentSafetyAtomicFrame) return true;

    const wrapped = function atomicAppearancePreview() {
      const canvas = document.getElementById('appearance-preview-canvas');
      if (!isAdultContentEnabled()) {
        const probe = makeCreatorProbe();
        if (probe && !isHumanoidFrameReady(probe, 'down')) {
          canvas?.classList.add('content-safety-frame-pending');
          return;
        }
      }
      const result = current.apply(this, arguments);
      canvas?.classList.remove('content-safety-frame-pending');
      return result;
    };
    wrapped.__contentSafetyAtomicFrame = true;
    wrapped.__directHumanoidPreview = true;
    wrapped.__contentSafetyPrevious = current;
    window.updateAppearancePreview = wrapped;
    return true;
  }

  function visibleTurnEntities() {
    const list = [...(window.entities || [])]
      .filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
    if (window.isInCombat) list.sort((a, b) => b.timePoints - a.timePoints);
    return list;
  }

  function syncPortraitSafety() {
    const bar = document.getElementById('turn-indicator-bar');
    if (!bar) return;
    const cards = [...bar.querySelectorAll('.turn-indicator-item')];
    if (isAdultContentEnabled()) {
      for (const card of cards) {
        card.querySelector('canvas[data-direct-humanoid-canvas="true"]')?.classList.add('content-safety-frame-ready');
      }
      return;
    }

    const entities = visibleTurnEntities();
    cards.forEach((card, index) => {
      const canvas = card.querySelector('canvas[data-direct-humanoid-canvas="true"]');
      if (!canvas) return;
      const entity = entities[index];
      canvas.classList.toggle('content-safety-frame-ready', !!entity && isHumanoidFrameReady(entity, 'down'));
    });
  }

  function installPortraitObserver() {
    const bar = document.getElementById('turn-indicator-bar');
    if (!bar) return false;
    if (isAdultContentEnabled()) {
      portraitObserver?.disconnect();
      portraitObserver = null;
      syncPortraitSafety();
      return true;
    }
    if (!portraitObserver) {
      portraitObserver = new MutationObserver(() => queueMicrotask(syncPortraitSafety));
      portraitObserver.observe(bar, { childList:true, subtree:true });
    }
    syncPortraitSafety();
    return true;
  }

  function installAll() {
    syncModeClass();
    injectSettingsUI();
    installPortraitStyle();
    installSafeClothingDraw();
    installAtomicMapWrapper();
    installAtomicExternalWrappers();
    installAtomicCreatorWrapper();
    installPortraitObserver();
  }

  window.contentSafetySystem = {
    build: BUILD,
    storageKey: STORAGE_KEY,
    isAdultContentEnabled,
    setAdultContentEnabled,
    resolveCoveragePlan,
    isHumanoidFrameReady,
    syncSettingsUI,
    syncPortraitSafety,
    retryPendingCharacters,
  };

  installAll();
  [50, 150, 500, 1500, 5000].forEach(delay => setTimeout(installAll, delay));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAll, { once:true });
  }
  window.addEventListener?.('load', () => setTimeout(installAll, 0), { once:true });
})();
