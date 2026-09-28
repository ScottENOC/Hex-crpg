// wildernessSkillSolutions.js
// Lets existing non-combat skills change how small wilderness incidents can be
// understood and solved. These are deterministic competence gates, not random
// skill rolls: investing in fieldcraft gives the party better options, while
// every ordinary incident choice remains available.
(() => {
    'use strict';

    function api() { return window.WildernessIncidents; }
    function consequences() { return window.WildernessConsequences; }
    function now() { return Number(window.worldSeconds || 0); }

    function partyMembers() {
        const seen = new Set();
        const result = [];
        const add = actor => {
            if (!actor || !actor.alive && actor !== window.player) return;
            const key = actor.id ?? actor.name ?? actor;
            if (seen.has(key)) return;
            seen.add(key);
            result.push(actor);
        };
        (window.entities || []).filter(e => e?.alive && e.side === 'player' && !e.rider).forEach(add);
        add(window.player);
        return result;
    }

    function skillRank(actor, key) {
        return Math.max(0, Number(actor?.skills?.[key] || 0));
    }

    function natureRank(actor) {
        if (!actor) return 0;
        if (typeof window.getKnowledgeNatureRank === 'function') {
            return Math.max(0, Number(window.getKnowledgeNatureRank(actor) || 0));
        }
        return Math.max(skillRank(actor, 'druid_knowledge_nature'), skillRank(actor, 'elf_knowledge_nature'));
    }

    function bestBy(getRank) {
        let best = { rank:0, actor:null };
        for (const actor of partyMembers()) {
            const rank = Math.max(0, Number(getRank(actor) || 0));
            if (rank > best.rank) best = { rank, actor };
        }
        return best;
    }

    function bestSkill(key) { return bestBy(actor => skillRank(actor, key)); }
    function bestNature() { return bestBy(natureRank); }

    function addChoice(list, choice) {
        if (!choice || !Array.isArray(list)) return list;
        if (list.some(c => c?.outcome === choice.outcome || c?.label === choice.label)) return list;
        const leaveIndex = Math.max(0, list.length - 1);
        list.splice(leaveIndex, 0, choice);
        return list;
    }

    function observationStore(incident) {
        incident.skillObservations = incident.skillObservations && typeof incident.skillObservations === 'object'
            ? incident.skillObservations : {};
        return incident.skillObservations;
    }

    function rememberObservation(incident, key, competence, text) {
        const store = observationStore(incident);
        store[key] = {
            rank:Number(competence?.rank || 0),
            observedBy:competence?.actor?.name || null,
            observedAt:now(),
            text,
        };
        return store[key];
    }

    function trackReading(incident, rank) {
        const text = String(incident?.provenance?.trackDescription || '').toLowerCase();
        let first = 'The trail is purposeful rather than random wandering, and fresh enough that its maker is still somewhere in the district.';
        let second = 'Spacing and depth show a hurried pace; you can tell which way the trail is really travelling even where it crosses harder ground.';
        let third = 'Broken stems and the newest impressions let you distinguish the recent trail from older traffic and choose ground that will not intersect it.';
        if (text.includes('hoof')) {
            first = 'The hoofprints belong to more than one animal, and one is favouring a leg rather than merely slipping on soft ground.';
            second = 'The limping animal is being pushed hard despite the injury; the group is travelling with urgency, not grazing or wandering.';
            third = 'The freshest cuts in the verge show where the group left the obvious line of travel, giving you a safe way around them.';
        } else if (text.includes('paw')) {
            first = 'These are large canine tracks. The circling marks are investigative; the animals lingered here before committing uphill.';
            second = 'Several overlapping impressions belong to the same moving group rather than one animal doubling back.';
            third = 'The newest scuffs show the pack kept to the rise beyond the path, leaving a lower route that avoids its line.';
        } else if (text.includes('small bare')) {
            first = 'The prints are from a small, light humanoid moving deliberately along the creek edge rather than following the road.';
            second = 'The stride shortens at exposed patches and lengthens under cover: whoever made them was trying not to be seen from the road.';
            third = 'You can see where the trail crosses and recrosses the water, enough to predict its real direction and avoid following a false branch.';
        } else if (text.includes('boot')) {
            first = 'The bootprints are deliberate and recent. They leave the road rather than merely crossing it by accident.';
            second = 'Different tread depths overlap in the same direction, suggesting more than one traveller moving together.';
            third = 'The freshest heel cuts show where the group turned after entering the trees, leaving a clear route around their likely line.';
        }
        return rank >= 3 ? `${first} ${second} ${third}` : rank >= 2 ? `${first} ${second}` : first;
    }

    function campReading(incident, rank) {
        const clue = String(incident?.provenance?.clue || 'sign').toLowerCase();
        let detail = 'The camp was abandoned quickly, but not long ago. The useful pattern is outside the fire ring, where hurried movement disturbed the ground.';
        if (clue.includes('boot')) detail = 'The bootprints begin as ordinary movement around camp, then tighten into a single hurried direction. The departure was sudden rather than planned.';
        else if (clue.includes('drag')) detail = 'The drag mark starts beside the sleeping place and continues without the stops you would expect from hauling firewood. Something heavy, or someone unable to walk, left with the camp.';
        else if (clue.includes('blood')) detail = 'The drops are spaced with movement rather than pooled at the camp. Whoever was bleeding left under their own power, at least at first.';
        else if (clue.includes('branches')) detail = 'The broken branches line up at roughly the same height and direction. Someone pushed through the brush quickly instead of choosing an easy trail.';
        if (rank >= 2) detail += ' The youngest disturbances are consistent enough that you could follow them without relying on the obvious clue alone.';
        if (rank >= 3) detail += ' Older marks cross the area too, but you can separate them from the departure trail and avoid being led by stale sign.';
        return detail;
    }

    function insightReading(rank) {
        let text = 'The traveller’s pain looks genuine; their attention keeps returning to the road behind them rather than to your weapons or purse.';
        if (rank >= 2) text += ' They are more frightened of being found again than of losing their pack, which makes the attack sound less like an ordinary accident.';
        if (rank >= 3) text += ' Their pauses feel like caution about who might overhear, not the rhythm of a rehearsed lie.';
        return text;
    }

    function showObservation(incident, title, text) {
        if (typeof window.showDialogue === 'function') {
            window.showDialogue({ name:title, race:'human', gender:'female' }, text, [{
                label:'Continue.',
                action:() => setTimeout(() => {
                    if (incident?.state !== 'resolved') api()?.presentIncident?.(incident);
                }, 0),
            }]);
        } else {
            window.showMessage?.(text);
        }
    }

    function skillChoices(incident, baseChoices) {
        const list = Array.isArray(baseChoices) ? baseChoices.slice() : [];
        if (!incident || incident.state === 'resolved') return list;
        const observations = observationStore(incident);
        const nature = bestNature();
        const survival = bestSkill('survival');
        const smithing = bestSkill('smithing');
        const insight = bestSkill('insight');

        if (incident.type === 'fresh_tracks') {
            if (nature.rank >= 1 && !observations.natureTracks) {
                addChoice(list, { label:`[Knowledge: Nature ${nature.rank}] Read the trail before deciding.`, outcome:'skill:nature_read_tracks' });
            }
            if (nature.rank >= 2) {
                addChoice(list, { label:`[Knowledge: Nature ${nature.rank}] Read the trail and skirt around whoever made it.`, outcome:'skill:avoid_tracks_nature' });
            } else if (survival.rank >= 2) {
                addChoice(list, { label:`[Survival ${survival.rank}] Give the trail a wide berth without losing your bearings.`, outcome:'skill:avoid_tracks_survival' });
            }
        }

        if (incident.type === 'abandoned_camp' && !observations.campSign) {
            if (nature.rank >= 1) addChoice(list, { label:`[Knowledge: Nature ${nature.rank}] Read the sign around the camp.`, outcome:'skill:read_camp_nature' });
            else if (survival.rank >= 1) addChoice(list, { label:`[Survival ${survival.rank}] Work out how the camp was abandoned.`, outcome:'skill:read_camp_survival' });
        }

        if (incident.type === 'lost_child') {
            if (nature.rank >= 1) {
                addChoice(list, { label:`[Knowledge: Nature ${nature.rank}] Backtrack her trail to the family searching for her.`, outcome:'skill:track_child_home' });
            } else if (survival.rank >= 1) {
                addChoice(list, { label:`[Survival ${survival.rank}] Reconstruct her route and guide her back to her family.`, outcome:'skill:survival_child_home' });
            }
        }

        if (incident.type === 'stranded_merchant' && smithing.rank >= 1) {
            addChoice(list, { label:`[Smithing ${smithing.rank}] Rebuild the split pack-frame properly so they can continue alone.`, outcome:'skill:smithing_repair' });
        }

        if (incident.type === 'injured_traveller' && insight.rank >= 1 && !observations.travellerInsight) {
            addChoice(list, { label:`[Insight ${insight.rank}] Read the traveller before deciding what to do.`, outcome:'skill:insight_traveller' });
        }
        return list;
    }

    function installChoiceWrappers() {
        const w = api();
        if (!w?.templates) return false;
        for (const type of ['fresh_tracks','abandoned_camp','lost_child','stranded_merchant','injured_traveller']) {
            const template = w.templates[type];
            if (!template || template.__skillSolutionChoices) continue;
            const original = template.choices;
            template.choices = incident => skillChoices(incident, typeof original === 'function' ? original(incident) : []);
            template.__skillSolutionChoices = true;
        }
        return true;
    }

    function installResolverWrapper() {
        const w = api();
        if (!w || w.__skillSolutionResolver) return !!w;
        const original = w.resolveIncident;
        w.resolveIncident = function(id, outcome) {
            const incident = w.incidentById?.(id);
            if (!incident || !outcome || !String(outcome).startsWith('skill:')) return original?.(id, outcome);
            const nature = bestNature();
            const survival = bestSkill('survival');
            const smithing = bestSkill('smithing');
            const insight = bestSkill('insight');

            if (outcome === 'skill:nature_read_tracks' && nature.rank >= 1) {
                const text = trackReading(incident, nature.rank);
                rememberObservation(incident, 'natureTracks', nature, text);
                showObservation(incident, 'Tracking', text);
                return incident;
            }
            if ((outcome === 'skill:read_camp_nature' && nature.rank >= 1) || (outcome === 'skill:read_camp_survival' && survival.rank >= 1)) {
                const competence = outcome.endsWith('nature') ? nature : survival;
                const text = campReading(incident, competence.rank);
                rememberObservation(incident, 'campSign', competence, text);
                showObservation(incident, outcome.endsWith('nature') ? 'Knowledge: Nature' : 'Survival', text);
                return incident;
            }
            if (outcome === 'skill:insight_traveller' && insight.rank >= 1) {
                const text = insightReading(insight.rank);
                rememberObservation(incident, 'travellerInsight', insight, text);
                showObservation(incident, 'Insight', text);
                return incident;
            }
            if (outcome === 'skill:track_child_home' && nature.rank >= 1) {
                incident.resolutionMethod = 'tracking';
                incident.skillResolution = { skill:'knowledge_nature', rank:nature.rank, actor:nature.actor?.name || null, at:now() };
                return original?.(id, 'reunite');
            }
            if (outcome === 'skill:survival_child_home' && survival.rank >= 1) {
                incident.resolutionMethod = 'fieldcraft';
                incident.skillResolution = { skill:'survival', rank:survival.rank, actor:survival.actor?.name || null, at:now() };
                return original?.(id, 'reunite');
            }
            if (outcome === 'skill:avoid_tracks_nature' && nature.rank >= 2) {
                incident.resolutionMethod = 'tracking_avoidance';
                incident.skillResolution = { skill:'knowledge_nature', rank:nature.rank, actor:nature.actor?.name || null, at:now() };
                return original?.(id, 'study');
            }
            if (outcome === 'skill:avoid_tracks_survival' && survival.rank >= 2) {
                incident.resolutionMethod = 'fieldcraft_avoidance';
                incident.skillResolution = { skill:'survival', rank:survival.rank, actor:survival.actor?.name || null, at:now() };
                return original?.(id, 'study');
            }
            if (outcome === 'skill:smithing_repair' && smithing.rank >= 1 && incident.type === 'stranded_merchant') {
                incident.state = 'resolved';
                incident.resolution = 'repaired';
                incident.resolvedAt = now();
                incident._consequenceRecorded = true;
                incident.resolutionMethod = 'smithing';
                incident.skillResolution = { skill:'smithing', rank:smithing.rank, actor:smithing.actor?.name || null, at:now() };
                window.adjustRegionStat?.(incident.regionId || 'aldervale', 'prosperity', 1);
                consequences()?.recordOutcome?.({
                    incidentId:incident.id,
                    kind:'systemic',
                    person:incident.provenance?.person,
                    origin:incident.provenance?.origin,
                    destination:incident.provenance?.destination || incident.provenance?.origin,
                    tags:['merchant_arrived','safe_arrival','route_reliability','skilled_repair'],
                    beneficiaries:['silverhart_kingdom'],
                    note:'A stranded merchant continued safely after the player repaired the split pack-frame with Smithing.',
                });
                window.showMessage?.(`${incident.provenance?.person || 'The merchant'} watches while you re-seat the split joint, brace it against the grain and bind the load properly. The frame is no longer a night-long problem; they can make the next settlement under their own power.`);
                return incident;
            }
            // A stale UI choice or changed party should never strand the player.
            // If the required skill is no longer present, fall back to simply
            // leaving the incident unresolved so its ordinary choices remain.
            return incident;
        };
        w.__skillSolutionResolver = true;
        return true;
    }

    function install() {
        const w = api();
        if (!w || !consequences()) return false;
        installChoiceWrappers();
        installResolverWrapper();
        window.WildernessSkillSolutions = {
            skillChoices,
            bestNature,
            bestSkill,
            trackReading,
            campReading,
            get stats() { return { installed:true, partyMembers:partyMembers().length }; },
        };
        return true;
    }

    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, 25);
        setTimeout(() => clearInterval(timer), 5000);
    }
})();
