// audio.js
window.audioEnabled = false; // Muted by default

const tracks = {
    title: new Audio('audio/Title.wav'),
    constant: new Audio('audio/Constant.wav'),
    lobby: new Audio('audio/Arena lobby.wav'),
    preBattle: new Audio('audio/Arena pre battle.wav'),
    battle: new Audio('audio/Arena battle.wav'),
    sting: new Audio('audio/Arena battle sting.wav'),
    teleportSting: new Audio('audio/Arenalobby2arena.wav'),
    deathSting: new Audio('audio/Arena death sting.wav'),
    deathTheme: new Audio('audio/Arena death.wav')
};

// Loop the main themes
tracks.title.loop = true;
tracks.constant.loop = true;
tracks.lobby.loop = true;
tracks.preBattle.loop = true;
tracks.battle.loop = true;
tracks.deathTheme.loop = true;

window.setAudioEnabled = function(enabled) {
    window.audioEnabled = enabled;
    if (!enabled) {
        for (const key in tracks) {
            tracks[key].pause();
            tracks[key].volume = 0;
        }
    } else {
        // Start constant track if enabled
        tracks.constant.volume = 0.5; // Lower constant volume
        tracks.constant.play();
        
        // If we are currently in a state that needs music, it will be triggered by UI/Game calls
    }
};

window.playMusic = function(trackName, fadeUp = 0.8, fadeDown = 0.6) {
    if (!window.audioEnabled) return;
    
    // If already playing, don't restart
    if (!tracks[trackName].paused && tracks[trackName].volume > 0.1) return;

    // Fade out everything else except constant
    for (const key in tracks) {
        if (key !== 'constant' && key !== trackName) {
            fadeOut(tracks[key], fadeDown);
        }
    }

    fadeIn(tracks[trackName], fadeUp);
};

window.playSting = function(stingName = 'sting') {
    if (!window.audioEnabled) return;
    const s = tracks[stingName] || tracks['sting'];
    s.currentTime = 0;
    s.volume = 1.0;
    s.play();
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
