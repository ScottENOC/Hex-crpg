// factions.js
// Faction & NPC reputation system. Two axes tracked toward the player:
//   knowledge (0-100): how well they know the player
//   standing  (-100 to 100): how much they like/dislike the player
// Standing seeds at +5 for same-race NPCs/factions, 0 otherwise. As knowledge
// grows, standing swings are dampened (harder to move, never frozen).

window.factions = {
    silverhart_kingdom: { id: 'silverhart_kingdom', name: 'The Silverhart Kingdom', race: 'human', knowledge: 0, standing: 0 },
    // merchantInfluence: the Company's grip on each kingdom it operates in
    // (0-100, keyed by kingdom id). Tracked from here on but not yet wired
    // into anything else in the world — quests can move it, nothing reads
    // it back yet.
    ironbond_company:   { id: 'ironbond_company',   name: 'The Ironbond Company',   race: 'human', knowledge: 0, standing: 0, merchantInfluence: { silverhart_kingdom: 30 } },
    // The goblin tribe camped west of Hollowmere. Its standing moves opposite
    // to the Silverhart Kingdom's on purpose in most quest resolutions —
    // strengthening/earning favor with the goblins tends to come at the
    // human kingdom's expense (see campaign2Dialogue.js's goblin questline).
    goblin_tribe:       { id: 'goblin_tribe',       name: 'The Skarn-tooth Tribe',  race: 'goblin', knowledge: 0, standing: 0 },
    // The necromancer haunting the abandoned house north of Millbrook.
    // Standing here is deliberately just reputation like any other faction
    // (return the phylactery-shard, defend townsfolk from their undead
    // minions, etc.) — no bespoke flags. Crossing standing thresholds is
    // what unlocks deeper quests, same as goblin_tribe's diplomacy path.
    necromancer_cult:   { id: 'necromancer_cult',   name: 'The Vessel-Seeker',      race: 'undead', knowledge: 0, standing: 0 },
    // Small orc raiding/scouting bands pressing in from the borderlands.
    // Currently pure wilderness-encounter flavor + reputation target for
    // "Eyes on the Border" — no camp/settlement of their own yet.
    orc_raiders:        { id: 'orc_raiders',        name: 'The Borderland Raiders', race: 'orc', knowledge: 0, standing: 0 },
    // Reddale's merchants guild, in a quiet standoff with the Baron over
    // tariffs and trade rights — see the espionage side-quests in
    // espionageQuests.js/campaign2Dialogue.js. Standing here and the
    // Baron's standing with silverhart_kingdom move in opposite directions
    // as the player picks a side, same convention as goblin_tribe vs the
    // kingdom.
    merchants_guild:    { id: 'merchants_guild',    name: 'The Reddale Merchants Guild', race: 'human', knowledge: 0, standing: 0 }
};

function seedStanding(race, playerRace) {
    return race === playerRace ? 5 : 0;
}

// dampening: 1.0 at knowledge=0 (full-strength first impressions), down to a
// 0.3 floor at knowledge=100 (well-known relationships are hard to shift, but
// never inert).
function adjustReputation(target, standingDelta, knowledgeDelta) {
    if (!target) return;
    const dampening = 1 - (target.knowledge / 100) * 0.7;
    target.standing = Math.max(-100, Math.min(100, target.standing + standingDelta * dampening));
    target.knowledge = Math.max(0, Math.min(100, target.knowledge + (knowledgeDelta || 0)));
}

function seedFactionStandings(playerRace) {
    for (const id in window.factions) {
        const f = window.factions[id];
        f.standing = seedStanding(f.race, playerRace);
    }
}

// Feudal reputation cascade: an action mostly affects the nearest tier (e.g.
// the person directly involved), with a shrinking ripple up the chain of
// authority above them (village elder -> baron -> kingdom). falloff=0.4 means
// each tier up feels ~40% of the tier below it — heavily dampened, not
// independent and not fully propagated. Pass targets in order from most to
// least directly involved; missing/undefined tiers (e.g. no baron placed
// yet) are simply skipped.
function cascadeReputation(chain, standingDelta, knowledgeDelta, falloff = 0.4) {
    chain.forEach((target, i) => {
        if (!target) return;
        const mult = Math.pow(falloff, i);
        adjustReputation(target, standingDelta * mult, knowledgeDelta * mult);
    });
}

// Nudges a faction's influence over one kingdom (clamped 0-100). Small,
// direct player-driven deltas (a quest outcome) go through here; the
// autonomous drift below also uses it so both paths stay clamped the same way.
function adjustMerchantInfluence(faction, kingdomId, delta) {
    if (!faction || !faction.merchantInfluence) return;
    const current = faction.merchantInfluence[kingdomId] || 0;
    faction.merchantInfluence[kingdomId] = Math.max(0, Math.min(100, current + delta));
}

// Autonomous agenda ticking: each faction here nudges its own world-state
// (currently just merchantInfluence) on its own clock, independent of
// whether the player is engaging with it at all. If the player never
// touches the Ironbond thread, this is what keeps it moving instead of
// freezing in place.
window.factionAgendas = {
    ironbond_company: {
        // Drift is intentionally tiny and driven by the Company's own
        // standing trend (a proxy for "is it currently thriving or
        // struggling"), not by anything the player has to manage directly.
        tick(deltaSeconds) {
            const f = window.factions.ironbond_company;
            if (!f) return;
            const drift = f.standing > 10 ? 0.02 : f.standing < -10 ? -0.02 : 0;
            if (!drift) return;
            const hours = deltaSeconds / 3600;
            for (const kingdomId in f.merchantInfluence) {
                adjustMerchantInfluence(f, kingdomId, drift * hours);
            }
        }
    }
};

function tickFactionAgendas(deltaSeconds) {
    for (const id in window.factionAgendas) {
        window.factionAgendas[id].tick(deltaSeconds);
    }
}

window.seedStanding = seedStanding;
window.adjustReputation = adjustReputation;
window.seedFactionStandings = seedFactionStandings;
window.cascadeReputation = cascadeReputation;
window.adjustMerchantInfluence = adjustMerchantInfluence;
window.tickFactionAgendas = tickFactionAgendas;
