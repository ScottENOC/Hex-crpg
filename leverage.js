// leverage.js
// Generic "read the room" + leverage-gated dialogue support for any NPC with
// a `wants` field. Insight rank (and any world clues an NPC exposes via
// leverageClues()) determine how much gets revealed; risky options (bribes,
// threats) are only ever surfaced once there's enough signal to justify them
// — guessing blind is never presented as a choice.

function getInsightRank(player) {
    return (player && player.skills && player.skills['insight']) || 0;
}

function getPersuasionDiscount(player) {
    const rank = (player && player.skills && player.skills['persuasion']) || 0;
    return Math.min(rank * 5, 15);
}

// Combines Insight rank with any world clue the NPC exposes into one signal:
// 0 = nothing, 1 = partial (enough to know *something* might work), 2 = full (know exactly what).
function getLeverageSignal(npc, player) {
    const insight = getInsightRank(player);
    const insightSignal = insight >= 3 ? 2 : (insight >= 1 ? 1 : 0);
    const clueSignal = (npc.leverageClues && npc.leverageClues()) || 0;
    return Math.max(insightSignal, clueSignal);
}

function readTheRoom(npc, player) {
    const signal = getLeverageSignal(npc, player);
    if (!npc.wants) {
        return { text: npc.incorruptibleFlavor || "They don't seem the type to be swayed by anything you could offer.", signal: 2 };
    }
    if (signal >= 2) {
        return { text: npc.wants.fullHint || `They want ${npc.wants.description || 'something'}.`, signal };
    }
    if (signal >= 1) {
        return { text: npc.wants.partialHint || "You get the sense there's something that could sway them, though you can't say what exactly.", signal };
    }
    return { text: npc.vagueFlavor || "Hard to get a read on them.", signal: 0 };
}

// Only ever returns options once there's enough signal (>=1) to know it's
// safe to try — a player with no Insight and no clues simply never sees a
// risky option at all, rather than being invited to gamble blind.
function getLeverageOptions(npc, player) {
    const signal = getLeverageSignal(npc, player);
    const options = [];
    if (signal < 1 || !npc.wants) return options;

    if (npc.wants.type === 'gold') {
        const discount = getPersuasionDiscount(player);
        const cost = Math.max(1, Math.ceil(npc.wants.amount * (1 - discount / 100)));
        options.push({
            label: `Offer ${cost} gold. (${npc.wants.offerLabel || 'bribe'})`,
            action: () => {
                if ((window.party[0].gold || 0) < cost) {
                    window.showMessage("You don't have enough gold.");
                    return;
                }
                window.party[0].gold -= cost;
                window.showMessage(`You hand over ${cost} gold.`);
                if (npc.onBribeSuccess) npc.onBribeSuccess();
            }
        });
    }
    return options;
}

window.getInsightRank = getInsightRank;
window.getPersuasionDiscount = getPersuasionDiscount;
window.getLeverageSignal = getLeverageSignal;
window.readTheRoom = readTheRoom;
window.getLeverageOptions = getLeverageOptions;
