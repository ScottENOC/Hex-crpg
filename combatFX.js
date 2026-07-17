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
        const riseY = y - 20 * zoom - age * 30 * zoom;
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
