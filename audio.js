// audio.js
window.audioEnabled = false; // Muted by default

const tracks = {
    preBattle: new Audio('audio/Arena pre battle.wav'),
    battle: new Audio('audio/Arena battle.wav'),
    sting: new Audio('audio/Arena battle sting.wav')
};

// Loop the main themes
tracks.preBattle.loop = true;
tracks.battle.loop = true;

let fadeInterval = null;

window.setAudioEnabled = function(enabled) {
    window.audioEnabled = enabled;
    if (!enabled) {
        for (const key in tracks) {
            tracks[key].pause();
            tracks[key].volume = 0;
        }
    } else {
        // If we are in arena, we might need to kick off current logic
        // But usually, the user toggles this and then plays.
    }
};

window.playArenaMusic = function(type, fadeTime = 0.8) {
    if (!window.audioEnabled) return;

    const targetTrack = type === 'battle' ? tracks.battle : tracks.preBattle;
    const otherTrack = type === 'battle' ? tracks.preBattle : tracks.battle;

    // Fade out other
    fadeOut(otherTrack, 0.6);

    // Fade in target
    fadeIn(targetTrack, fadeTime);
};

window.playSting = function() {
    if (!window.audioEnabled) return;
    tracks.sting.currentTime = 0;
    tracks.sting.volume = 1.0;
    tracks.sting.play();
};

function fadeIn(audio, duration) {
    if (!window.audioEnabled) return;
    audio.volume = 0;
    audio.play();
    
    const steps = 20;
    const interval = (duration * 1000) / steps;
    const volStep = 1 / steps;

    let currentStep = 0;
    const timer = setInterval(() => {
        currentStep++;
        audio.volume = Math.min(1, currentStep * volStep);
        if (currentStep >= steps) clearInterval(timer);
    }, interval);
}

function fadeOut(audio, duration, stopAfter = true) {
    if (audio.paused) return;
    
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
    fadeOut(tracks.preBattle, duration);
    fadeOut(tracks.battle, duration);
};
