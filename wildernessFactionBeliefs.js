// wildernessFactionBeliefs.js
// Factions act on what they know and believe about the player, not on a hidden
// canonical allegiance. A player can cultivate several mutually contradictory
// relationships until evidence, witnesses or an explicit reveal exposes them.
(() => {
    'use strict';

    function w() { return window.WildernessIncidents; }
    function c() { return window.WildernessConsequences; }
    function now() { return Number(window.worldSeconds || 0); }

    function ledger() {
        const l = c()?.ensureLedger?.();
        if (!l) return null;
        l.version = Math.max(3, Number(l.version || 1));
        l.factionBeliefs = l.factionBeliefs || {};
        l.exposures = Array.isArray(l.exposures) ? l.exposures : [];
        return l;
    }

    function factionView(id) {
        const f = window.factions?.[id];
        const l = ledger();
        const belief = l?.factionBeliefs?.[id] || { claims:{}, evidence:{}, suspicion:0, exposed:false };
        return { id, standing:Number(f?.standing || 0), knowledge:Number(f?.knowledge || 0), belief };
    }

    function ensureBelief(id) {
        const l = ledger();
        if (!l) return null;
        if (!l.factionBeliefs[id]) l.factionBeliefs[id] = { claims:{}, evidence:{}, suspicion:0, exposed:false, lastUpdatedAt:now() };
        const b = l.factionBeliefs[id];
        b.claims = b.claims || {};
        b.evidence = b.evidence || {};
        b.suspicion = Number(b.suspicion || 0);
        b.exposed = !!b.exposed;
        return b;
    }

    function recordClaim(id, claim, strength=1, source='player') {
        const b = ensureBelief(id);
        if (!b || !claim) return null;
        b.claims[claim] = Number(b.claims[claim] || 0) + strength;
        b.lastClaimSource = source;
        b.lastUpdatedAt = now();
        return b;
    }

    function recordEvidence(id, fact, strength=1, opts={}) {
        const b = ensureBelief(id);
        if (!b || !fact) return null;
        b.evidence[fact] = Number(b.evidence[fact] || 0) + strength;
        b.lastUpdatedAt = now();
        if (opts.suspicion) b.suspicion = Math.max(0, b.suspicion + Number(opts.suspicion));
        if (opts.exposes) expose(id, opts.reason || fact);
        return b;
    }

    function expose(id, reason='contradictory evidence') {
        const l = ledger();
        const b = ensureBelief(id);
        if (!l || !b) return false;
        if (!b.exposed) {
            b.exposed = true;
            b.exposedAt = now();
            b.exposureReason = reason;
            l.exposures.push({ factionId:id, worldSeconds:now(), reason });
            if (l.exposures.length > 50) l.exposures.splice(0, l.exposures.length - 50);
        }
        return true;
    }

    // Access means "this faction currently trusts the player enough to hear
    // this pitch". It does not say anything about the player's real loyalty.
    // Rival factions can all return true at once.
    function canWorkWithFaction(id, opts={}) {
        const view = factionView(id);
        if (!window.factions?.[id]) return false;
        if (view.belief.exposed && !opts.allowAfterExposure) return false;
        const minStanding = Number(opts.minStanding ?? -5);
        const minKnowledge = Number(opts.minKnowledge ?? 0);
        return view.standing >= minStanding && view.knowledge >= minKnowledge;
    }

    function goblinAccess() {
        const f = window.factions?.goblin_tribe;
        if (!f || factionView('goblin_tribe').belief.exposed) return false;
        if (window.isGoblinAligned?.() || window.isPlayerGreenskin?.()) return Number(f.standing || 0) >= -10;
        return canWorkWithFaction('goblin_tribe', { minStanding:0, minKnowledge:5 });
    }
    function guildAccess() { return canWorkWithFaction('thieves_guild', { minStanding:15, minKnowledge:5 }); }
    function cultAccess() { return !window.playerIsLich && canWorkWithFaction('necromancer_cult', { minStanding:5, minKnowledge:5 }); }
    function silverhartAccess() { return canWorkWithFaction('silverhart_kingdom', { minStanding:-10, minKnowledge:0 }); }

    function addChoice(list, choice, beforeLast=true) {
        if (!Array.isArray(list) || !choice) return list;
        if (list.some(x => x?.outcome === choice.outcome || x?.label === choice.label)) return list;
        list.splice(beforeLast ? Math.max(0, list.length - 1) : list.length, 0, choice);
        return list;
    }

    function stripUnavailableFactionChoices(list) {
        const blocked = new Set();
        if (!goblinAccess()) ['goblin_intel','goblin_patrol_intel'].forEach(x=>blocked.add(x));
        if (!guildAccess()) ['guild_diversion','guild_route_book'].forEach(x=>blocked.add(x));
        if (!cultAccess()) ['cult_intel','cult_grave_intel'].forEach(x=>blocked.add(x));
        if (!window.playerIsLich) ['lich_claim','lich_oath'].forEach(x=>blocked.add(x));
        return list.filter(x => !blocked.has(x?.outcome));
    }

    function augmentChoices(type, base) {
        const list = stripUnavailableFactionChoices(Array.isArray(base) ? base.slice() : []);
        if (type === 'stranded_merchant') {
            if (goblinAccess()) addChoice(list,{label:'Tell Skarn-tooth scouts where this merchant is headed.',outcome:'goblin_intel'});
            if (guildAccess()) addChoice(list,{label:'Mark the cargo for the Guild to collect later.',outcome:'guild_diversion'});
            if (cultAccess()) addChoice(list,{label:'Ask about fresh graves and deaths along the road for the Vessel-Seeker.',outcome:'cult_intel'});
            if (window.playerIsLich) addChoice(list,{label:'Compel them to carry your seal and spread word of your claim.',outcome:'lich_claim'});
            if (silverhartAccess()) addChoice(list,{label:'Warn Silverhart patrols that this route is vulnerable.',outcome:'silverhart_route_warning'});
        } else if (type === 'injured_traveller') {
            if (goblinAccess()) addChoice(list,{label:'Question them about patrols and checkpoints for Skarn-tooth.',outcome:'goblin_patrol_intel'});
            if (guildAccess()) addChoice(list,{label:'Take their route book for the Guild, then leave them alive.',outcome:'guild_route_book'});
            if (cultAccess()) addChoice(list,{label:'Ask where the road has buried its dead lately.',outcome:'cult_grave_intel'});
            if (window.playerIsLich) addChoice(list,{label:'Offer aid in exchange for an oath to your name.',outcome:'lich_oath'});
            if (silverhartAccess()) addChoice(list,{label:'Tell them you are working with Silverhart against the raiders.',outcome:'silverhart_claim'});
        }
        return list;
    }

    function installChoiceWrappers() {
        const api = w();
        if (!api) return false;
        for (const type of ['stranded_merchant','injured_traveller']) {
            const template = api.templates?.[type];
            if (!template || template.__beliefAwareChoices) continue;
            const original = template.choices;
            template.choices = incident => augmentChoices(type, typeof original === 'function' ? original(incident) : []);
            template.__beliefAwareChoices = true;
        }
        return true;
    }

    function installResolverWrapper() {
        const api = w();
        if (!api || api.__beliefAwareResolver) return !!api;
        const original = api.resolveIncident;
        api.resolveIncident = function(id, outcome) {
            const incident = api.incidentById?.(id);
            if (!incident || !outcome) return original?.(id,outcome);
            const p = incident.provenance || {};

            if (outcome === 'goblin_intel' || outcome === 'goblin_patrol_intel') {
                recordClaim('goblin_tribe','working_for_us',1,'wilderness_intel');
                recordEvidence('goblin_tribe','useful_intelligence_supplied',1);
            } else if (outcome === 'guild_diversion' || outcome === 'guild_route_book') {
                recordClaim('thieves_guild','working_for_us',1,'wilderness_job');
                recordEvidence('thieves_guild','profitable_information_supplied',1);
            } else if (outcome === 'cult_intel' || outcome === 'cult_grave_intel') {
                recordClaim('necromancer_cult','working_for_us',1,'field_intelligence');
                recordEvidence('necromancer_cult','death_intelligence_supplied',1);
            }

            if (outcome === 'silverhart_route_warning') {
                incident.state='resolved'; incident.resolution='silverhart_route_warning'; incident.resolvedAt=now(); incident._consequenceRecorded=true;
                window.adjustReputation?.(window.factions?.silverhart_kingdom,2,3);
                recordClaim('silverhart_kingdom','helping_secure_roads',1,'road_warning');
                recordClaim('silverhart_kingdom','working_against_raiders',1,'road_warning');
                c()?.recordOutcome?.({incidentId:incident.id,kind:'systemic',person:p.person,origin:p.origin,destination:p.destination||p.origin,tags:['route_warning','silverhart_intelligence'],beneficiaries:['silverhart_kingdom'],note:'The player warned Silverhart patrols about a vulnerable trade route.'});
                window.showMessage?.('You pass the route, timing and weak points to a Silverhart patrol. They take the warning seriously.');
                return incident;
            }
            if (outcome === 'silverhart_claim') {
                incident.state='resolved'; incident.resolution='silverhart_claim'; incident.resolvedAt=now(); incident._consequenceRecorded=true;
                window.adjustReputation?.(window.factions?.silverhart_kingdom,1,2);
                recordClaim('silverhart_kingdom','working_against_raiders',1,'player_statement');
                c()?.recordOutcome?.({incidentId:incident.id,kind:'social',person:p.person,tags:['silverhart_claim','declared_intent'],beneficiaries:['silverhart_kingdom'],note:'The player told a traveller they were working with Silverhart against the raiders.'});
                window.showMessage?.('The traveller nods, relieved. Whether that is your true purpose is your business; what matters here is what they now believe.');
                return incident;
            }
            return original?.(id,outcome);
        };
        api.__beliefAwareResolver = true;
        return true;
    }

    function install() {
        if (!w() || !c()) return false;
        ledger();
        installChoiceWrappers();
        installResolverWrapper();
        window.WildernessFactionBeliefs = { ledger,factionView,recordClaim,recordEvidence,expose,canWorkWithFaction,goblinAccess,guildAccess,cultAccess,silverhartAccess,augmentChoices };
        return true;
    }

    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, 25);
        setTimeout(() => clearInterval(timer), 5000);
    }
})();