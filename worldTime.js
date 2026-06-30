// worldTime.js

window.worldSeconds = 0; // Total accumulated seconds

const MONTH_NAMES = [
    "Dawnfrost", "Brightsun", "Highbloom", "Goldfield", 
    "Harvest", "Redleaf", "Rainfall", "Shadowfell", 
    "Deepwinter", "Starrynight", "Frostmelt", "Greenbud"
];

// Campaign 2: hex-local indoor lighting. Recomputes window.indoorLightMult
// each tick based on whether the player's current hex falls inside a
// registered interior region, instead of a global on/off flag like the
// arena's isInArena-driven lighting.
function computeIndoorLightMult() {
    if (!window.interiorRegions || window.interiorRegions.length === 0) return 1.0;
    const p = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    if (!p || !p.hex) return 1.0;
    const region = window.interiorRegions.find(r =>
        p.hex.q >= r.minQ && p.hex.q <= r.maxQ && p.hex.r >= r.minR && p.hex.r <= r.maxR
    );
    return region ? region.lightMult : 1.0;
}

function updateTime(delta) {
    window.worldSeconds += delta;
    if (window.currentCampaign === '2') {
        window.indoorLightMult = computeIndoorLightMult();
    }
    window.lightLevel = getLightLevel() * (window.indoorLightMult !== undefined ? window.indoorLightMult : 1.0);
    
    // Fatigue tracking
    if (window.entities) {
        window.entities.forEach(e => {
            if (e.alive) {
                if (window.isSleeping && e.side === 'player') {
                    if (e.sleepRemainingSeconds > 0) {
                        e.sleepRemainingSeconds = Math.max(0, e.sleepRemainingSeconds - delta);
                    }
                    // If they are sleeping, they aren't getting more fatigued
                } else {
                    e.awakeSeconds += delta;
                }
            }
        });
    }

    renderTime();
}

function getLightLevel() {
    const totalS = window.worldSeconds;
    const dayS = 24 * 3600;
    const timeOfDay = totalS % dayS;
    
    // Month 0-11. 2-7 are summer-ish (longer days).
    const totalD = Math.floor(totalS / dayS);
    const mo = Math.floor((totalD / 30) % 12);
    
    // Day length: base 12 hours +/- 4 hours variation
    // Peak summer (mo=5) -> +4 hrs. Peak winter (mo=11) -> -4 hrs.
    const seasonalShift = 4 * Math.cos(Math.PI * (mo - 5) / 6);
    const halfDayLength = (6 + seasonalShift) * 3600;
    const noon = 12 * 3600;

    const distFromNoon = Math.abs(timeOfDay - noon);
    
    if (distFromNoon < halfDayLength * 0.8) return 1.0; // Full day
    if (distFromNoon > halfDayLength * 1.2) return 0.2; // Full night

    // Transition (Dawn/Dusk)
    const t = (distFromNoon - halfDayLength * 0.8) / (halfDayLength * 0.4);
    return 1.0 - (t * 0.8); // Smoothly slide from 1.0 to 0.2
}

function getFormattedTime() {
    const totalS = Math.floor(window.worldSeconds);
    
    let s = totalS % 60;
    let totalM = Math.floor(totalS / 60);
    let m = totalM % 60;
    let totalH = Math.floor(totalM / 60);
    let h = totalH % 24;
    let totalD = Math.floor(totalH / 24);
    let d = (totalD % 30) + 1; // 1-30
    let totalMo = Math.floor(totalD / 30);
    let mo = (totalMo % 12); // 0-11 for index
    let y = Math.floor(totalMo / 12) + 1000; // Start at year 1000

    const pad = (n) => n.toString().padStart(2, '0');

    return `${y}/${MONTH_NAMES[mo]}/${pad(d)} ${pad(h)}:${pad(m)}:${pad(s)}`;
}

function renderTime() {
    const timeDiv = document.getElementById("world-time-display");
    if (timeDiv) {
        timeDiv.innerText = getFormattedTime();
    }
}

window.updateTime = updateTime;
window.getFormattedTime = getFormattedTime;
