// factions.js
// Faction & NPC reputation system. Two axes tracked toward the player:
//   knowledge (0-100): how well they know the player
//   standing  (-100 to 100): how much they like/dislike the player
// Standing seeds at +5 for same-race NPCs/factions, 0 otherwise. As knowledge
// grows, standing swings are dampened (harder to move, never frozen).

// Fixed floor a faction's standing gets trashed to once a double-cross quest
// (see campaign2Dialogue.js's reddale_baron/reddale_guildmaster) reveals the
// player was secretly working for their rival all along.
window.FACTION_DOUBLE_CROSS_STANDING = -40;

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
    // Narratively, the Skarn-tooth tribe isn't its own power — it's a
    // scouting warband sent out by the orc horde (see nix_sharpear's
    // "someone with a lot more banners than we've got" line and the
    // goblin_scout_note breadcrumb) to watch Hollowmere's roads ahead of
    // the Border War. adjustReputation below cascades a dampened fraction
    // of every goblin_tribe swing onto orc_raiders for exactly that reason.
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
    // Reddale's espionage side-quests (spy_on_guild/spy_on_baron, see
    // espionageQuests.js/campaign2Dialogue.js) are also Ironbond content —
    // the same Company straining for influence against the Baron/kingdom
    // there as in Hollowmere, not a separate guild. Its Reddale guildhouse
    // and the hired-assassin retaliation both key off ironbond_company
    // above, not a second faction entry.
    // The Deepholds: the dwarven kingdom, one mountain city-and-mine
    // (Kragmoor) tucked in the NW mountain range (see buildDwarvenKingdom,
    // campaign2World.js, and worldMap.js's reserved MOUNTAIN block). Its
    // ambassador already sat at Silverhart's court (dwarven_ambassador,
    // campaign2Dialogue.js) well before this kingdom existed in the world —
    // that quest thread now actually leads somewhere.
    dwarven_kingdom:    { id: 'dwarven_kingdom',    name: 'The Deepholds',          race: 'dwarf', knowledge: 0, standing: 0 }
};

function seedStanding(race, playerRace) {
    if (race === playerRace) return 5;
    // A goblin player starts distrusted by the "civilized" races on sight,
    // but is kin-adjacent to the other greenskins right away.
    if (playerRace === 'goblin') {
        if (race === 'orc') return 15;
        if (race === 'human' || race === 'elf' || race === 'dwarf') return -15;
    }
    // Mirror of the above: an orc player is kin-adjacent to the goblins
    // (the tribe scouts for the horde they're now playing a part of), and
    // distrusted by the "civilized" races on sight, same as a goblin player.
    if (playerRace === 'orc') {
        if (race === 'goblin') return 15;
        if (race === 'human' || race === 'elf' || race === 'dwarf') return -15;
    }
    return 0;
}

// dampening: 1.0 at knowledge=0 (full-strength first impressions), down to a
// 0.3 floor at knowledge=100 (well-known relationships are hard to shift, but
// never inert).
function adjustReputation(target, standingDelta, knowledgeDelta) {
    if (!target) return;
    const dampening = 1 - (target.knowledge / 100) * 0.7;
    target.standing = Math.max(-100, Math.min(100, target.standing + standingDelta * dampening));
    target.knowledge = Math.max(0, Math.min(100, target.knowledge + (knowledgeDelta || 0)));
    // The Skarn-tooth tribe reports back to the horde it scouts for — any
    // swing in standing toward/against them is heard about by orc_raiders
    // too, just muted (they're one scouting party's word, not the whole
    // horde's). Recurse rather than reimplementing the dampening math, and
    // guard against the reverse case (this is never called the other way).
    if (target === window.factions?.goblin_tribe && window.factions?.orc_raiders) {
        adjustReputation(window.factions.orc_raiders, standingDelta * 0.35, (knowledgeDelta || 0) * 0.35);
    }
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

// Villain-path commerce gating: human-kingdom merchants (Silverhart's
// stable/clothier/magic dealer, the Hollowmere general store, the
// mercenary broker) refuse an overtly evil player outright rather than
// silently charging them anyway — but each has a matching alternative
// (the goblin camp's own trader once allied, the Bone Trader once you've
// gone down the lich path) so neither path locks the player out of gear,
// mounts, or hired muscle entirely, just redirects where they get it.
window.isGoblinAligned = function() {
    const q = (window.questLog || []).find(x => x.id === 'goblin_threat');
    return !!(window.playerAidingGreenskins || q?.resolution === 'goblin_alliance');
};
// A goblin-race player is never just "aligned" with the tribe — they *are*
// greenskin kin from the moment they're created (see seedStanding above),
// independent of how the goblin_threat quest ever resolves. Shunned by
// human commerce by default, same as an overtly evil player, until they've
// actually earned Elder Marta's vouching (resolveGoblinSpyForHumans,
// campaign2Dialogue.js) — the goblin-side mirror of a human player earning
// the tribe's trust via diplomacy.
window.isPlayerGoblin = function() {
    return !!(window.party && window.party[0] && window.party[0].race === 'goblin');
};
// An orc player gets the exact same "outsider on sight, redeemable through
// Prove Your Worth" treatment as a goblin player (see marta_wynfield/
// silverhart_queen, campaign2Dialogue.js) — isPlayerGreenskin is the shared
// predicate those checks use instead of isPlayerGoblin alone.
window.isPlayerOrc = function() {
    return !!(window.party && window.party[0] && window.party[0].race === 'orc');
};
window.isPlayerGreenskin = function() {
    return window.isPlayerGoblin() || window.isPlayerOrc();
};
window.isShunnedByHumanCommerce = function() {
    return !!(window.playerIsLich || window.isGoblinAligned() || (window.isPlayerGreenskin() && !window.goblinVouchedByMarta));
};

window.seedStanding = seedStanding;
window.adjustReputation = adjustReputation;
window.seedFactionStandings = seedFactionStandings;
window.cascadeReputation = cascadeReputation;
window.adjustMerchantInfluence = adjustMerchantInfluence;
window.tickFactionAgendas = tickFactionAgendas;
