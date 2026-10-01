(function (root) {
'use strict';

const BUILD = '20261001-camp-deploy-v1';
const SEARCH_RADIUS = 5;
const TENT_ASSET = 'images/camp/tent_deployed.png?v=20261001-camp3';
const BEDROLL_ASSET = 'images/camp/bedroll_deployed.png?v=20261001-camp3';
const BLOCKED_TERRAIN = /\b(deep water|shallow water|water|river|lake|ocean|sea|lava|forest|foliage|rocky outcrop|mountain|rubble|pedestal|wall|palisade wall|climbable wall|keep wall|void)\b/i;
const DIRECTIONS = Object.freeze([
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
]);

let installed = false;
let hookTimer = null;
let pendingLayout = null;
let activeDeployment = null;
let tentImage = null;
let bedrollImage = null;
let imagesRequested = false;
let deploymentSerial = 0;

const key = hex => `${Number(hex?.q) || 0},${Number(hex?.r) || 0}`;
const add = (a, b) => ({ q: Number(a.q) + Number(b.q), r: Number(a.r) + Number(b.r) });
const distance = (a, b) => {
  if (!a || !b) return Infinity;
  const dq = Number(a.q) - Number(b.q);
  const dr = Number(a.r) - Number(b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
function terrainName(hex) {
  return String(root.getTerrainAt?.(hex?.q, hex?.r)?.name || 'Unknown');
}
function terrainAllowsCampObject(hex) {
  if (!hex) return false;
  if (typeof root.isHexInBounds === 'function' && !root.isHexInBounds(hex)) return false;
  return !BLOCKED_TERRAIN.test(terrainName(hex));
}
function partySet(plan) {
  return new Set(plan?.members || []);
}
function isClearHex(hex, reserved, movers) {
  if (!terrainAllowsCampObject(hex) || reserved.has(key(hex))) return false;
  if (root.tileObjects?.[key(hex)]) return false;
  const occupied = (root.entities || []).some(entity =>
    entity?.alive && entity.hex && Number(entity.hex.q) === Number(hex.q) && Number(entity.hex.r) === Number(hex.r)
      && !movers.has(entity)
  );
  return !occupied;
}
function candidateHexes(anchor, minRadius = 1, maxRadius = SEARCH_RADIUS) {
  const result = [];
  for (let dq = -maxRadius; dq <= maxRadius; dq++) {
    for (let dr = -maxRadius; dr <= maxRadius; dr++) {
      const hex = { q: Number(anchor.q) + dq, r: Number(anchor.r) + dr };
      const d = distance(anchor, hex);
      if (d < minRadius || d > maxRadius) continue;
      result.push({ hex, d });
    }
  }
  return result.sort((a, b) => a.d - b.d || a.hex.r - b.hex.r || a.hex.q - b.hex.q).map(x => x.hex);
}
function tentFootprints(origin) {
  return DIRECTIONS.map((d1, i) => {
    const d2 = DIRECTIONS[(i + 1) % DIRECTIONS.length];
    return [
      { ...origin },
      add(origin, d1),
      add(origin, d2),
      add(add(origin, d1), d2),
    ];
  });
}
function findTentPlacement(anchor, reserved, movers) {
  for (const origin of candidateHexes(anchor)) {
    for (const footprint of tentFootprints(origin)) {
      if (footprint.every(hex => isClearHex(hex, reserved, movers))) return footprint;
    }
  }
  return null;
}
function findSinglePlacement(anchor, reserved, movers, minRadius = 1) {
  return candidateHexes(anchor, minRadius).find(hex => isClearHex(hex, reserved, movers)) || null;
}
function neededDescription(plan) {
  const tents = plan?.tents?.length || 0;
  const bedrolls = plan?.bedrolls?.length || 0;
  const parts = [];
  if (tents) parts.push(`${tents} four-person tent${tents === 1 ? '' : 's'}`);
  if (bedrolls) parts.push(`${bedrolls} bedroll${bedrolls === 1 ? '' : 's'}`);
  if (plan?.fireLit) parts.push('a campfire');
  return parts.join(', ') || 'the camp';
}
function placementFailure(plan, detail) {
  return {
    ok: false,
    reason: `There isn't enough clear ground nearby to set up ${neededDescription(plan)}${detail ? ` (${detail})` : ''}. Move away from trees, rocky ground, water, buildings or other obstacles.`,
  };
}
function buildDeploymentLayout(plan) {
  if (!plan?.ok) return { ok: false, reason: plan?.reason || 'Camp plan is unavailable.' };
  if (plan.site?.indoor) return { ok: true, indoor: true, tents: [], bedrolls: [], fire: null, reserved: [] };

  const anchor = plan.anchorHex || root.player?.hex || { q: 0, r: 0 };
  const reserved = new Set([key(anchor)]);
  const movers = partySet(plan);
  const tents = [];

  for (let i = 0; i < (plan.tents || []).length; i++) {
    const footprint = findTentPlacement(anchor, reserved, movers);
    if (!footprint) return placementFailure(plan, 'no clear four-hex tent footprint');
    footprint.forEach(hex => reserved.add(key(hex)));
    const occupants = [...(plan.tents[i].occupants || [])];
    const slots = new Map();
    occupants.forEach((member, index) => slots.set(member, footprint[index % footprint.length]));
    tents.push({ footprint, occupants, slots, reluctant: !!plan.tents[i].reluctant });
  }

  let fire = null;
  if (plan.fireLit) {
    fire = findSinglePlacement(anchor, reserved, movers, 1);
    if (!fire) return placementFailure(plan, 'no clear hex for the fire');
    reserved.add(key(fire));
  }

  const bedrolls = [];
  for (const member of (plan.bedrolls || [])) {
    const tent = tents.find(t => t.occupants.includes(member));
    let hex = tent?.slots.get(member) || null;
    let sheltered = !!hex;
    if (!hex) {
      hex = findSinglePlacement(anchor, reserved, movers, 1);
      if (!hex) return placementFailure(plan, `no clear hex for ${member?.name || 'a sleeper'}'s bedroll`);
      reserved.add(key(hex));
      sheltered = false;
    }
    bedrolls.push({ member, hex: { ...hex }, sheltered });
  }

  return {
    ok: true,
    indoor: false,
    anchor: { ...anchor },
    tents,
    bedrolls,
    fire: fire ? { ...fire } : null,
    reserved: [...reserved],
  };
}
function removeDeployment() {
  if (!activeDeployment) return;
  for (const tileKey of activeDeployment.tileObjectKeys || []) {
    const object = root.tileObjects?.[tileKey];
    if (object?._campDeploymentId === activeDeployment.id) delete root.tileObjects[tileKey];
  }
  activeDeployment = null;
  root.invalidateTileLightsCache?.();
  root.invalidateVisibilityCache?.();
  root.drawMap?.();
  if (typeof root.renderEntities === 'function') root.renderEntities();
}
function deployLayout(layout, campPlan) {
  if (!layout?.ok || layout.indoor || activeDeployment) return;
  const id = `camp-${Date.now()}-${++deploymentSerial}`;
  const tileObjectKeys = [];
  if (layout.fire) {
    const fireKey = key(layout.fire);
    root.tileObjects = root.tileObjects || {};
    root.tileObjects[fireKey] = {
      type: 'fireplace',
      lightRadius: 8,
      lit: true,
      _campDeploymentId: id,
      _temporaryCampObject: true,
    };
    tileObjectKeys.push(fireKey);
  }
  activeDeployment = { id, layout, campPlan, tileObjectKeys };
  root.invalidateTileLightsCache?.();
  root.invalidateVisibilityCache?.();
  root.drawMap?.();
  if (typeof root.renderEntities === 'function') root.renderEntities();
}
function visible(hex) {
  if (typeof root.isVisibleToPlayer !== 'function') return true;
  try { return !!root.isVisibleToPlayer(hex); } catch (_) { return true; }
}
function imageCentre(cells) {
  const pixels = cells.map(hex => root.hexToPixel?.(hex.q, hex.r)).filter(Boolean);
  if (!pixels.length) return null;
  return {
    x: pixels.reduce((sum, p) => sum + p.x, 0) / pixels.length,
    y: pixels.reduce((sum, p) => sum + p.y, 0) / pixels.length,
  };
}
function drawCampVisuals() {
  if (!activeDeployment || !root.mapCtx || !root.hexToPixel) return;
  const { layout } = activeDeployment;
  const z = Number(root.cameraZoom) || 1;
  const hs = Number(root.hexSize) || 30;
  const ctx = root.mapCtx;

  // Bedding first so sheltered bedrolls sit visually inside/under the tent.
  if (bedrollImage?.complete) {
    for (const bedroll of layout.bedrolls) {
      if (!visible(bedroll.hex)) continue;
      const p = root.hexToPixel(bedroll.hex.q, bedroll.hex.r);
      const width = hs * 1.25 * z;
      const height = width * (bedrollImage.naturalHeight || 1) / Math.max(1, bedrollImage.naturalWidth || 1);
      ctx.drawImage(bedrollImage, p.x - width / 2, p.y - height / 2, width, height);
    }
  }

  if (tentImage?.complete) {
    for (const tent of layout.tents) {
      if (!tent.footprint.some(visible)) continue;
      const centre = imageCentre(tent.footprint);
      if (!centre) continue;
      // Four-person tents reserve four hexes and deliberately spill across them.
      const width = hs * 3.2 * z;
      const height = width * (tentImage.naturalHeight || 1) / Math.max(1, tentImage.naturalWidth || 1);
      ctx.drawImage(tentImage, centre.x - width / 2, centre.y - height * 0.62, width, height);
    }
  }
}
function loadImages() {
  if (imagesRequested || !root.assetManager?.request) return;
  imagesRequested = true;
  tentImage = root.assetManager.request(TENT_ASSET);
  bedrollImage = root.assetManager.request(BEDROLL_ASSET);
  for (const src of [TENT_ASSET, BEDROLL_ASSET]) {
    root.assetManager.whenReady?.(src).then(() => {
      root.drawMap?.();
      root.renderEntities?.();
    }).catch(() => {});
  }
}
function installRenderHook() {
  if (typeof root.renderEntities !== 'function' || root.renderEntities._campDeployment) return false;
  const base = root.renderEntities;
  const wrapped = function (...args) {
    drawCampVisuals();
    return base.apply(this, args);
  };
  wrapped._campDeployment = true;
  wrapped._baseRenderEntities = base;
  root.renderEntities = wrapped;
  return true;
}
function freshOutdoorCampPlan() {
  if (!root.campSystem?.buildPlan || root.isSleeping || root._resumeSleepAfterCombat) return null;
  if (root.campSystem.getCamp?.()) return null;
  const plan = root.campSystem.buildPlan();
  if (!plan?.ok || plan.site?.indoor) return null;
  return plan;
}
function installSleepHook() {
  if (typeof root.toggleSleep !== 'function' || !root.toggleSleep._campSystem || root.toggleSleep._campDeployment) return false;
  const base = root.toggleSleep;
  const wrapped = function (...args) {
    const preflightPlan = freshOutdoorCampPlan();
    if (preflightPlan) {
      const layout = buildDeploymentLayout(preflightPlan);
      if (!layout.ok) {
        root.showMessage?.(layout.reason);
        return false;
      }
      pendingLayout = layout;
    }

    const result = base.apply(this, args);
    const currentCamp = root.campSystem?.getCamp?.();
    if (pendingLayout && currentCamp && !currentCamp.site?.indoor) {
      currentCamp._deploymentLayout = pendingLayout;
      if (root.isSleeping) deployLayout(pendingLayout, currentCamp);
    } else if (!currentCamp && !root.isSleeping) {
      pendingLayout = null;
    }
    return result;
  };
  wrapped._campSystem = true; // keep campSystem's 500 ms hook installer from wrapping us again
  wrapped._campDeployment = true;
  wrapped._baseToggleSleep = base;
  root.toggleSleep = wrapped;
  return true;
}
function tick() {
  installSleepHook();
  installRenderHook();
  loadImages();

  const currentCamp = root.campSystem?.getCamp?.() || null;
  if (pendingLayout && currentCamp && !currentCamp.site?.indoor) {
    currentCamp._deploymentLayout = pendingLayout;
    if (root.isSleeping && !activeDeployment) deployLayout(pendingLayout, currentCamp);
  }
  if (!currentCamp && activeDeployment) removeDeployment();
  if (!currentCamp && !root.isSleeping) pendingLayout = null;
}
function install() {
  if (installed) return;
  installed = true;
  root.campDeploymentSystem = {
    build: BUILD,
    buildDeploymentLayout,
    terrainAllowsCampObject,
    tentFootprints,
    drawCampVisuals,
    getActiveDeployment: () => activeDeployment,
    clear: removeDeployment,
    refreshHooks: tick,
  };
  tick();
  hookTimer = root.setInterval?.(tick, 250) || null;
}

if (root.document) {
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BUILD, buildDeploymentLayout, terrainAllowsCampObject, tentFootprints, neededDescription, deployLayout, removeDeployment, drawCampVisuals };
}
})(typeof window !== 'undefined' ? window : globalThis);
