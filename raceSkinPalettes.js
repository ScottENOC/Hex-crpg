// raceSkinPalettes.js
// Player-facing skin palette data only. Character rendering belongs exclusively
// to characterRenderer.js; this module does not register art, wrap renderers,
// or provide any fallback rendering path.
(() => {
    'use strict';

    const HUMAN = [
        { hue:30, saturation:0.28, lightness:0.84 },
        { hue:27, saturation:0.36, lightness:0.75 },
        { hue:24, saturation:0.43, lightness:0.64 },
        { hue:21, saturation:0.49, lightness:0.53 },
        { hue:18, saturation:0.52, lightness:0.42 },
        { hue:16, saturation:0.47, lightness:0.31 },
    ];
    const PALETTES = {
        human: HUMAN,
        elf: HUMAN,
        dwarf: HUMAN,
        orc: [
            { hue:135, saturation:0.08, lightness:0.58 },
            { hue:112, saturation:0.20, lightness:0.52 },
            { hue:104, saturation:0.38, lightness:0.45 },
            { hue:132, saturation:0.42, lightness:0.38 },
            { hue:174, saturation:0.30, lightness:0.40 },
            { hue:207, saturation:0.25, lightness:0.43 },
        ],
        goblin: [
            { hue:92,  saturation:0.26, lightness:0.58 },
            { hue:105, saturation:0.42, lightness:0.50 },
            { hue:122, saturation:0.46, lightness:0.42 },
            { hue:145, saturation:0.38, lightness:0.38 },
            { hue:176, saturation:0.34, lightness:0.40 },
            { hue:202, saturation:0.22, lightness:0.45 },
        ],
    };
    window.PLAYER_SKIN_PALETTES = PALETTES;

    function interpolateStops(stops, value) {
        const position = Math.max(0, Math.min(100, Number(value) || 0)) / 100 * (stops.length - 1);
        const lower = Math.floor(position);
        const upper = Math.min(stops.length - 1, lower + 1);
        const mix = position - lower;
        const a = stops[lower], b = stops[upper];
        const lerp = (x, y) => x + (y - x) * mix;
        return {
            hue: lerp(a.hue, b.hue),
            saturation: lerp(a.saturation, b.saturation),
            lightness: lerp(a.lightness, b.lightness),
        };
    }

    function selectedRace() {
        return document.getElementById('race-select')?.value || 'human';
    }

    function raceSkinToneFromSlider(race, value) {
        return interpolateStops(PALETTES[race] || HUMAN, value);
    }
    window.raceSkinToneFromSlider = raceSkinToneFromSlider;

    function getPlayerSkinToneFromControls() {
        const fantasy = !!document.getElementById('fantasy-skin-check')?.checked;
        if (fantasy) return { hue:Number(document.getElementById('skin-hue-slider')?.value || 200) };
        return raceSkinToneFromSlider(selectedRace(), document.getElementById('skin-tone-slider')?.value || 45);
    }
    window.getPlayerSkinToneFromControls = getPlayerSkinToneFromControls;

    function updateSkinToneControlMode() {
        const fantasy = !!document.getElementById('fantasy-skin-check')?.checked;
        const controls = document.getElementById('fantasy-skin-controls');
        if (controls) controls.hidden = !fantasy;
    }
    window.updateSkinToneControlMode = updateSkinToneControlMode;

    function updateSkinUiForRace() {
        const race = selectedRace();
        const label = document.querySelector('label[for="skin-tone-slider"]');
        const helper = document.getElementById('skin-tone-slider')?.closest('.form-group')?.querySelector('small');
        if (label) {
            label.textContent = race === 'orc' ? 'Skin Tone — grey / green / blue'
                : race === 'goblin' ? 'Skin Tone — yellow-green / green / blue-grey'
                : 'Skin Tone';
        }
        if (helper) {
            helper.textContent = race === 'orc'
                ? 'Natural orc tones run through ash grey, green and blue-grey. Fantasy colour still allows any hue.'
                : race === 'goblin'
                    ? 'Natural goblin tones run through moss, green and cool blue-grey. Fantasy colour still allows any hue.'
                    : 'Natural tones run light to dark. Enable Fantasy colour for any hue; NPC skin remains natural.';
        }
    }
    window.updateSkinUiForRace = updateSkinUiForRace;

    function install() {
        const raceSelect = document.getElementById('race-select');
        if (raceSelect && !raceSelect.dataset.skinPaletteBound) {
            raceSelect.dataset.skinPaletteBound = '1';
            raceSelect.addEventListener('change', updateSkinUiForRace);
        }
        updateSkinToneControlMode();
        updateSkinUiForRace();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
    else install();
})();
