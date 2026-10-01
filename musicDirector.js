// musicDirector.js
// Living, evolving music for Campaign 2. Palette stems are kept sample-locked
// with Web Audio; audioManager owns the shared AudioContext, URL versioning and
// decoded-buffer cache used underneath this director.

window.MUSIC_PALETTES = {
    wilderness: {
        stems: {
            wild_base:    { file: 'wilderness_base.wav',    weight: (c) => 1.0 },
            wild_day:     { file: 'wilderness_day.wav',     weight: (c) => c.daylight },
            wild_night:   { file: 'wilderness_night.wav',   weight: (c) => 1 - c.daylight },
            wild_threat:  { file: 'wilderness_threat.wav',  weight: (c) => Math.min(1, Math.max(0, (c.threat - 1) * 1.2)) },
            wild_danger:  { file: 'wilderness_danger.wav',  weight: (c) => c.enemiesVisible ? 0.8 : 0 },
            wild_combat:  { file: 'wilderness_combat.wav',  weight: (c) => c.inCombat ? 1.0 : 0 },
            wild_stealth: { file: 'wilderness_stealth.wav', weight: (c) => c.stealthed && !c.inCombat ? 0.7 : 0 },
        },
        combatDucks: ['wild_day', 'wild_night', 'wild_stealth'],
    },
    village: {
        stems: {
            town_base:      { file: 'town_base.wav',      weight: (c) => 1.0 },
            town_day:       { file: 'town_day.wav',       weight: (c) => c.daylight },
            town_night:     { file: 'town_night.wav',     weight: (c) => 1 - c.daylight },
            town_crown:     { file: 'town_crown.wav',     weight: (c) => c.factions.crown },
            town_guild:     { file: 'town_guild.wav',     weight: (c) => c.factions.guild },
            town_church:    { file: 'town_church.wav',    weight: (c) => c.factions.church },
            town_greenskin: { file: 'town_greenskin.wav', weight: (c) => c.factions.greenskin },
            town_necro:     { file: 'town_necro.wav',     weight: (c) => c.factions.necro },
            town_unrest:    { file: 'town_unrest.wav',    weight: (c) => Math.max(0, (35 - c.security) / 35) },
            town_combat:    { file: 'town_combat.wav',    weight: (c) => c.inCombat ? 1.0 : 0 },
        },
        combatDucks: ['town_day', 'town_night', 'town_crown', 'town_guild', 'town_church'],
    },
};

const POI_RADIUS = 18;
function computeFactionDominance(playerHex) {
    const f = { crown: 0.35, guild: 0.15, church: 0.1, greenskin: 0, necro: 0 };

    const goblinQuest = (window.questLog || []).find(q => q.id === 'goblin_threat');
    if (window.playerIsLich) { f.necro = 0.8; f.crown *= 0.3; f.church = 0; }
    if (goblinQuest?.resolution === 'goblin_alliance' || window.playerAidingGreenskins) { f.greenskin = 0.55; f.crown *= 0.5; }
    if (goblinQuest?.resolution === 'betrayal') f.greenskin = 0.35;

    const ironbondStanding = window.factions?.ironbond_company?.standing ?? 0;
    if (ironbondStanding > 20) f.guild = 0.35;

    if (playerHex && window.musicPOIs) {
        for (const key in window.musicPOIs) {
            const entry = window.musicPOIs[key];
            if (!entry || f[key] === undefined) continue;
            const pois = Array.isArray(entry) ? entry : [entry];
            let d = Infinity;
            for (const poi of pois) {
                if (!poi) continue;
                const dist = window.distance(playerHex, poi);
                if (dist < d) d = dist;
            }
            if (d < POI_RADIUS) f[key] = Math.min(1, f[key] + 0.6 * (1 - d / POI_RADIUS));
        }
    }
    return f;
}
window.computeFactionDominance = computeFactionDominance;

function computeMusicContext() {
    const player = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    const hex = player ? player.hex : null;
    const distFromVillage = hex ? window.distance(hex, { q: 0, r: 0 }) : 0;
    const scene = distFromVillage < 35 ? 'village' : 'wilderness';
    const enemiesVisible = !!(window.entities && player && window.entities.some(e =>
        e.alive && e.side === 'enemy' && window.isVisibleToPlayer && window.isVisibleToPlayer(e.hex)));
    const indoors = !!(hex && window.findInteriorRegion && window.findInteriorRegion(hex));

    return {
        scene,
        indoors,
        inCombat: !!window.isInCombat,
        daylight: Math.max(0, Math.min(1, window.lightLevel ?? 1)),
        threat: window.wildernessThreatMult || 1,
        security: window.regions?.hollowmere?.security ?? 50,
        stealthed: !!window.player?.isStealthed,
        enemiesVisible,
        factions: computeFactionDominance(hex),
    };
}
window.computeMusicContext = computeMusicContext;

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

let _ctx = null;
let _masterGain = null;
let _interiorFilter = null;
let _activePalette = null;
let _stemNodes = {};
let _loadingPalette = null;
let _ducked = false;

const STEM_RAMP_SECONDS = 2.5;
const COMBAT_RAMP_SECONDS = 0.6;

