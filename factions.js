// factions.js
// Faction & NPC reputation system. Two axes tracked toward the player:
//   knowledge (0-100): how well they know the player
//   standing  (-100 to 100): how much they like/dislike the player
// Standing seeds at +5 for same-race NPCs/factions, 0 otherwise. As knowledge
// grows, standing swings are dampened (harder to move, never frozen).

window.factions = {
    silverhart_kingdom: { id: 'silverhart_kingdom', name: 'The Silverhart Kingdom', race: 'human', knowledge: 0, standing: 0 },
    ironbond_company:   { id: 'ironbond_company',   name: 'The Ironbond Company',   race: 'human', knowledge: 0, standing: 0 }
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

window.seedStanding = seedStanding;
window.adjustReputation = adjustReputation;
window.seedFactionStandings = seedFactionStandings;
window.cascadeReputation = cascadeReputation;
