// entityRenderInstrumentation.js
// Four-direction humanoid composite cache + deterministic post-construction art gate.
(() => {
'use strict';
if (window.__entityRenderInstrumentationInstalled) return;
window.__entityRenderInstrumentationInstalled = true;

const DIRECTIONS = ['down', 'up', 'left', 'right'];
const cache = new WeakMap();
let ready = false;
let gateRunning = false;

const stats = window.entityRenderInstrumentationStats = {
  installed: false, prebuildEntities: 0, prebuildViews: 0, prebuildFailures: 0,
  cacheReadyEntities: 0, cacheReadyViews: 0, manifestEntities: 0,
  manifestPaths: 0, postStartFailures: 0, rosterStableEntities: 0,
  rosterWaitMs: 0, loadRebuilds: 0
};

function publish(value) {
  ready = !!value;
  const scheduler = window.__assetLoadScheduler;
  if (scheduler) {
    try { Object.defineProperty(scheduler, 'compositeCacheReady', { configurable: true, get: () => ready }); } catch (_) {}
  }
}
publish(false);

function campaignEntities() {
  const entities = [...(window.entities || [])];
  if (window.player && !entities.includes(window.player)) entities.push(window.player);
  return entities;
}
function humanoids() { return campaignEntities().filter(e => e?.race && e?.gender && !e.customImage); }
function facing(e) { return DIRECTIONS.includes(e?.facing) ? e.facing : 'down'; }
function appearanceKey(e, z, fly) {
  let equipped = '', colors = '';
  try { equipped = JSON.stringify(e.equipped || {}); } catch (_) {}
  try { colors = JSON.stringify(e.clothingColors || {}); } catch (_) {}
  return [e.race, e.gender, e.bodyType, e.hairStyle, e.facialHairStyle, e.hairHue, e.skinHue,
    e.displayArmour === false ? 0 : 1, e.displayClothes === false ? 0 : 1,
    equipped, colors, Number(z || 1).toFixed(3), Number(fly || 0).toFixed(3), Number(window.hexSize || 30).toFixed(2)].join('|');
}
function bucket(e, z, fly) {
  const key = appearanceKey(e, z, fly);
  let b = cache.get(e);
  if (!b || b.key !== key) { b = { key, views: new Map() }; cache.set(e, b); }
  return b;
}
function build(original, e, z, fly) {
  const hs = Math.max(1, Number(window.hexSize || 30));
  const scale = Math.max(.1, Number(z || 1));
  const size = Math.max(128, Math.ceil(hs * scale * 8));
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const cx = size / 2, cy = size / 2;
  original(ctx, e, cx, cy, z, fly);
  return { canvas, cx, cy };
}
function installDraw() {
  const current = window.drawPlayerCharacter;
  if (typeof current !== 'function') return false;
  if (current.__fourDirectionHumanoidCompositeCache) return true;
  const wrapped = function(ctx, e, ...rest) {
    const x = rest[0], y = rest[1], z = rest[2] ?? 1, fly = rest[3] ?? 0;
    const isHumanoid = e?.race && e?.gender && !e.customImage && !window.isInCombat;
    if (!isHumanoid || !ready || !ctx) return current.call(this, ctx, e, ...rest);
    const b = bucket(e, z, fly), f = facing(e);
    let made = b.views.get(f);
    if (!made) {
      try { made = build(current, e, z, fly); if (made) b.views.set(f, made); } catch (_) {}
    }
    if (made) { ctx.drawImage(made.canvas, x - made.cx, y - made.cy); return; }
    return current.call(this, ctx, e, ...rest);
  };
  wrapped.__fourDirectionHumanoidCompositeCache = true;
  wrapped.__original = current;
  window.drawPlayerCharacter = wrapped;
  try { (0, eval)('drawPlayerCharacter = window.drawPlayerCharacter'); } catch (_) {}
  stats.installed = true;
  return true;
}

function add(set, path) {
  if (typeof path !== 'string') return;
  const clean = path.replace(/^\.\//, '').split('?')[0];
  if (clean.startsWith('images/')) set.add(window.assetManager?.canonicalPathFor?.(clean) || clean);
}
function viewPaths(obj, set) { if (obj) ['front', 'side', 'back'].forEach(v => add(set, obj[v])); }
function entityAssets(e, set) {
  if (!e) return;
  if (e.race && e.gender && !e.customImage) {
    const key = `${e.race}_${e.gender}`;
    const body = e.bodyType === 'broad' ? 'body_broad' : 'body';
    ['front', 'side', 'back'].forEach(v => add(set, `images/characters/${key}/${body}_${v}.png`));
    const hair = e.hairStyle || 'brown_1';
    ['front', 'side', 'back'].forEach(v => add(set, `images/characters/hair/hair_${hair}_${v}.png`));
    for (const p of window.clothingSystem?.resolveOutfitAssetPaths?.(e, ['front', 'side', 'back']) || []) add(set, p);
  }
  add(set, e.image); add(set, e.sprite);
  for (const id of Object.values(e.equipped || {})) {
    if (typeof id !== 'string') continue;
    const item = window.items?.[id];
    if (!item) continue;
    viewPaths(item.clothingViews, set);
    for (const layer of item.clothingLayers || []) viewPaths(layer.views, set);
    add(set, item.image); add(set, item.sprite);
  }
}
function campaignManifest() {
  const set = new Set(), entities = campaignEntities();
  entities.forEach(e => entityAssets(e, set));
  stats.manifestEntities = entities.length;
  stats.manifestPaths = set.size;
  return [...set];
}

function overlay() {
  let el = document.getElementById('hex-post-start-asset-gate');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'hex-post-start-asset-gate';
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111;display:none;align-items:center;justify-content:center;color:#f4ead2;font-family:Georgia,serif;padding:18px;box-sizing:border-box';
  el.innerHTML = '<div style="width:min(620px,94vw);padding:22px;border:1px solid #8f7445;border-radius:10px;background:#201d19;text-align:center"><h2 data-title>Preparing campaign…</h2><p data-count>Constructing campaign…</p><div style="height:12px;border-radius:999px;overflow:hidden;background:#0d0c0a;border:1px solid #5f5037"><div data-bar style="height:100%;width:4%;background:#b89a5c"></div></div><p data-detail style="font:12px sans-serif;color:#d7c9aa"></p><button data-start hidden style="padding:11px 22px;background:#2e7d32;color:white;font-weight:bold">Start game</button></div>';
  document.body.appendChild(el);
  return el;
}
function showProgress(el, title, text, done, total, detail = '') {
  el.querySelector('[data-title]').textContent = title;
  el.querySelector('[data-count]').textContent = text;
  el.querySelector('[data-bar]').style.width = `${total ? Math.max(4, Math.round(done * 100 / total)) : 4}%`;
  el.querySelector('[data-detail]').textContent = detail;
}
async function loadManifest(el, paths) {
  let done = 0; const failed = [];
  showProgress(el, 'Loading campaign art…', `Loaded 0 / ${paths.length} required campaign art assets`, 0, paths.length);
  for (const path of paths) {
    try { await window.assetManager.load(path, { priority: -100, immediate: true }); }
    catch (err) { failed.push(path); }
    done++;
    showProgress(el, 'Loading campaign art…', `Loaded ${done} / ${paths.length} required campaign art assets`, done, paths.length, path);
  }
  return failed;
}
async function prebuildComposites(el) {
  installDraw();
  const original = window.drawPlayerCharacter?.__original;
  const entities = humanoids();
  stats.prebuildEntities = entities.length;
  stats.prebuildViews = 0; stats.prebuildFailures = 0;
  if (typeof original !== 'function') return;
  const total = entities.length * DIRECTIONS.length;
  let done = 0;
  for (const e of entities) {
    const old = e.facing;
    for (const f of DIRECTIONS) {
      try {
        e.facing = f;
        const b = bucket(e, 1, 0);
        if (!b.views.has(f)) {
          const made = build(original, e, 1, 0);
          if (!made) throw new Error('No canvas');
          b.views.set(f, made);
        }
        stats.prebuildViews++;
      } catch (err) { stats.prebuildFailures++; }
      done++;
      showProgress(el, 'Preparing characters…', `${entities.length} humanoids — built ${done} / ${total} directional views`, done, total, `${e.name || 'character'} — ${f}`);
      await new Promise(r => requestAnimationFrame(r));
    }
    e.facing = old;
  }
  stats.cacheReadyEntities = entities.filter(e => DIRECTIONS.every(f => cache.get(e)?.views?.has(f))).length;
  stats.cacheReadyViews = entities.reduce((n, e) => n + (cache.get(e)?.views?.size || 0), 0);
}
async function runGate(el, requireStartButton) {
  if (gateRunning) return;
  gateRunning = true;
  try {
    publish(false);
    // IMPORTANT: this runs only after startGameCore/setupVillageScene has returned.
    // The authoritative Campaign 2 roster therefore already exists here.
    const entities = campaignEntities();
    stats.rosterStableEntities = entities.length;
    stats.rosterWaitMs = 0;
    showProgress(el, 'Campaign constructed', `${entities.length} entities found — collecting their art…`, 0, 1);
    const paths = campaignManifest();
    const failed = await loadManifest(el, paths);
    stats.postStartFailures = failed.length;
    await prebuildComposites(el);
    publish(true);
    showProgress(el, 'Ready to start', `${paths.length - failed.length} required art assets loaded; ${stats.cacheReadyViews} directional views cached for ${stats.cacheReadyEntities}/${stats.prebuildEntities} characters.`, 1, 1);
    if (requireStartButton) {
      const b = el.querySelector('[data-start]'); b.hidden = false;
      await new Promise(resolve => { b.onclick = resolve; });
      b.onclick = null; b.hidden = true;
    }
    el.style.display = 'none';
    window.drawMap?.(); window.renderEntities?.();
  } finally { gateRunning = false; }
}
function beginGate(requireStartButton = true) {
  const el = overlay(); el.style.display = 'flex';
  showProgress(el, 'Initialising campaign…', 'Campaign world built; collecting the complete character roster…', 0, 1);
  setTimeout(() => runGate(el, requireStartButton).catch(err => {
    console.error('[asset-gate]', err);
    showProgress(el, 'Campaign art preparation failed', String(err?.message || err), 0, 1);
  }), 0);
}

// The old implementation wrapped startGame(). That is too early: Campaign 2
// does not construct its world/NPC roster until the initial character sheet is
// closed and startGameCore() calls setupVillageScene(). Wrap startGameCore
// instead, then start the gate after that synchronous construction returns.
function installStart() {
  const current = window.startGameCore;
  if (typeof current !== 'function' || current.__postStartAssetGate) return false;
  const wrapped = function(...args) {
    publish(false);
    const result = current.apply(this, args);
    beginGate(true);
    return result;
  };
  wrapped.__postStartAssetGate = true;
  wrapped.__original = current;
  window.startGameCore = wrapped;
  try { (0, eval)('startGameCore = window.startGameCore'); } catch (_) {}
  return true;
}
function installLoad() {
  const current = window.loadGame;
  if (typeof current !== 'function' || current.__postLoadCompositeRebuild) return false;
  const wrapped = function(...args) {
    publish(false);
    const result = current.apply(this, args);
    stats.loadRebuilds++;
    setTimeout(() => beginGate(false), 0);
    return result;
  };
  wrapped.__postLoadCompositeRebuild = true;
  wrapped.__original = current;
  window.loadGame = wrapped;
  try { (0, eval)('loadGame = window.loadGame'); } catch (_) {}
  return true;
}
window.rebuildAllHumanoidCaches = async () => {
  const el = overlay(); el.style.display = 'flex';
  await runGate(el, false);
};

let tries = 0;
const timer = setInterval(() => {
  installDraw(); installStart(); installLoad();
  if (++tries > 400 || (stats.installed && window.startGameCore?.__postStartAssetGate && window.loadGame?.__postLoadCompositeRebuild)) clearInterval(timer);
}, 25);
})();
