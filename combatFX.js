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
