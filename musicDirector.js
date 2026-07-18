// musicDirector.js
// Living, evolving music for Campaign 2 — vertical layering ("stems"), the
// same technique big adaptive scores (Zelda BotW, RDR2) use. Instead of one
// unique file per situation (combinatorially impossible), each *scene
// palette* is a small set of short loops recorded at the SAME tempo, key,
// and exact duration. All of a palette's stems play simultaneously, sample-
// locked via Web Audio (HTMLAudio elements drift out of sync; buffer
// sources started at the same AudioContext timestamp do not), and this
// director only ever moves per-stem volumes. World state — combat, time of
// day, faction dominance, ambient threat, stealth — is recomputed every
// second into a target gain per stem, smoothed with exponential ramps so
// the mix breathes rather than snaps.
//
// The arena/title system (audio.js) is untouched: this director only runs
// in Campaign 2's open world and goes silent the moment the arena or a
// menu music state takes over (updateMusicState, ui.js).
//
// Missing stem files are fine: the loader marks them absent and their gain
// math still runs (tests exercise the full decision logic with zero .wav
// files on disk). Drop a correctly-named file into audio/music/ and it's
// live — see MUSIC_ASSETS.md for the recording spec per stem.

// ---------------------------------------------------------------------------
// Palette + stem definitions. Each stem: file (under audio/music/), and a
// weight(ctx) -> 0..1 from the current music context. Weights are gains,
// not exclusive states — several stems at partial volume is the normal,
// desired condition ("subtle differences", not channel-switching).
// ---------------------------------------------------------------------------

window.MUSIC_PALETTES = {
    // Zelda-esque orchestral open country. Base bed always on; color layers
    // ride on top of it.
    wilderness: {
        stems: {
            wild_base:    { file: 'wilderness_base.wav',    weight: (c) => 1.0 },
            wild_day:     { file: 'wilderness_day.wav',     weight: (c) => c.daylight },                        // bright strings/winds
            wild_night:   { file: 'wilderness_night.wav',   weight: (c) => 1 - c.daylight },                    // sparse, nocturnal
            wild_threat:  { file: 'wilderness_threat.wav',  weight: (c) => Math.min(1, Math.max(0, (c.threat - 1) * 1.2)) }, // low drones as wolf resurgence etc. raises ambient danger
            wild_danger:  { file: 'wilderness_danger.wav',  weight: (c) => c.enemiesVisible ? 0.8 : 0 },        // percussion swell: something's watching
            wild_combat:  { file: 'wilderness_combat.wav',  weight: (c) => c.inCombat ? 1.0 : 0 },              // full battle layer
            wild_stealth: { file: 'wilderness_stealth.wav', weight: (c) => c.stealthed && !c.inCombat ? 0.7 : 0 },
        },
        // While combat rages, the pastoral color layers duck out of the way
        // (base bed stays — same piece, darker dress).
        combatDucks: ['wild_day', 'wild_night', 'wild_stealth'],
    },

    // Upbeat/funky settlement palette, with one color layer per power bloc.
    // Faction layers are driven by computeFactionDominance below — the same
    // town literally sounds different near the chapel vs. the guild hall,
    // and a faction taking over shifts the whole mix toward its layer.
    village: {
        stems: {
            town_base:      { file: 'town_base.wav',      weight: (c) => 1.0 },
            town_day:       { file: 'town_day.wav',       weight: (c) => c.daylight },                          // market bustle, funky
            town_night:     { file: 'town_night.wav',     weight: (c) => 1 - c.daylight },                      // tavern-hour, smoky
            town_crown:     { file: 'town_crown.wav',     weight: (c) => c.factions.crown },                    // regal brass — Queen/loyalists
            town_guild:     { file: 'town_guild.wav',     weight: (c) => c.factions.guild },                    // mercantile groove — Ironbond
            town_church:    { file: 'town_church.wav',    weight: (c) => c.factions.church },                   // choral/organ
            town_greenskin: { file: 'town_greenskin.wav', weight: (c) => c.factions.greenskin },                // tribal drums
            town_necro:     { file: 'town_necro.wav',     weight: (c) => c.factions.necro },                    // detuned dread
            town_unrest:    { file: 'town_unrest.wav',    weight: (c) => Math.max(0, (35 - c.security) / 35) }, // frayed edges as security collapses
            town_combat:    { file: 'town_combat.wav',    weight: (c) => c.inCombat ? 1.0 : 0 },
        },
        combatDucks: ['town_day', 'town_night', 'town_crown', 'town_guild', 'town_church'],
    },
};