function _ensureContext() {
    if (_ctx) return true;
    _ctx = window.audioManager?.getContext?.() || null;
    if (!_ctx) return false;

    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0;
    _interiorFilter = _ctx.createBiquadFilter();
    _interiorFilter.type = 'lowpass';
    _interiorFilter.frequency.value = 22000;
    _masterGain.connect(_interiorFilter);
    _interiorFilter.connect(_ctx.destination);
    return true;
}

// Called synchronously by setAudioEnabled(true), which normally runs directly
// inside the player's tap/click handler. That makes the shared context reliable
// in iOS Safari/WKWebView before game-driven music starts later.
function unlockMusicDirectorAudio() {
    window.audioManager?.unlock?.();
    if (!_ensureContext()) return false;
    if (_ctx.state === 'suspended' && typeof _ctx.resume === 'function') {
        try {
            const p = _ctx.resume();
            if (p?.catch) p.catch(error => console.warn('Music AudioContext resume failed', error));
        } catch (error) {
            console.warn('Music AudioContext resume threw', error);
        }
    }
    return true;
}
window.unlockMusicDirectorAudio = unlockMusicDirectorAudio;

function _getMusicFilterHz() {
    return _interiorFilter ? _interiorFilter.frequency.value : null;
}
window._getMusicFilterHz = _getMusicFilterHz;

async function _loadPalette(name) {
    if (!_ensureContext()) return;
    _loadingPalette = name;
    const palette = window.MUSIC_PALETTES[name];
    const nodes = {};

    await Promise.all(Object.keys(palette.stems).map(async stemName => {
        const gain = _ctx.createGain();
        gain.gain.value = 0;
        gain.connect(_masterGain);
        const path = `audio/music/${palette.stems[stemName].file}`;
        // Campaign 2 music assets are intentionally still optional pending the
        // first real GarageBand pass. Preserve today's behaviour: one attempt,
        // no player-facing error for a stem that has not been recorded yet.
        const buffer = await window.audioManager?.loadBuffer(path, { optional: true, retries: 0 }) || null;
        nodes[stemName] = { gain, buffer, source: null };
    }));
    if (_loadingPalette !== name) return;

    for (const s in _stemNodes) {
        try { _stemNodes[s].source?.stop(); } catch (_) {}
    }
    const startAt = _ctx.currentTime + 0.05;
    for (const stemName in nodes) {
        const n = nodes[stemName];
        if (!n.buffer) continue;
        const source = _ctx.createBufferSource();
        source.buffer = n.buffer;
        source.loop = true;
        source.connect(n.gain);
        source.start(startAt);
        n.source = source;
    }
    _stemNodes = nodes;
    _activePalette = name;
    _loadingPalette = null;
}

function _rampGain(gainNode, target, seconds) {
    const now = _ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(target, now, seconds / 3);
}

let _lastDirectorTick = 0;
function tickMusicDirector(force = false) {
    const nowMs = performance.now();
    if (!force && nowMs - _lastDirectorTick < 1000) return;
    _lastDirectorTick = nowMs;
    _tickMusicDirectorInner();
}

function _tickMusicDirectorInner() {
    const shouldRun = window.audioEnabled && window.currentCampaign === '2' && !window.isInArena && window.player;
    if (!shouldRun) {
        if (_ctx && _masterGain) _rampGain(_masterGain, 0, 1.5);
        return;
    }
    if (!_ensureContext()) return;
    if (_ctx.state === 'suspended') {
        try {
            const p = _ctx.resume();
            if (p?.catch) p.catch(() => {});
        } catch (_) {}
    }

    const musicVol = (window.audioSettings?.master ?? 1) * (window.audioSettings?.music ?? 0.7) * (_ducked ? 0.3 : 1);
    _rampGain(_masterGain, musicVol, 1.5);
    const ctx = computeMusicContext();

    if (_interiorFilter) {
        const targetHz = ctx.indoors ? 800 : 22000;
        const now = _ctx.currentTime;
        _interiorFilter.frequency.cancelScheduledValues(now);
        _interiorFilter.frequency.setTargetAtTime(targetHz, now, STEM_RAMP_SECONDS / 3);
    }
    if (_activePalette !== ctx.scene && _loadingPalette !== ctx.scene) {
        _loadPalette(ctx.scene);
        return;
    }
    if (_activePalette !== ctx.scene) return;

    const targets = computeStemTargets(_activePalette, ctx);
    for (const stemName in targets) {
        const node = _stemNodes[stemName];
        if (!node) continue;
        const isCombatStem = stemName.endsWith('_combat') || stemName.endsWith('_danger');
        _rampGain(node.gain, targets[stemName], (isCombatStem || ctx.inCombat) ? COMBAT_RAMP_SECONDS : STEM_RAMP_SECONDS);
    }
}
window.tickMusicDirector = tickMusicDirector;

function setMusicDirectorDucked(ducked) {
    _ducked = !!ducked;
    if (_ctx && _masterGain) tickMusicDirector(true);
}
window.setMusicDirectorDucked = setMusicDirectorDucked;

window.musicPOIs = window.musicPOIs || {};
