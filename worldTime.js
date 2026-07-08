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

        // The necromancer achieves lichdom despite the crypt's fall: a few
        // days after necromancer_hunt resolves, word reaches Reddale that
        // whatever Corvin Ashgrave was building toward, it finished anyway. Gates
        // Captain Rennick's necromancer_lichdom offer (campaign2Dialogue.js).
        if (window.necromancerDefeated && !window.lichRisenNewsReady) {
            const daysSince = (window.worldSeconds - (window.necromancerDefeatedAt || 0)) / (24 * 3600);
            if (daysSince >= 3) {
                window.lichRisenNewsReady = true;
                window.showMessage("Word reaches you from Reddale: something crawled out of that crypt after all. It has a name now — Corvin Ashgrave — and it isn't finished.");
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

        // Sweep dead random-encounter wildlife the player has left far behind
        // (see pruneDistantEncounterCorpses, campaign2Dialogue.js) — keeps
        // window.entities from growing unbounded over a long session.
        if (window.pruneDistantEncounterCorpses && p) {
            window.pruneDistantEncounterCorpses(p, delta);
        }

        // Forget local fog-of-war memory for hexes far behind the player —
        // keeps exploredHexes/lastSeenTimeMap (and the save file) from
        // growing with total distance traveled instead of total world state
        // actually changed (see pruneDistantExploredHexes, campaign2Dialogue.js).
        if (window.pruneDistantExploredHexes && p) {
            window.pruneDistantExploredHexes(p, delta);
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

        // Reddale espionage side-quests: fails the active stealth mission
        // (if any) the moment its guard actually sees the player — see
        // espionageQuests.js.
        if (window.checkStealthMissionStatus) window.checkStealthMissionStatus(delta);

        // Ironbond's retaliation, once you've burned them badly enough
        // spying for the Baron — see espionageQuests.js.
        if (window.checkGuildAssassinTrigger) window.checkGuildAssassinTrigger();
        if (window.checkGuildAssassinTail) window.checkGuildAssassinTail(delta);

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

// Season, for foliage color — derived from the *same* solstice positions
// getLightLevel's day-length formula already uses (mo=5 is the longest-day
// summer peak, mo=11 is the shortest-day winter trough), not from the month
// names themselves. A couple of names read a little backwards against that
// (Redleaf(5) is functionally high summer; Greenbud(11) is functionally
// deep winter) — a pre-existing quirk of the calendar's naming, not
// something this feeds off; the actual daylight-length math is the source
// of truth so the seasonal palette never contradicts how long the days are.
// Quantized to the whole month (not day-of-month) so getRecoloredHairSprite's
// cache only ever needs to hold 12 variants per source sprite.
const LEAF_SEASON_KEYFRAMES = [
    { t: 0,    hue: 100, sat: 1.0,  light: 1.0  }, // mo5 - full summer green
    { t: 2,    hue: 95,  sat: 0.9,  light: 1.0  }, // mo7 - still green
    { t: 3.5,  hue: 40,  sat: 1.1,  light: 1.05 }, // mo8.5 - turning orange
    { t: 5,    hue: 15,  sat: 1.1,  light: 0.9  }, // mo10 - red/rust peak
    { t: 6,    hue: 30,  sat: 0.4,  light: 0.6  }, // mo11 - winter trough, bare/brown
    { t: 8,    hue: 30,  sat: 0.4,  light: 0.6  }, // mo1 - still winter-bare
    { t: 9.5,  hue: 90,  sat: 0.6,  light: 0.75 }, // mo2.5 - budding green returns
    { t: 11,   hue: 100, sat: 0.95, light: 0.98 }, // mo4 - nearly full green
    { t: 12,   hue: 100, sat: 1.0,  light: 1.0  }, // wraps back to mo5
];
function getSeasonalLeafTint() {
    const totalD = Math.floor(window.worldSeconds / 86400);
    const mo = Math.floor(totalD / 30) % 12;
    const t = (mo - 5 + 12) % 12; // 0 at mo5 (summer peak), 6 at mo11 (winter trough)
    let a = LEAF_SEASON_KEYFRAMES[0], b = LEAF_SEASON_KEYFRAMES[LEAF_SEASON_KEYFRAMES.length - 1];
    for (let i = 0; i < LEAF_SEASON_KEYFRAMES.length - 1; i++) {
        if (t >= LEAF_SEASON_KEYFRAMES[i].t && t <= LEAF_SEASON_KEYFRAMES[i + 1].t) {
            a = LEAF_SEASON_KEYFRAMES[i]; b = LEAF_SEASON_KEYFRAMES[i + 1];
            break;
        }
    }
    const span = b.t - a.t || 1;
    const f = (t - a.t) / span;
    return {
        hue: a.hue + (b.hue - a.hue) * f,
        sat: a.sat + (b.sat - a.sat) * f,
        light: a.light + (b.light - a.light) * f,
    };
}
window.getSeasonalLeafTint = getSeasonalLeafTint;

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
