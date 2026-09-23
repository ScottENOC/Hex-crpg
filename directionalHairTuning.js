// directionalHairTuning.js
// Small presentation-only geometry overrides for directional character art.
// Kept separate from the renderer so crop/fit tuning can iterate without
// touching tactical render sequencing or equipment layering.

(() => {
    'use strict';

    const MALE_DEST = {
        front: { x:0.285, y:0.015, w:0.430, h:0.285 },
        side:  { x:0.330, y:0.020, w:0.340, h:0.315 },
        back:  { x:0.285, y:0.015, w:0.430, h:0.300 },
    };

    function isHumanMaleActive() {
        const entity = window.__activeCharacterEntity;
        return entity?.race === 'human' && entity?.gender === 'male';
    }

    function installGenderAwareDest(layout, view) {
        const entry = layout?.[view];
        if (!entry || entry.__genderAwareHairDest) return;
        const femaleDest = { ...entry.hairDest };
        Object.defineProperty(entry, 'hairDest', {
            configurable: true,
            enumerable: true,
            get() { return isHumanMaleActive() ? MALE_DEST[view] : femaleDest; },
            set(value) { Object.assign(femaleDest, value || {}); },
        });
        Object.defineProperty(entry, '__genderAwareHairDest', { value: true, configurable: true });
    }

    function apply() {
        const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT;
        const side = layout?.side;
        if (!side) return false;

        // Female side hair needs a broad crop to cover the rear scalp. Keep
        // that authored fit, but make destination geometry gender-aware below:
        // human male body art has a materially smaller head than the female
        // source body and should not inherit the same oversized hair/beard box.
        side.hairCrop = { x:0.275, y:0.235, w:0.455, h:0.455 };
        side.hairDest = { x:0.270, y:-0.015, w:0.460, h:0.420 };

        installGenderAwareDest(layout, 'front');
        installGenderAwareDest(layout, 'side');
        installGenderAwareDest(layout, 'back');
        window.HUMAN_MALE_DIRECTIONAL_HAIR_DEST = MALE_DEST;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 5000);
})();
