// audioManager.js
// Shared owner for runtime audio resources: build-versioned URLs, one Web Audio
// context, decoded-buffer reuse, lazy media elements and player-visible errors.
(() => {
    'use strict';

    const VERSION = '1';
    if (window.audioManager?.version === VERSION) return;

    const media = new Map();
    const buffers = new Map();
    const activeSources = new Set();
    const activeChannels = new Map();
    const channelTokens = new Map();
    const reportedFailures = new Set();
    let context = null;

    function buildVersion() {
        return document.querySelector('meta[name="app-build"]')?.content || window.PRESENTATION_BUILD || `audio-manager-v${VERSION}`;
    }

    function urlFor(value, { retry = 0 } = {}) {
        const raw = String(value || '');
        if (!raw || /^(?:data:|blob:)/i.test(raw)) return raw;
        try {
            const url = new URL(raw, document.baseURI);
            const base = new URL('.', document.baseURI);
            const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
            if (url.origin !== base.origin || !url.pathname.startsWith(basePath)) return raw;
            url.searchParams.set('build', buildVersion());
            if (retry) url.searchParams.set('audioRetry', String(retry));
            return url.href;
        } catch (_) {
            const sep = raw.includes('?') ? '&' : '?';
            return `${raw}${sep}build=${encodeURIComponent(buildVersion())}${retry ? `&audioRetry=${retry}` : ''}`;
        }
    }

    function reportFailure(path, error, kind = 'audio') {
        const message = error instanceof Error ? error.message : String(error || 'Unknown audio error');
        console.warn(`[audioManager] ${kind} failed: ${path}`, error);
        try {
            window.dispatchEvent(new CustomEvent('audioasseterror', { detail: { path, kind, message } }));
        } catch (_) {}
        if (reportedFailures.has(path)) return;
        reportedFailures.add(path);
        if (typeof window.showMessage === 'function') {
            window.showMessage(`Audio asset failed: ${path}`);
        }
    }

    function getContext() {
        if (context) return context;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            context = new AC();
        } catch (error) {
            reportFailure('Web Audio', error, 'context');
            return null;
        }
        return context;
    }

    // Call synchronously from the player's audio-enable gesture. Creating and
    // resuming here is the important iOS/WKWebView part; later playback may be
    // asynchronous once this context has been unlocked.
    function unlock() {
        const ctx = getContext();
        if (!ctx) return null;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            try {
                const p = ctx.resume();
                if (p?.catch) p.catch(error => console.warn('[audioManager] Web Audio resume failed', error));
            } catch (error) {
                console.warn('[audioManager] Web Audio resume threw', error);
            }
        }
        return ctx;
    }

    function getMedia(key, path, { loop = false, preload = 'auto' } = {}) {
        if (media.has(key)) return media.get(key);
        const element = new Audio();
        element.preload = preload;
        element.loop = !!loop;
        element.src = urlFor(path);
        element.addEventListener('error', () => {
            const code = element.error?.code;
            reportFailure(path, new Error(`HTML audio load error${code ? ` (code ${code})` : ''}`), 'media');
        });
        media.set(key, element);
        return element;
    }

    function peekMedia(key) {
        return media.get(key) || null;
    }

    function forEachMedia(callback) {
        for (const [key, element] of media) callback(element, key);
    }

    function playMedia(element, label = 'audio') {
        if (!element) return null;
        try {
            const p = element.play();
            if (p?.catch) p.catch(error => console.warn(`[audioManager] playback failed: ${label}`, error));
            return p;
        } catch (error) {
            console.warn(`[audioManager] playback threw: ${label}`, error);
            return null;
        }
    }

    function unlockMediaElements(elements) {
        for (const element of elements) {
            if (!element) continue;
            const oldMuted = element.muted;
            const oldVolume = element.volume;
            element.muted = true;
            element.volume = 0;
            try {
                const p = element.play();
                const finish = () => {
                    element.pause();
                    try { element.currentTime = 0; } catch (_) {}
                    element.muted = oldMuted;
                    element.volume = oldVolume;
                };
                if (p?.then) p.then(finish).catch(error => {
                    element.muted = oldMuted;
                    element.volume = oldVolume;
                    console.warn('[audioManager] media unlock failed', error);
                });
                else finish();
            } catch (error) {
                element.muted = oldMuted;
                element.volume = oldVolume;
                console.warn('[audioManager] media unlock threw', error);
            }
        }
    }

    async function fetchAndDecode(path, { optional = false, retries = 2 } = {}) {
        const ctx = getContext();
        if (!ctx) return null;
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(urlFor(path, { retry: attempt }));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await ctx.decodeAudioData(await response.arrayBuffer());
            } catch (error) {
                lastError = error;
                if (attempt < retries) await new Promise(resolve => setTimeout(resolve, attempt ? 400 : 120));
            }
        }
        if (!optional) reportFailure(path, lastError, 'buffer');
        return null;
    }

    function loadBuffer(path, options = {}) {
        const key = String(path);
        if (buffers.has(key)) return buffers.get(key);
        const promise = fetchAndDecode(key, options);
        buffers.set(key, promise);
        return promise;
    }

    function preloadBuffers(paths, options = {}) {
        return Promise.allSettled([...new Set(paths)].map(path => loadBuffer(path, options)));
    }

    async function playBuffer(path, { volume = 1, channel = null, exclusive = false, optional = false } = {}) {
        const ctx = unlock();
        if (!ctx) return null;
        let token = null;
        if (channel && exclusive) {
            token = (channelTokens.get(channel) || 0) + 1;
            channelTokens.set(channel, token);
            const previous = activeChannels.get(channel);
            if (previous) {
                try { previous.stop(); } catch (_) {}
                activeChannels.delete(channel);
            }
        }

        const buffer = await loadBuffer(path, { optional });
        if (!buffer) return null;
        if (channel && exclusive && channelTokens.get(channel) !== token) return null;

        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Number(volume) || 0);
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(ctx.destination);
        activeSources.add(source);
        if (channel && exclusive) activeChannels.set(channel, source);
        source.onended = () => {
            activeSources.delete(source);
            if (channel && activeChannels.get(channel) === source) activeChannels.delete(channel);
            try { source.disconnect(); gain.disconnect(); } catch (_) {}
        };
        source.start();
        return source;
    }

    function stopChannel(channel) {
        channelTokens.set(channel, (channelTokens.get(channel) || 0) + 1);
        const source = activeChannels.get(channel);
        if (!source) return;
        try { source.stop(); } catch (_) {}
        activeChannels.delete(channel);
    }

    function stopAllBuffers() {
        for (const source of [...activeSources]) {
            try { source.stop(); } catch (_) {}
        }
        activeSources.clear();
        activeChannels.clear();
        for (const channel of channelTokens.keys()) channelTokens.set(channel, channelTokens.get(channel) + 1);
    }

    window.audioManager = {
        version: VERSION,
        urlFor,
        getContext,
        unlock,
        getMedia,
        peekMedia,
        forEachMedia,
        playMedia,
        unlockMediaElements,
        loadBuffer,
        preloadBuffers,
        playBuffer,
        stopChannel,
        stopAllBuffers,
        reportFailure,
        get bufferCacheSize() { return buffers.size; },
        get mediaCacheSize() { return media.size; },
    };
})();
// audio.js
window.audioEnabled = false; // Muted by default

