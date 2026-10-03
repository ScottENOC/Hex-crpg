// combatFX.js
// Lightweight combat feedback: floating damage/heal/miss numbers, a brief
// color flash on the hit entity, and a short screen shake on a kill.
// Deliberately cheap (no new art, no sprite animation frames) — canvas
// primitives only, driven by performance.now() so it's frame-rate independent
// and needs zero new state saved/loaded (everything here is transient VFX).

window.floatingTexts = [];

// `hex` may be a plain {q,r} or an entity's hex — floats upward from the
// hex center and fades out over ~900ms.
function spawnFloatingText(hex, text, color = '#fff') {
    if (!hex) return;
    window.floatingTexts.push({ q: hex.q, r: hex.r, text, color, start: performance.now() });
}
window.spawnFloatingText = spawnFloatingText;

// A brief colored overlay drawn over the entity's own sprite on its next few
// render passes — cheap "got hit" / "got healed" feedback without needing a
// hit-animation frame for every sprite in the game.
function flashEntity(entity, color = '#f00', durationMs = 220) {
    if (!entity) return;
    entity._fxFlashColor = color;
    entity._fxFlashUntil = performance.now() + durationMs;
}
window.flashEntity = flashEntity;

// A short, decaying camera jitter — reuses window.cameraOffsetX/Y, which
// hexToPixel already adds in (see hexMap.js), so nothing else needs to know
// shake is happening.
window._screenShakeUntil = 0;
window._screenShakeMagnitude = 0;
function triggerScreenShake(magnitude = 6, durationMs = 250) {
    if (window.reduceMotion) return; // B1 graphics option (graphicsSettings.js)
    window._screenShakeUntil = performance.now() + durationMs;
    window._screenShakeMagnitude = magnitude;
}
window.triggerScreenShake = triggerScreenShake;

// Applies (and clears) the current shake offset — called once per drawMap
// frame, before any hexToPixel calls happen for that frame.
function applyScreenShake() {
    const now = performance.now();
    if (now >= window._screenShakeUntil) {
        window.shakeOffsetX = 0; window.shakeOffsetY = 0;
        return;
    }
    const remaining = (window._screenShakeUntil - now) / 250;
    const mag = window._screenShakeMagnitude * remaining;
    window.shakeOffsetX = (Math.random() * 2 - 1) * mag;
    window.shakeOffsetY = (Math.random() * 2 - 1) * mag;
}
window.applyScreenShake = applyScreenShake;

