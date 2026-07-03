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
function findInteriorRegion(hex) {
    if (!window.interiorRegions || window.interiorRegions.length === 0 || !hex) return null;
    return window.interiorRegions.find(r =>
        hex.q >= r.minQ && hex.q <= r.maxQ && hex.r >= r.minR && hex.r <= r.maxR
    ) || null;
}

function computeIndoorLightMult() {
    const p = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    const region = p ? findInteriorRegion(p.hex) : null;
    if (!region) return 1.0;

    // An open door lets daylight spill in — boosted by how bright it is
    // outside right now, not just a flat indoor floor value.
    const doorOpen = region.doorHex && window.getTerrainAt(region.doorHex.q, region.doorHex.r).name !== 'Wall';
    const daylightSpill = doorOpen ? getLightLevel() * 0.5 : 0;
    return Math.min(1, region.lightMult + daylightSpill);
}

let _wasPlayerInsideInterior = true;

function updateTime(delta) {
    window.worldSeconds += delta;
    if (window.currentCampaign === '2') {
        window.indoorLightMult = computeIndoorLightMult();

        // Detect the player crossing from inside a registered interior region
        // back out to the exterior — used to trigger events tied to "leaving
        // the tavern" (e.g. the Ironbond quest offer) rather than a hex-poll
        // scattered across content files.
        const p = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
        const isInsideNow = !!(p && findInteriorRegion(p.hex));
        if (_wasPlayerInsideInterior && !isInsideNow) {
            if (window.hollowmereSoldiersWaitingOutside && window.triggerHollowmereQuestOffer) {
                window.triggerHollowmereQuestOffer();
            }
        }
        _wasPlayerInsideInterior = isInsideNow;

        // Oskar's Wager: a friendly, non-lethal duel. Watched here (rather
        // than hooked into the shared attack-resolution code) so it can end
        // safely the moment Oskar drops below the threshold, without any
        // risk of the generic combat/death code treating it as a real kill.
        if (window.oskarDuelActive) {
            const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
            if (oskar && oskar.alive && oskar.hp <= oskar.maxHp * 0.7 && window.endOskarDuel) {
                window.endOskarDuel();
            }
        }

        // The Missing Boy: wandering within range of Tam's last-known spot
        // out along the west road resolves the encounter (see
        // campaign2Dialogue.js's triggerMissingChildEncounter for the
        // wolves-vs-corpse time gate).
        if (window.campaign2TamEncounterHex && window.triggerMissingChildEncounter && p) {
            const quest = (window.questLog || []).find(q => q.id === 'missing_child');
            if (quest && quest.status === 'active' && !quest.encounterState &&
                window.distance(p.hex, window.campaign2TamEncounterHex) <= 8) {
                window.triggerMissingChildEncounter();
            }
        }

        // Wolves at the Farm: wandering near Old Mac's pasture resolves the
        // scripted encounter (see campaign2Dialogue.js).
        if (window.campaign2FarmPastureCenter && window.triggerFarmWolfEncounter && p) {
            const quest = (window.questLog || []).find(q => q.id === 'farm_wolves');
            if (quest && quest.status === 'active' && !quest.encounterState &&
                window.distance(p.hex, window.campaign2FarmPastureCenter) <= 6) {
                window.triggerFarmWolfEncounter();
            }
        }

        // Random wilderness encounters (wolves) out past the village/farmland.
        if (window.checkWildernessEncounter && p) {
            window.checkWildernessEncounter(p, delta);
        }

        // Small orc raiding/scouting bands, weighted toward the east road.
        if (window.checkOrcRaiderEncounter && p) {
            window.checkOrcRaiderEncounter(p, delta);
        }

        // The abandoned house's skeletons are placed dormant at world-build
        // time (waking them all up immediately would make window.isInCombat
        // true for the whole game) and only aggro once the player actually
        // gets close.
        if (window.campaign2AbandonedHouseCenter && !window.campaign2AbandonedHouseTriggered && p &&
            window.distance(p.hex, window.campaign2AbandonedHouseCenter) <= 5) {
            window.campaign2AbandonedHouseTriggered = true;
            window.entities.filter(e => e.name === 'Skeleton' && e.alive).forEach(s => window.wakeUp(s));
        }

        // Ambient character personality lines (see characterBanter.js).
        if (window.checkCharacterBanter) window.checkCharacterBanter(delta);

        // Loose Ends: weeks after the tavern brawl, the Ironbond Company
        // sends someone to ask around (see campaign2Dialogue.js).
        if (window.triggerGuildInvestigatorEncounter) window.triggerGuildInvestigatorEncounter();

        // The Skarn-tooth Tribe: resolves itself once the chief dies in open
        // combat (the assassination path resolves separately, via dialogue —
        // see campaign2Dialogue.js), and Ser Aldric's patience with an
        // unresolved goblin problem wears down, very slowly, once he's
        // already in the party.
        if (window.checkGoblinAssaultResolution) window.checkGoblinAssaultResolution();

        // Ore Road Reopened: resolves once the ambush stragglers (if any) are down.
        if (window.checkEmberlodeEscortResolution) window.checkEmberlodeEscortResolution();
        if (window.tickCompanionPatience) window.tickCompanionPatience(delta);

        // Faction agendas advance on their own clock, independent of whether
        // the player is engaging with them (see factions.js).
        if (window.tickFactionAgendas) window.tickFactionAgendas(delta);

        // Region security/prosperity decay toward their (parent-influenced)
        // baselines on the same clock (see regions.js).
        if (window.tickRegions) window.tickRegions(delta);
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

// Fractional hour-of-day (e.g. 13.5 = 1:30pm) — used by the NPC daily
// schedule system (see updateNpcSchedules in gameEngine.js) so a schedule
// block can be as short as a few minutes without needing minute-level
// bookkeeping of its own.
function getCurrentHour() {
    const totalS = Math.floor(window.worldSeconds);
    const secondsIntoDay = totalS % 86400;
    return secondsIntoDay / 3600;
}
window.getCurrentHour = getCurrentHour;

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
window.getLightLevel = getLightLevel;