window.audioSettings = {
    master: 1.0,
    music: 0.7,
    effects: 0.8,
    dialogue: 1.0
};

const TRACK_DEFS = {
    title: { path: 'audio/Title.m4a', loop: true },
    constant: { path: 'audio/Constant.m4a', loop: true },
    lobby: { path: 'audio/Arena lobby.m4a', loop: true },
    preBattle: { path: 'audio/Arena pre battle.m4a', loop: true },
    battle: { path: 'audio/Arena battle.m4a', loop: true },
    sting: { path: 'audio/Arena battle sting.m4a', loop: false },
    teleportSting: { path: 'audio/Arenalobby2arena.m4a', loop: false },
    deathSting: { path: 'audio/Arena death sting.m4a', loop: false },
    deathTheme: { path: 'audio/Arena death.m4a', loop: true },
    // Campaign 2 still has no dedicated combat-start recording; reuse the
    // existing sting until a purpose-built asset is recorded.
    combatStartSting: { path: 'audio/Arena battle sting.m4a', loop: false }
};

function manager() {
    return window.audioManager || null;
}

function getTrack(name) {
    const def = TRACK_DEFS[name];
    if (!def) return null;
    const m = manager();
    if (!m) {
        console.error('audioManager bootstrap missing');
        return null;
    }
    return m.getMedia(`track:${name}`, def.path, { loop: def.loop, preload: 'auto' });
}

function peekTrack(name) {
    return manager()?.peekMedia(`track:${name}`) || null;
}

// iOS Safari/WKWebView requires both long-lived HTML media and Web Audio to
// be unlocked from a real user gesture. Track elements remain lazy until the
// player actually enables audio; this function creates/unlocks them then.
let audioTracksUnlocked = false;
function unlockAudioTracks() {
    const m = manager();
    if (!m) return;
    m.unlock();
    if (audioTracksUnlocked) return;
    audioTracksUnlocked = true;
    // Constant starts audibly below in this same gesture, so do not include
    // it in the muted unlock pass (whose async completion would otherwise
    // pause it again after playback had begun).
    const elements = Object.keys(TRACK_DEFS)
        .filter(name => name !== 'constant')
        .map(getTrack)
        .filter(Boolean);
    m.unlockMediaElements(elements);
}
window.unlockAudioTracks = unlockAudioTracks;

function safePlay(audio, label) {
    return manager()?.playMedia(audio, label) || null;
}

