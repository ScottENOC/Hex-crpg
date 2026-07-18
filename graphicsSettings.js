// graphicsSettings.js
// B1 (mobile roadmap): manual graphics options, since testing on only one
// or two real devices can't cover the full range of phones this might run
// on — same reasoning as offering a settings menu instead of hand-tuning a
// single "is this phone terrible" auto-detect. Device *preference*, not game
// state, so these persist in localStorage (same convention as
// rpg_allegiance_outline_mode, ui.js) rather than the save file.

// --- Frame rate: Auto (the existing adaptive backoff, gameEngine.js) or a
// manual pin. A manual choice sets every tier to the same interval so the
// adaptive logic can't override it, and is re-applied on load.
const FRAMERATE_INTERVALS = { 60: 16, 30: 33, 15: 66 };
window.frameRateMode = localStorage.getItem('rpg_framerate_mode') || 'auto';
function setFrameRateMode(mode) {
    window.frameRateMode = mode;
    localStorage.setItem('rpg_framerate_mode', mode);
    if (mode === 'auto') {
        if (window._resetRenderPacing) window._resetRenderPacing();
    } else if (window._setManualRenderInterval) {
        window._setManualRenderInterval(FRAMERATE_INTERVALS[mode] || 16);
    }
}
window.setFrameRateMode = setFrameRateMode;

// --- Render scale: backing-store resolution vs. the displayed CSS size —
// see resizeCanvas (hexMap.js) for why this needs no other coordinate-math
// changes anywhere.
window.renderScale = parseFloat(localStorage.getItem('rpg_render_scale') || '1');
window._renderScale = window.renderScale;
function setRenderScale(value) {
    const scale = parseFloat(value);
    window.renderScale = scale;
    window._renderScale = scale;
    localStorage.setItem('rpg_render_scale', String(scale));
    if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
    if (window.resizeCanvas) window.resizeCanvas();
}
window.setRenderScale = setRenderScale;

// --- Reduce motion: gates screen shake, the melee-lunge transform, and
// floating-text drift at their existing call sites (combatFX.js/
// gameEngine.js) rather than adding a new animation system to skip.
window.reduceMotion = localStorage.getItem('rpg_reduce_motion') === 'true';
function setReduceMotion(enabled) {
    window.reduceMotion = !!enabled;
    localStorage.setItem('rpg_reduce_motion', enabled ? 'true' : 'false');
}
window.setReduceMotion = setReduceMotion;

// --- Foliage detail: "Simple" skips the seasonal-tint recolor pass on
// foliage overlays in the terrain buffer (hexMap.js's renderTerrainPass) —
// one of the pricier per-hex operations in that pass.
window.foliageDetail = localStorage.getItem('rpg_foliage_detail') || 'full';
function setFoliageDetail(mode) {
    window.foliageDetail = mode;
    localStorage.setItem('rpg_foliage_detail', mode);
    if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
}
window.setFoliageDetail = setFoliageDetail;

// Sync the settings-modal controls to the persisted values whenever the
// modal opens, same pattern as the existing allegiance-outline/tutorial
// controls (ui.js's openSettingsModal-equivalent code).
function syncGraphicsSettingsUI() {
    const fr = document.getElementById('graphics-framerate-mode');
    if (fr) fr.value = window.frameRateMode;
    const rs = document.getElementById('graphics-render-scale');
    if (rs) rs.value = String(window.renderScale);
    const rm = document.getElementById('graphics-reduce-motion');
    if (rm) rm.checked = window.reduceMotion;
    const fd = document.getElementById('graphics-foliage-detail');
    if (fd) fd.value = window.foliageDetail;
}
window.syncGraphicsSettingsUI = syncGraphicsSettingsUI;