// Draws + prunes floating texts. Called once per drawMap frame, after
// terrain/entities so numbers read on top of everything.
function renderFloatingTexts(ctx, hexToPixel, zoom) {
    const now = performance.now();
    window.floatingTexts = window.floatingTexts.filter(t => now - t.start < 900);
    window.floatingTexts.forEach(t => {
        const age = (now - t.start) / 900; // 0..1
        const { x, y } = hexToPixel(t.q, t.r);
        // B1 graphics option: reduce motion keeps the number in place (still
        // fades out) instead of rising — the numbers themselves stay
        // informative either way, only the drift is what's skipped.
        const riseY = window.reduceMotion ? y - 20 * zoom : y - 20 * zoom - age * 30 * zoom;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age);
        ctx.font = `bold ${Math.round(16 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(t.text, x + 1, riseY + 1);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, x, riseY);
        ctx.restore();
    });
}
window.renderFloatingTexts = renderFloatingTexts;

// PROJECTILES: a brief line/arrowhead flying from attacker to target on a
// ranged hit, same "cheap, transient, canvas-only" shape as the pieces
// above — no new sprite art, driven by performance.now() so it needs
// nothing saved/loaded. Called from resolveAttack (gameEngine.js) whenever
// the weapon involved is ranged, so any ranged attack (player or AI, bow
// or thrown) gets the same visible "something just flew across the map"
// feedback instead of a silent hit/miss message.
window.projectiles = [];
const PROJECTILE_DURATION_MS = 220;

// drawMap is normally only called on-demand (a move, an action, a state
// change) rather than on a continuous render loop, so a 220ms projectile
// needs its own short-lived animation driver to actually appear moving
// instead of as a single static frame — self-terminates the instant no
// projectiles are left in flight, so it costs nothing between attacks.
let _projectileAnimRunning = false;
function _driveProjectileAnimation() {
    if (!window.projectiles || window.projectiles.length === 0) { _projectileAnimRunning = false; return; }
    if (window.drawMap) window.drawMap();
    requestAnimationFrame(_driveProjectileAnimation);
}

function spawnProjectile(fromHex, toHex, color = '#e8e0c8') {
    if (!fromHex || !toHex) return;
    window.projectiles.push({
        fromQ: fromHex.q, fromR: fromHex.r, toQ: toHex.q, toR: toHex.r,
        color, start: performance.now(),
    });
    if (!_projectileAnimRunning) {
        _projectileAnimRunning = true;
        requestAnimationFrame(_driveProjectileAnimation);
    }
}
window.spawnProjectile = spawnProjectile;

// Draws + prunes in-flight projectiles. Called once per drawMap frame,
// same spot renderFloatingTexts already is.
function renderProjectiles(ctx, hexToPixel, zoom) {
    const now = performance.now();
    window.projectiles = window.projectiles.filter(p => now - p.start < PROJECTILE_DURATION_MS);
    window.projectiles.forEach(p => {
        const t = Math.min(1, (now - p.start) / PROJECTILE_DURATION_MS);
        const from = hexToPixel(p.fromQ, p.fromR);
        const to = hexToPixel(p.toQ, p.toR);
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const len = 14 * zoom;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, 2 * zoom);
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        // arrowhead
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-6 * zoom, -4 * zoom);
        ctx.lineTo(-6 * zoom, 4 * zoom);
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
    });
}
window.renderProjectiles = renderProjectiles;

// MELEE LUNGE: the melee counterpart to the ranged projectile above — the
// attacker pivots toward the target and bumps a few pixels that way, then
// springs back, so a sword/axe/spear/unarmed hit reads as an actual swing
// instead of a silent stat change. State lives on the entity itself
// (_meleeLungeStart/_meleeLungeTargetHex) rather than a separate list like
// projectiles, since only one lunge per entity can ever be in flight and
// this way a dead/removed entity's lunge just stops mattering with it.
// Consumed by renderEntities (gameEngine.js), which wraps that entity's
// body+equipment draw calls in the returned rotate/translate.
const MELEE_LUNGE_DURATION_MS = 260;
const MELEE_LUNGE_MAX_ANGLE = 45 * Math.PI / 180;
const MELEE_LUNGE_MAX_BUMP = 10; // px at zoom 1, scaled by the caller's zoom

let _meleeAnimRunning = false;
function _driveMeleeAnimation() {
    const now = performance.now();
    const stillAnimating = window.entities && window.entities.some(e => e._meleeLungeStart && now - e._meleeLungeStart < e._meleeLungeDuration);
    if (!stillAnimating) { _meleeAnimRunning = false; return; }
    if (window.drawMap) window.drawMap();
    requestAnimationFrame(_driveMeleeAnimation);
}

function triggerMeleeLunge(attacker, target) {
    if (!attacker || !target) return;
    if (window.reduceMotion) return; // B1 graphics option (graphicsSettings.js)
    attacker._meleeLungeStart = performance.now();
    attacker._meleeLungeDuration = MELEE_LUNGE_DURATION_MS;
    attacker._meleeLungeTargetHex = { q: target.hex.q, r: target.hex.r };
    if (!_meleeAnimRunning) {
        _meleeAnimRunning = true;
        requestAnimationFrame(_driveMeleeAnimation);
    }
}
window.triggerMeleeLunge = triggerMeleeLunge;

// Returns null once the lunge has finished (renderEntities then draws the
// entity with no transform at all — same as any entity that never lunged).
function getMeleeLungeTransform(entity, hexToPixel, zoom) {
    if (!entity._meleeLungeStart) return null;
    const now = performance.now();
    const t = (now - entity._meleeLungeStart) / entity._meleeLungeDuration;
    if (t >= 1) { entity._meleeLungeStart = null; return null; }
    // 0 -> 1 -> 0 across the duration: out toward the target, then back.
    const wave = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
    const from = hexToPixel(entity.hex.q, entity.hex.r);
    const to = hexToPixel(entity._meleeLungeTargetHex.q, entity._meleeLungeTargetHex.r);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const sign = Math.cos(angle) >= 0 ? 1 : -1;
    return {
        dx: Math.cos(angle) * MELEE_LUNGE_MAX_BUMP * zoom * wave,
        dy: Math.sin(angle) * MELEE_LUNGE_MAX_BUMP * zoom * wave,
        rotation: sign * MELEE_LUNGE_MAX_ANGLE * wave,
    };
}
window.getMeleeLungeTransform = getMeleeLungeTransform;

// SPELL VFX -----------------------------------------------------------------
// Reuses the existing transient combat-FX render hook rather than introducing
// another canvas/layer or any persisted state. These are deliberately drawn
// with primitives: they work offline, add no preload traffic, and scale cleanly
// with the map. `simple` is selected for reduced-motion / low render-scale;
// otherwise effects gain particles, trails and flicker while keeping the same
// readable silhouette.
window.spellEffects = window.spellEffects || [];
window.spellVisualProjectiles = window.spellVisualProjectiles || [];

const SPELL_FX_BY_BASE = {
    firebolt: 'firebolt',
    heal: 'heal',
    smite_evil: 'smite',
    divine_silence: 'silence',
    sanctuary: 'sanctuary',
    divine_protection: 'protection',
    summon_animal: 'summon',
    counterspell: 'counterspell',
    dragon_breath: 'dragon_breath',
    entangle: 'entangle',
    wild_fury: 'wild_fury',
    calm_animal: 'calm_animal',
    temporal_rift: 'temporal_rift',
};
window.SPELL_FX_BY_BASE = SPELL_FX_BY_BASE;

function getSpellFxDetail() {
    if (window.reduceMotion) return 'simple';
    if (typeof window.renderScale === 'number' && window.renderScale < 0.75) return 'simple';
    return 'full';
}
window.getSpellFxDetail = getSpellFxDetail;

let _spellFxAnimRunning = false;
function _spellFxAlive(now = performance.now()) {
    const moving = window.spellVisualProjectiles?.some(p => now - p.start < p.durationMs);
    const bursts = window.spellEffects?.some(e => now - e.start < e.durationMs);
    return !!(moving || bursts);
}
function _driveSpellFxAnimation() {
    if (!_spellFxAlive()) { _spellFxAnimRunning = false; return; }
    if (window.drawMap) window.drawMap();
    requestAnimationFrame(_driveSpellFxAnimation);
}
function _startSpellFxAnimation() {
    if (_spellFxAnimRunning) return;
    _spellFxAnimRunning = true;
    requestAnimationFrame(_driveSpellFxAnimation);
}

function spawnSpellVisualProjectile(fromHex, toHex, style = 'firebolt') {
    if (!fromHex || !toHex) return;
    window.spellVisualProjectiles.push({
        fromQ: fromHex.q, fromR: fromHex.r,
        toQ: toHex.q, toR: toHex.r,
        style,
        start: performance.now(),
        durationMs: window.reduceMotion ? 180 : 360,
    });
    _startSpellFxAnimation();
}
window.spawnSpellVisualProjectile = spawnSpellVisualProjectile;

function spawnSpellBurst(hex, style, durationMs = 520) {
    if (!hex) return;
    window.spellEffects.push({ q: hex.q, r: hex.r, style, start: performance.now(), durationMs });
    _startSpellFxAnimation();
}
window.spawnSpellBurst = spawnSpellBurst;

function _circle(ctx, x, y, radius, fill, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.fill();
}

function _ring(ctx, x, y, radius, stroke, lineWidth, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.stroke();
}

function renderSpellVisualProjectile(ctx, hexToPixel, zoom, p, now) {
    const t = Math.max(0, Math.min(1, (now - p.start) / p.durationMs));
    const from = hexToPixel(p.fromQ, p.fromR);
    const to = hexToPixel(p.toQ, p.toR);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    // Lift the source slightly toward a humanoid hand while the destination
    // remains the target hex centre (centre of mass at map scale).
    const handX = from.x + Math.cos(angle) * 9 * zoom;
    const handY = from.y - 10 * zoom + Math.sin(angle) * 3 * zoom;
    const x = handX + (to.x - handX) * t;
    const y = handY + (to.y - handY) * t;
    const detail = getSpellFxDetail();

    ctx.save();
    if (p.style === 'firebolt') {
        if (detail === 'full') {
            // Warm trail behind a flickering core: a cheap moving-fire read,
            // not a frame sprite, so it remains smooth at arbitrary zoom.
            for (let i = 4; i >= 1; i--) {
                const backT = Math.max(0, t - i * 0.035);
                const tx = handX + (to.x - handX) * backT;
                const ty = handY + (to.y - handY) * backT;
                const wobble = Math.sin(now * 0.035 + i * 2.1) * 2 * zoom;
                _circle(ctx, tx - Math.sin(angle) * wobble, ty + Math.cos(angle) * wobble,
                    (7 - i) * zoom, i < 3 ? '#ff7a00' : '#d94801', 0.15 + (4 - i) * 0.12);
            }
            const flicker = 1 + Math.sin(now * 0.06) * 0.16;
            _circle(ctx, x, y, 11 * zoom * flicker, '#ff5a00', 0.25);
            _circle(ctx, x, y, 7 * zoom * flicker, '#ff8c00', 0.95);
            _circle(ctx, x + 1.5 * zoom, y - 1.5 * zoom, 3.6 * zoom, '#ffe066', 1);
        } else {
            _circle(ctx, x, y, 8 * zoom, '#e85d04', 0.95);
            _circle(ctx, x, y, 5.5 * zoom, '#ff9f1c', 1);
            _circle(ctx, x + zoom, y - zoom, 2.5 * zoom, '#ffe66d', 1);
        }
    } else if (p.style === 'dragon_breath') {
        const spread = detail === 'full' ? 5 : 2;
        for (let i = 0; i < spread; i++) {
            const offset = (i - (spread - 1) / 2) * 5 * zoom * t;
            const px = x - Math.sin(angle) * offset;
            const py = y + Math.cos(angle) * offset;
            _circle(ctx, px, py, (6 + t * 5) * zoom, i % 2 ? '#ff9f1c' : '#e85d04', 0.8 - t * 0.2);
        }
    }
    ctx.restore();
}

function renderSpellBurst(ctx, hexToPixel, zoom, e, now) {
    const age = Math.max(0, Math.min(1, (now - e.start) / e.durationMs));
    const fade = 1 - age;
    const { x, y } = hexToPixel(e.q, e.r);
    const full = getSpellFxDetail() === 'full';
    ctx.save();

    switch (e.style) {
        case 'heal': {
            _circle(ctx, x, y - 5 * zoom, (10 + age * 13) * zoom, '#78d6ff', 0.22 * fade);
            _ring(ctx, x, y, (7 + age * 20) * zoom, '#8be9fd', Math.max(1.5, 2.5 * zoom), 0.9 * fade);
            const count = full ? 6 : 3;
            for (let i = 0; i < count; i++) {
                const ox = (i - (count - 1) / 2) * 5 * zoom;
                const oy = y + 10 * zoom - age * (22 + (i % 3) * 7) * zoom;
                _circle(ctx, x + ox, oy, 2.2 * zoom, '#bdefff', 0.9 * fade);
            }
            break;
        }
        case 'smite':
            ctx.globalAlpha = fade;
            ctx.strokeStyle = '#fff1a8';
            ctx.lineWidth = Math.max(2, 4 * zoom);
            ctx.beginPath(); ctx.moveTo(x, y - (30 + 25 * age) * zoom); ctx.lineTo(x, y + 10 * zoom); ctx.stroke();
            _ring(ctx, x, y, (5 + 18 * age) * zoom, '#ffd166', 2 * zoom, fade);
            break;
        case 'silence':
            _circle(ctx, x, y, (12 + 15 * age) * zoom, '#596275', 0.18 * fade);
            _ring(ctx, x, y, (10 + 21 * age) * zoom, '#c8d6e5', 2 * zoom, 0.65 * fade);
            if (full) _ring(ctx, x, y, (6 + 13 * age) * zoom, '#8395a7', 1.5 * zoom, 0.5 * fade);
            break;
        case 'sanctuary':
            _circle(ctx, x, y, (13 + 5 * Math.sin(age * Math.PI)) * zoom, '#fff3b0', 0.16 * fade);
            _ring(ctx, x, y, (15 + age * 4) * zoom, '#ffe08a', 2.5 * zoom, 0.8 * fade);
            break;
        case 'protection':
            _ring(ctx, x, y, (10 + 12 * age) * zoom, '#9ad1ff', 3 * zoom, 0.8 * fade);
            _ring(ctx, x, y, (6 + 6 * age) * zoom, '#e0f2ff', 1.5 * zoom, 0.7 * fade);
            break;
        case 'summon': {
            _ring(ctx, x, y, (5 + 21 * age) * zoom, '#b7e4c7', 2.5 * zoom, 0.9 * fade);
            const count = full ? 8 : 4;
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2 + age * 0.8;
                const rr = (7 + age * 18) * zoom;
                _circle(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.55,
                    (3 + age * 3) * zoom, '#d8f3dc', 0.45 * fade);
            }
            break;
        }
        case 'counterspell':
            _ring(ctx, x, y, (20 - age * 12) * zoom, '#d0a2f7', 3 * zoom, 0.9 * fade);
            _circle(ctx, x, y, (6 + age * 6) * zoom, '#8e44ad', 0.28 * fade);
            break;
        case 'dragon_breath':
            _ring(ctx, x, y, (8 + 25 * age) * zoom, '#ff6b00', 3 * zoom, 0.85 * fade);
            if (full) _circle(ctx, x, y, (8 + 18 * age) * zoom, '#ffb703', 0.22 * fade);
            break;
        case 'entangle': {
            _ring(ctx, x, y, (7 + 18 * age) * zoom, '#52b788', 3 * zoom, 0.9 * fade);
            const tendrils = full ? 6 : 3;
            ctx.globalAlpha = 0.8 * fade;
            ctx.strokeStyle = '#2d6a4f';
            ctx.lineWidth = Math.max(1.5, 2 * zoom);
            for (let i = 0; i < tendrils; i++) {
                const a = i / tendrils * Math.PI * 2;
                ctx.beginPath(); ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x + Math.cos(a + 0.4) * 10 * zoom, y + Math.sin(a + 0.4) * 7 * zoom,
                    x + Math.cos(a) * (12 + age * 16) * zoom, y + Math.sin(a) * (8 + age * 10) * zoom);
                ctx.stroke();
            }
            break;
        }
        case 'wild_fury':
            _circle(ctx, x, y, (8 + age * 14) * zoom, '#f4a261', 0.22 * fade);
            _ring(ctx, x, y, (8 + age * 18) * zoom, '#e76f51', 3 * zoom, 0.85 * fade);
            break;
        case 'calm_animal':
            _ring(ctx, x, y, (6 + age * 19) * zoom, '#80ed99', 2.5 * zoom, 0.85 * fade);
            if (full) _ring(ctx, x, y, (3 + age * 12) * zoom, '#c7f9cc', 1.5 * zoom, 0.65 * fade);
            break;
        case 'temporal_rift':
            _ring(ctx, x, y, (20 - age * 13) * zoom, '#9d4edd', 3 * zoom, 0.9 * fade);
            _ring(ctx, x, y, (5 + age * 18) * zoom, '#5a189a', 2 * zoom, 0.7 * fade);
            if (full) {
                ctx.globalAlpha = 0.5 * fade;
                ctx.strokeStyle = '#e0aaff';
                ctx.beginPath();
                for (let i = 0; i <= 12; i++) {
                    const a = i / 12 * Math.PI * 4;
                    const rr = i / 12 * 22 * zoom;
                    const px = x + Math.cos(a) * rr;
                    const py = y + Math.sin(a) * rr * 0.55;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
            break;
    }
    ctx.restore();
}

// combatFX's existing renderProjectiles is already called in the correct
// top-of-map FX layer. Wrap it once so spells share that layer and inherit
// zoom-based graphics suppression from graphicsSettings.js.
const _renderPhysicalProjectiles = window.renderProjectiles;
window.renderProjectiles = function renderCombatProjectilesWithSpells(ctx, hexToPixel, zoom) {
    _renderPhysicalProjectiles(ctx, hexToPixel, zoom);
    const now = performance.now();
    window.spellVisualProjectiles = window.spellVisualProjectiles.filter(p => now - p.start < p.durationMs);
    window.spellEffects = window.spellEffects.filter(e => now - e.start < e.durationMs);
    window.spellVisualProjectiles.forEach(p => renderSpellVisualProjectile(ctx, hexToPixel, zoom, p, now));
    window.spellEffects.forEach(e => renderSpellBurst(ctx, hexToPixel, zoom, e, now));
};

function spellFxBaseId(spell) {
    if (!spell) return '';
    if (spell.baseId) return spell.baseId;
    const name = String(spell.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return name;
}
window.spellFxBaseId = spellFxBaseId;

function playSpellVisualEffect(caster, spell, target, clickedHex) {
    if (!caster?.hex || !spell) return;
    const baseId = spellFxBaseId(spell);
    const style = SPELL_FX_BY_BASE[baseId];
    if (!style) return;
    const targetHex = target?.hex || clickedHex || caster.hex;

    switch (style) {
        case 'firebolt':
            spawnSpellVisualProjectile(caster.hex, targetHex, 'firebolt');
            break;
        case 'dragon_breath':
            spawnSpellVisualProjectile(caster.hex, targetHex, 'dragon_breath');
            spawnSpellBurst(targetHex, 'dragon_breath', 500);
            break;
        case 'heal':
            spawnSpellBurst(targetHex, 'heal', 650);
            break;
        case 'summon':
            // The summon exists by the time this runs; the pale smoke/ring
            // makes its sudden appearance read as magical materialisation.
            spawnSpellBurst(clickedHex || targetHex, 'summon', 700);
            break;
        case 'entangle':
            spawnSpellBurst(clickedHex || targetHex, 'entangle', 700);
            break;
        case 'temporal_rift':
            spawnSpellBurst(clickedHex || targetHex, 'temporal_rift', 750);
            break;
        default:
            spawnSpellBurst(targetHex, style, 560);
            break;
    }
}
window.playSpellVisualEffect = playSpellVisualEffect;

// tryCastSpell is defined later in gameEngine.js, so install the wrapper once
// all ordinary scripts have executed. Real-time casts call tryCastSpell once
// to start their cast bar and again with bypassCooldown=true when the spell
// actually fires; only the second call gets VFX. Failed/counter-pending casts
// likewise do not launch a misleading projectile.
function installSpellFxCastHook() {
    const original = window.tryCastSpell;
    if (!original || original.__spellFxWrapped) return false;
    const wrapped = function(caster, spell, target, clickedHex, bypassCooldown = false) {
        const delayedStart = !window.isInCombat && !bypassCooldown;
        const result = original.apply(this, arguments);
        if (!delayedStart && result !== false && result !== 'counter_pending') {
            playSpellVisualEffect(caster, spell, target, clickedHex);
        }
        return result;
    };
    wrapped.__spellFxWrapped = true;
    wrapped.__original = original;
    window.tryCastSpell = wrapped;
    return true;
}
window.installSpellFxCastHook = installSpellFxCastHook;

if (!installSpellFxCastHook()) {
    document.addEventListener('DOMContentLoaded', installSpellFxCastHook, { once: true });
}