window.setAudioEnabled = function(enabled) {
    window.audioEnabled = !!enabled;
    const m = manager();
    if (!window.audioEnabled) {
        m?.forEachMedia(audio => {
            audio.pause();
            audio.volume = 0;
        });
        m?.stopAllBuffers();
        return;
    }

    // Keep all unlock work synchronous with the checkbox/tap handler. The
    // music director uses this same shared AudioContext.
    unlockAudioTracks();
    if (typeof window.unlockMusicDirectorAudio === 'function') window.unlockMusicDirectorAudio();
    window.updateVolumes();

    // Warm tiny combat effects once audio is enabled so the first parry does
    // not pay network/decode latency. This does not run while muted.
    m?.preloadBuffers([
        'audio/effects/parry.wav',
        'audio/effects/parry2.wav'
    ]).catch(() => {});

    const constant = getTrack('constant');
    if (constant) safePlay(constant, 'constant');
};

window.updateVolumes = function() {
    const master = window.audioSettings.master;
    const musicVol = master * window.audioSettings.music;
    ['title', 'lobby', 'preBattle', 'battle', 'deathTheme'].forEach(name => {
        const track = peekTrack(name);
        if (track && (track.volume > 0 || !track.paused)) track.volume = musicVol;
    });
    const constant = peekTrack('constant');
    if (constant) constant.volume = musicVol * 0.001;
};

window.playMusic = function(trackName, fadeUp = 0.8, fadeDown = 0.6) {
    if (!window.audioEnabled) return;
    if (!TRACK_DEFS[trackName]) {
        console.error(`Unknown music track: ${trackName}`);
        return;
    }
    const track = getTrack(trackName);
    if (!track) return;
    if (!track.paused && track.volume > 0.01) return;

    for (const key of Object.keys(TRACK_DEFS)) {
        if (key === 'constant' || key === trackName) continue;
        const other = peekTrack(key);
        if (other) fadeOut(other, fadeDown);
    }
    fadeIn(track, fadeUp, trackName);
};

window.playSting = function(stingName = 'sting') {
    if (!window.audioEnabled) return;
    const actual = TRACK_DEFS[stingName] ? stingName : 'sting';
    const sting = getTrack(actual);
    if (!sting) return;
    try { sting.currentTime = 0; } catch (_) {}
    sting.volume = window.audioSettings.master * window.audioSettings.effects;
    safePlay(sting, actual);
};

function fadeIn(audio, duration, label = 'music') {
    if (!window.audioEnabled || !audio) return;
    const targetVol = window.audioSettings.master * window.audioSettings.music;
    audio.volume = 0;
    safePlay(audio, label);

    const steps = 20;
    const interval = (duration * 1000) / steps;
    const volStep = targetVol / steps;
    let currentStep = 0;
    const timer = setInterval(() => {
        currentStep++;
        audio.volume = Math.min(targetVol, currentStep * volStep);
        if (currentStep >= steps) clearInterval(timer);
    }, interval);
}

function fadeOut(audio, duration, stopAfter = true) {
    if (!audio) return;
    if (audio.paused || audio.volume <= 0) {
        if (stopAfter) {
            audio.pause();
            try { audio.currentTime = 0; } catch (_) {}
        }
        return;
    }

    const steps = 20;
    const interval = (duration * 1000) / steps;
    const volStep = audio.volume / steps;
    let currentStep = 0;
    const timer = setInterval(() => {
        currentStep++;
        audio.volume = Math.max(0, audio.volume - volStep);
        if (currentStep >= steps) {
            clearInterval(timer);
            if (stopAfter) {
                audio.pause();
                try { audio.currentTime = 0; } catch (_) {}
            }
        }
    }, interval);
}

window.stopAllMusic = function(duration = 0.8) {
    for (const key of Object.keys(TRACK_DEFS)) {
        if (key === 'constant') continue;
        const track = peekTrack(key);
        if (track) fadeOut(track, duration);
    }
};

window.playArenaMusic = (type, fade) => window.playMusic(type, fade);

setInterval(() => {
    const shouldPlayLobby = window.audioEnabled &&
        window.currentCampaign === '1' &&
        !window.isInArena &&
        !window.isInCombat;
    if (!shouldPlayLobby) return;
    const lobby = getTrack('lobby');
    if (lobby?.paused) window.playMusic('lobby', 0.8, 0.6);
}, 500);

window.playDialogue = function(key) {
    if (!window.audioEnabled || !key) return;
    const volume = window.audioSettings.master * window.audioSettings.dialogue;
    manager()?.playBuffer(`audio/dialogue/${key}.m4a`, {
        volume,
        channel: 'dialogue',
        exclusive: true
    });
};

window.playParrySound = function() {
    if (!window.audioEnabled) return;
    const sound = Math.random() < 0.5 ? 'parry' : 'parry2';
    const volume = window.audioSettings.master * window.audioSettings.effects;
    manager()?.playBuffer(`audio/effects/${sound}.wav`, { volume });
};