// ---------------------------------------------------------------------------
// Context: one snapshot of everything the weights read, recomputed per tick.
// Kept as a pure function of window state so tests can call it directly.
// ---------------------------------------------------------------------------

// Faction dominance 0..1 per bloc. Two ingredients, deliberately simple:
//  - WORLD STATE: story flags shift the whole town's baseline (a lich player
//    or a raided/goblin-allied region drags everything toward dread/drums).
//  - PROXIMITY: standing near a faction's seat of power leans the mix its
//    way. Anchors are registered by world code in window.musicPOIs as
//    { factionKey: {q, r} } — unregistered factions just use their baseline,
//    so this works before any POIs exist and gets richer as they're added.
const POI_RADIUS = 18; // hexes over which a faction's seat colors the mix
function computeFactionDominance(playerHex) {
    const f = { crown: 0.35, guild: 0.15, church: 0.1, greenskin: 0, necro: 0 }; // peacetime baseline: the Crown's town

    const goblinQuest = (window.questLog || []).find(q => q.id === 'goblin_threat');
    if (window.playerIsLich) { f.necro = 0.8; f.crown *= 0.3; f.church = 0; }
    if (goblinQuest?.resolution === 'goblin_alliance' || window.playerAidingGreenskins) { f.greenskin = 0.55; f.crown *= 0.5; }
    if (goblinQuest?.resolution === 'betrayal') { f.greenskin = 0.35; }

    // Ironbond swagger scales with how the shakedown politics landed —
    // warState/agendas could refine this later; reputation is the simple
    // always-available signal.
    const ironbondStanding = window.factions?.ironbond_company?.standing ?? 0;
    if (ironbondStanding > 20) f.guild = 0.35;

    if (playerHex && window.musicPOIs) {
        for (const key in window.musicPOIs) {
            const poi = window.musicPOIs[key];
            if (!poi || f[key] === undefined) continue;
            const d = window.distance(playerHex, poi);
            if (d < POI_RADIUS) {
                // Linear falloff from full boost at the doorstep to nothing
                // at the radius edge — layered ON TOP of the baseline.
                f[key] = Math.min(1, f[key] + 0.6 * (1 - d / POI_RADIUS));
            }
        }
    }
    return f;
}
window.computeFactionDominance = computeFactionDominance;

function computeMusicContext() {
    const player = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    const hex = player ? player.hex : null;

    // Scene: village vs wilderness by distance from the village origin —
    // same 35-hex convention checkWildernessEncounter treats as "past the
    // village/farmland". Interiors count as their settlement's scene.
    const distFromVillage = hex ? window.distance(hex, { q: 0, r: 0 }) : 0;
    const scene = distFromVillage < 35 ? 'village' : 'wilderness';

    const enemiesVisible = !!(window.entities && player && window.entities.some(e =>
        e.alive && e.side === 'enemy' && window.isVisibleToPlayer && window.isVisibleToPlayer(e.hex)));

    return {
        scene,
        inCombat: !!window.isInCombat,
        daylight: Math.max(0, Math.min(1, window.lightLevel ?? 1)), // already folds in season + indoor mult
        threat: window.wildernessThreatMult || 1,
        security: window.regions?.hollowmere?.security ?? 50,
        stealthed: !!window.player?.isStealthed,
        enemiesVisible,
        factions: computeFactionDominance(hex),
    };
}
window.computeMusicContext = computeMusicContext;

// Pure: palette + context -> {stemName: gain 0..1}. The whole "living music"
// decision surface in one testable function.
function computeStemTargets(paletteName, ctx) {
    const palette = window.MUSIC_PALETTES[paletteName];
    if (!palette) return {};
    const targets = {};
    for (const name in palette.stems) {
        let w = palette.stems[name].weight(ctx);
        if (ctx.inCombat && palette.combatDucks.includes(name)) w *= 0.25;
        targets[name] = Math.max(0, Math.min(1, w));
    }
    return targets;
}
window.computeStemTargets = computeStemTargets;

// ---------------------------------------------------------------------------
// Web Audio playback. Lazy: nothing loads or plays until the director is
// actually asked to run with audio enabled (browsers also require a user
// gesture before an AudioContext may start).
// ---------------------------------------------------------------------------

