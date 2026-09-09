// audio.js
window.audioEnabled = false; // Muted by default

window.audioSettings = {
    master: 1.0,
    music: 0.7,
    effects: 0.8,
    dialogue: 1.0
};

const tracks = {
    title: new Audio('audio/Title.wav'),
    constant: new Audio('audio/Constant.wav'),
    lobby: new Audio('audio/Arena lobby.m4a'),
    preBattle: new Audio('audio/Arena pre battle.wav'),
    battle: new Audio('audio/Arena battle.wav'),
    sting: new Audio('audio/Arena battle sting.wav'),
    teleportSting: new Audio('audio/Arenalobby2arena.wav'),
    deathSting: new Audio('audio/Arena death sting.wav'),
    deathTheme: new Audio('audio/Arena death.wav'),
    // ROADMAP E4: a one-shot brass hit on combat start in Campaign 2,
    // layered over musicDirector.js's own combat ramp rather than
    // replacing it (see gameEngine.js's isInCombat transition). Missing
    // like every other stem: playSting silently no-ops on a 0-length/
    // unloaded file, same as the arena stings above when their .wav isn't
    // present yet.
    combatStartSting: new Audio('audio/music/combat_start_sting.wav')
};

// Loop the main themes
tracks.title.loop = true;
tracks.constant.loop = true;
tracks.lobby.loop = true;
tracks.preBattle.loop = true;
tracks.battle.loop = true;
tracks.deathTheme.loop = true;

// iOS Safari/WKWebView requires HTMLMediaElement.play() to be initiated by a
// real user gesture before later game-driven play() calls are reliably
// allowed. Chrome desktop is much more permissive, which can hide this bug.
// Unlock every long-lived track when the player first enables audio. The
// unlock play is muted and immediately paused/reset, so it is inaudible.
let audioTracksUnlocked = false;
function unlockAudioTracks() {
    if (audioTracksUnlocked) return;
    audioTracksUnlocked = true;

    for (const [name, audio] of Object.entries(tracks)) {
        const wasMuted = audio.muted;
        const oldVolume = audio.volume;
        audio.muted = true;
        audio.volume = 0;
        try {
            const p = audio.play();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    audio.pause();
                    try { audio.currentTime = 0; } catch (_) {}
                    audio.muted = wasMuted;
                    audio.volume = oldVolume;
                }).catch(err => {
                    audio.muted = wasMuted;
                    audio.volume = oldVolume;
                    console.warn(`Audio unlock failed for ${name}:`, err);
                    audioTracksUnlocked = false;
                });
            } else {
                audio.pause();
                try { audio.currentTime = 0; } catch (_) {}
                audio.muted = wasMuted;
                audio.volume = oldVolume;
            }
        } catch (err) {
            audio.muted = wasMuted;
            audio.volume = oldVolume;
            audioTracksUnlocked = false;
            console.warn(`Audio unlock threw for ${name}:`, err);
        }
    }
}
window.unlockAudioTracks = unlockAudioTracks;

function safePlay(audio, label) {
    try {
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
            p.catch(err => console.error(`Failed to play audio: ${label}`, err));
        }
        return p;
    } catch (err) {
        console.error(`Failed to play audio: ${label}`, err);
        return null;
    }
}

window.setAudioEnabled = function(enabled) {
    window.audioEnabled = enabled;
    if (!enabled) {
        for (const key in tracks) {
            tracks[key].pause();
            tracks[key].volume = 0;
        }
    } else {
        // This function is normally called directly from the player's mute
        // checkbox tap/click, so perform the iOS unlock synchronously here.
        unlockAudioTracks();
        window.updateVolumes();
        safePlay(tracks.constant, 'constant');
    }
};

window.updateVolumes = function() {
    const master = window.audioSettings.master;
    // Music tracks
    const musicVol = master * window.audioSettings.music;
    ['title', 'lobby', 'preBattle', 'battle', 'deathTheme'].forEach(k => {
        if (tracks[k].volume > 0 || !tracks[k].paused) tracks[k].volume = musicVol;
    });
    
    // Constant is music but special low volume
    tracks.constant.volume = musicVol * 0.001; // Extremely low (20% of previous 0.005)
};

window.playMusic = function(trackName, fadeUp = 0.8, fadeDown = 0.6) {
    if (!window.audioEnabled) return;
    const track = tracks[trackName];
    if (!track) {
        console.error(`Unknown music track: ${trackName}`);
        return;
    }
    
    // If already playing, don't restart
    if (!track.paused && track.volume > 0.01) return;

    // Fade out everything else except constant
    for (const key in tracks) {
        if (key !== 'constant' && key !== trackName) {
            fadeOut(tracks[key], fadeDown);
        }
    }

    fadeIn(track, fadeUp, trackName);
};

window.playSting = function(stingName = 'sting') {
    if (!window.audioEnabled) return;
    const s = tracks[stingName] || tracks['sting'];
    s.currentTime = 0;
    s.volume = window.audioSettings.master * window.audioSettings.effects;
    safePlay(s, stingName);
};

function fadeIn(audio, duration, label = 'music') {
    if (!window.audioEnabled) return;
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
    if (audio.paused || audio.volume <= 0) {
        if (stopAfter) { audio.pause(); audio.currentTime = 0; }
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
                audio.currentTime = 0;
            }
        }
    }, interval);
}

window.stopAllMusic = function(duration = 0.8) {
    for (const key in tracks) {
        if (key !== 'constant') {
            fadeOut(tracks[key], duration);
        }
    }
};

// Aliases for compatibility
window.playArenaMusic = (type, fade) => window.playMusic(type, fade);

window.playDialogue = function(key) {
    if (!window.audioEnabled) return;
    const audio = new Audio(`audio/dialogue/${key}.wav`);
    audio.volume = window.audioSettings.master * window.audioSettings.dialogue;
    safePlay(audio, `dialogue/${key}`);
};

window.playParrySound = function() {
    if (!window.audioEnabled) return;
    const sound = Math.random() < 0.5 ? 'parry' : 'parry2';
    const audio = new Audio(`audio/effects/${sound}.wav`);
    audio.volume = window.audioSettings.master * window.audioSettings.effects;
    safePlay(audio, `effects/${sound}`);
};