let _ctx = null;            // AudioContext
let _masterGain = null;
let _activePalette = null;  // name currently playing
let _stemNodes = {};        // stemName -> { gain, source, buffer } (buffer null if file missing)
let _loadingPalette = null;

const STEM_RAMP_SECONDS = 2.5;   // how slowly a layer breathes in/out
const COMBAT_RAMP_SECONDS = 0.6; // combat entrance/exit is snappier

function _ensureContext() {
    if (_ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    _ctx = new AC();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0;
    _masterGain.connect(_ctx.destination);
    return true;
}

async function _loadPalette(name) {
    if (!_ensureContext()) return;
    _loadingPalette = name;
    const palette = window.MUSIC_PALETTES[name];
    const nodes = {};
    await Promise.all(Object.keys(palette.stems).map(async stemName => {
        const gain = _ctx.createGain();
        gain.gain.value = 0;
        gain.connect(_masterGain);
        let buffer = null;
        try {
            const resp = await fetch(`audio/music/${palette.stems[stemName].file}`);
            if (resp.ok) buffer = await _ctx.decodeAudioData(await resp.arrayBuffer());
        } catch (e) { /* missing stem: stays silent, everything else still works */ }
        nodes[stemName] = { gain, buffer, source: null };
    }));
    if (_loadingPalette !== name) return; // palette changed while we were fetching

    // Stop the previous palette's sources and swap in the new set, all
    // started at the same timestamp so they stay sample-locked forever
    // (equal-length loops at equal tempo never drift apart under Web Audio).
    for (const s in _stemNodes) { try { _stemNodes[s].source?.stop(); } catch (e) {} }
    const startAt = _ctx.currentTime + 0.05;
    for (const stemName in nodes) {
        const n = nodes[stemName];
        if (!n.buffer) continue;
        const src = _ctx.createBufferSource();
        src.buffer = n.buffer;
        src.loop = true;
        src.connect(n.gain);
        src.start(startAt);
        n.source = src;
    }
    _stemNodes = nodes;
    _activePalette = name;
    _loadingPalette = null;
}

function _rampGain(gainNode, target, seconds) {
    const now = _ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    // setTargetAtTime is an exponential approach — clickless and natural,
    // same shape the region-decay math uses for the same reason.
    gainNode.gain.setTargetAtTime(target, now, seconds / 3);
}

// The director tick. Safe to call every frame (worldTime.js's tick block
// runs far more often than music needs to react) — self-throttles to ~1Hz,
// which is plenty for gain targets that then ramp over seconds anyway.
let _lastDirectorTick = 0;
function tickMusicDirector(force = false) {
    const nowMs = performance.now();
    if (!force && nowMs - _lastDirectorTick < 1000) return;
    _lastDirectorTick = nowMs;
    _tickMusicDirectorInner();
}

function _tickMusicDirectorInner() {
    // Only Campaign 2's open world; arena/title/menus keep audio.js's system.
    const shouldRun = window.audioEnabled && window.currentCampaign === '2' && !window.isInArena && window.player;
    if (!shouldRun) {
        if (_ctx && _masterGain) _rampGain(_masterGain, 0, 1.5);
        return;
    }
    if (!_ensureContext()) return;
    if (_ctx.state === 'suspended') _ctx.resume();

    const musicVol = (window.audioSettings?.master ?? 1) * (window.audioSettings?.music ?? 0.7);
    _rampGain(_masterGain, musicVol, 1.5);

    const ctx = computeMusicContext();
    if (_activePalette !== ctx.scene && _loadingPalette !== ctx.scene) {
        _loadPalette(ctx.scene); // async; current palette keeps playing until the swap
        return;
    }
    if (_activePalette !== ctx.scene) return; // still loading

    const targets = computeStemTargets(_activePalette, ctx);
    for (const stemName in targets) {
        const node = _stemNodes[stemName];
        if (!node) continue;
        const isCombatStem = stemName.endsWith('_combat') || stemName.endsWith('_danger');
        _rampGain(node.gain, targets[stemName], (isCombatStem || ctx.inCombat) ? COMBAT_RAMP_SECONDS : STEM_RAMP_SECONDS);
    }
}
window.tickMusicDirector = tickMusicDirector;

// World code registers faction seats of power here as they're built, e.g.
// window.musicPOIs.church = chapelCenterHex. Optional — see
// computeFactionDominance.
window.musicPOIs = window.musicPOIs || {};
