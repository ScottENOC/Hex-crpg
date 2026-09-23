// wildernessIncidents.js
// Small persistent stories in the seamless Campaign 2 overworld.
//
// Incidents are deliberately not conventional quests. They are things the
// player can simply come across: a broken cart, abandoned camp, fresh tracks,
// an injured traveller, a poacher cache, an old roadside grave. Each record
// remembers what happened, can leave physical evidence on the map, and may
// feed worldEvents/region stats so the countryside and its settlements agree.
//
// Persistence piggy-backs on worldMapNotes, which is already part of the save
// schema. This avoids another save migration while keeping incident history in
// the player's actual save rather than a separate localStorage silo.
(() => {
    'use strict';

    const STORE_KEY = '__wildernessIncidentsV1';
    const MAX_ACTIVE = 4;
    const SPAWN_CHECK_SECONDS = 3 * 3600;
    const SPAWN_CHANCE = 0.35;
    const DISCOVERY_RADIUS = 2;
    const MIN_SETTLEMENT_DISTANCE = 48;
    const INCIDENT_LIFETIME_SECONDS = 12 * 24 * 3600;
    const sessionNear = new Set();

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function playerEntity() {
        return (window.entities || []).find(e => e?.alive && e.side === 'player' && !e.rider) || null;
    }

    function ensureStore() {
        window.worldMapNotes = window.worldMapNotes || {};
        if (!window.worldMapNotes[STORE_KEY] || Array.isArray(window.worldMapNotes[STORE_KEY])) {
            window.worldMapNotes[STORE_KEY] = {
                version: 1,
                nextId: 1,
                lastSpawnCheckAt: Number(window.worldSeconds || 0),
                incidents: []
            };
        }
        const store = window.worldMapNotes[STORE_KEY];
        store.incidents = Array.isArray(store.incidents) ? store.incidents : [];
        store.nextId = Math.max(1, Number(store.nextId || 1));
        window.wildernessIncidents = store.incidents;
        return store;
    }

    function now() { return Number(window.worldSeconds || 0); }
    function activeIncidents() { return ensureStore().incidents.filter(i => i.state !== 'resolved' && i.state !== 'expired'); }
    function incidentById(id) { return ensureStore().incidents.find(i => i.id === id) || null; }

    function isOutdoors(hex) {
        if (!hex) return false;
        if (window.findInteriorRegion?.(hex)) return false;
        const t = window.getTerrainAt?.(hex.q, hex.r)?.name;
        return t !== 'Wood Floor' && t !== 'Cave Floor';
    }

    function regionForHex(hex) {
        const cp = window.campaign2Landmarks?.crossroads;
        const ember = window.campaign2EmberlodeCenter;
        const reddale = window.campaign2ReddaleCenter;
        if (ember && distance(hex, ember) < 75) return 'emberlode';
        if (reddale && distance(hex, reddale) < 90) return 'aldervale';
        if (cp && distance(hex, cp) < 120) return 'hollowmere';
        return 'aldervale';
    }

    function settlementTooClose(hex) {
        const centres = [
            window.campaign2Landmarks?.crossroads,
            window.campaign2MillbrookCenter,
            window.campaign2EmberlodeCenter,
            window.campaign2ReddaleCenter,
            window.campaign2SilverhartCenter,
        ].filter(Boolean);
        return centres.some(c => distance(hex, c) < MIN_SETTLEMENT_DISTANCE);
    }

    function siteAvailable(hex) {
        if (!hex || !isOutdoors(hex)) return false;
        const terrain = window.getTerrainAt?.(hex.q, hex.r)?.name;
        if (['Water','Wall','Palisade Wall','Climbable Wall','Keep Wall','Stone Wall'].includes(terrain)) return false;
        if (window.getEntityAtHex?.(hex.q, hex.r)) return false;
        if (window.isNearAnyBuilding?.(hex, 12)) return false;
        if (settlementTooClose(hex)) return false;
        if (activeIncidents().some(i => distance(i.hex, hex) < 12)) return false;
        return true;
    }

    function findSiteAround(origin, rng=Math.random) {
        if (!origin) return null;
        for (let attempt=0; attempt<40; attempt++) {
            const angle = rng() * Math.PI * 2;
            const radius = 12 + Math.floor(rng() * 18);
            const raw = { q: origin.q + Math.round(Math.cos(angle)*radius), r: origin.r + Math.round(Math.sin(angle)*radius) };
            const hex = window.hexRound ? window.hexRound(raw.q, raw.r) : raw;
            if (!siteAvailable(hex)) continue;
            if (window.isVisibleToPlayer?.(hex)) continue;
            return hex;
        }
        return null;
    }

    const ORIGINS = ['Reddale','Emberlode','Millbrook','Silverhart','Hollowmere'];
    const CARGOS = ['lamp oil','ore samples','cloth','salt fish','iron fittings','grain','timber tools','healing herbs'];
    const NAMES = ['Tomas Reed','Brinna Vale','Orrin Clay','Mara Wren','Perrin Ashbrook','Nessa Yarrow','Hale Kettle','Elin Briar'];
    function pick(list, rng=Math.random) { return list[Math.min(list.length-1, Math.floor(rng()*list.length))]; }

    const templates = {
        broken_cart: {
            weight: 5,
            markerTypes: ['crate','crate'],
            title: 'Broken Cart',
            describe: i => `A cart lies on its side beside the track. One wheel has split clean through. A few ${i.provenance.cargo} are scattered in the mud; there is no sign of the driver.`,
            choices: () => [
                { label:'Look for signs of what happened.', outcome:'investigate' },
                { label:'Salvage what was left behind.', outcome:'salvage' },
                { label:'Mark the spot and report it in town.', outcome:'report' },
                { label:'Leave it alone.', outcome:null },
            ]
        },
        abandoned_camp: {
            weight: 5,
            markerTypes: ['fireplace'],
            title: 'Abandoned Camp',
            describe: i => `A cold campfire sits under a rough lean-to. Whoever slept here left in a hurry: one blanket is still laid out and ${i.provenance.clue} leads away from the fire.`,
            choices: () => [
                { label:'Search the camp carefully.', outcome:'search' },
                { label:'Follow the signs leading away.', outcome:'follow' },
                { label:'Leave it alone.', outcome:null },
            ]
        },
        fresh_tracks: {
            weight: 3,
            markerTypes: [],
            title: 'Fresh Tracks',
            describe: i => `${i.provenance.trackDescription} The marks are fresh enough that whatever made them cannot be very far ahead.`,
            choices: () => [
                { label:'Follow the tracks.', outcome:'follow' },
                { label:'Study them and move on.', outcome:'study' },
                { label:'Best not.', outcome:null },
            ]
        },
        injured_traveller: {
            weight: 3,
            markerTypes: ['crate'],
            title: 'Injured Traveller',
            describe: i => `${i.provenance.person} is sitting against a tree with a bloodied bandage around one leg. Their pack is still closed beside them. “I thought this road was safer than this.”`,
            choices: () => [
                { label:'Help them get back toward the road.', outcome:'help' },
                { label:'Ask what attacked them.', outcome:'question' },
                { label:'Take what you can and leave.', outcome:'rob' },
                { label:'Leave them to it.', outcome:null },
            ]
        },
        poacher_cache: {
            weight: 3,
            markerTypes: ['crate'],
            title: 'Poacher Cache',
            describe: () => 'A waxed bundle has been tucked beneath brush beside two crude snares. Whoever set them expects to come back.',
            choices: () => [
                { label:'Destroy the snares and leave the cache.', outcome:'destroy_traps' },
                { label:'Take the hidden coin and supplies.', outcome:'take' },
                { label:'Leave everything as you found it.', outcome:null },
            ]
        },
        roadside_grave: {
            weight: 2,
            markerTypes: [],
            title: 'Roadside Grave',
            describe: i => `A small cairn stands beneath an old tree. A weathered board reads: “${i.provenance.person}. ${i.provenance.epitaph}”`,
            choices: () => [
                { label:'Set the stones back in order.', outcome:'tend' },
                { label:'Remember the name and move on.', outcome:'remember' },
            ]
        },
    };

    function makeProvenance(type, rng=Math.random) {
        const base = { origin:pick(ORIGINS,rng), cargo:pick(CARGOS,rng), person:pick(NAMES,rng) };
        if (type === 'abandoned_camp') base.clue = pick(['a line of hurried bootprints','a drag mark through the leaves','three snapped branches at shoulder height','small drops of dried blood'],rng);
        if (type === 'fresh_tracks') base.trackDescription = pick([
            'Bootprints cross the path and vanish into thicker trees.',
            'Several hoofprints leave the road at speed, one animal limping.',
            'Broad paw marks circle a churned patch of earth before heading uphill.',
            'A line of small bare footprints follows the creek instead of the road.'
        ],rng);
        if (type === 'roadside_grave') base.epitaph = pick([
            'Beloved sister. She nearly made it home.',
            'Carried messages through the winter road.',
            'A better friend than this country deserved.',
            'Killed by fever, not by war. Remember that.'
        ],rng);
        return base;
    }

    function paintMarkers(incident) {
        if (!window.tileObjects) return;
        const types = templates[incident.type]?.markerTypes || [];
        incident.evidenceHexes = [];
        const neighbours = window.getNeighbors?.(incident.hex.q, incident.hex.r) || [];
        types.forEach((type, idx) => {
            const h = idx === 0 ? incident.hex : (neighbours[idx-1] || incident.hex);
            const key = `${h.q},${h.r}`;
            if (window.tileObjects[key]) return;
            window.tileObjects[key] = { type, lightRadius:type === 'fireplace' ? 0 : undefined, wildernessIncidentId:incident.id };
            incident.evidenceHexes.push({q:h.q,r:h.r});
        });
    }

    function spawnIncident(type=null, hex=null, opts={}) {
        const store = ensureStore();
        if (activeIncidents().length >= MAX_ACTIVE && !opts.force) return null;
        const rng = opts.rng || Math.random;
        if (!type) {
            const entries = Object.entries(templates);
            let roll = rng() * entries.reduce((s,[,t]) => s+t.weight,0);
            for (const [id,t] of entries) { if (roll < t.weight) { type=id; break; } roll -= t.weight; }
            type = type || entries[0][0];
        }
        if (!templates[type]) return null;
        if (!hex) hex = findSiteAround(playerEntity()?.hex, rng);
        if (!hex) return null;
        const incident = {
            id:`wild-${store.nextId++}`,
            type,
            state:'active',
            hex:{q:hex.q,r:hex.r},
            regionId:opts.regionId || regionForHex(hex),
            createdAt:now(),
            discoveredAt:null,
            resolvedAt:null,
            resolution:null,
            provenance:opts.provenance || makeProvenance(type,rng),
            evidenceHexes:[],
        };
        store.incidents.push(incident);
        paintMarkers(incident);
        return incident;
    }

    function addGold(amount) {
        const target = window.player || window.party?.[0];
        if (target) target.gold = Number(target.gold || 0) + amount;
    }

    function addStanding(amount) {
        const faction = window.factions?.silverhart_kingdom;
        if (faction && typeof window.adjustReputation === 'function') window.adjustReputation(faction, amount, Math.abs(amount));
        else if (faction) faction.standing = Number(faction.standing || 0) + amount;
    }

    function finish(incident,resolution) {
        incident.state='resolved'; incident.resolution=resolution; incident.resolvedAt=now();
    }

    function spawnFollowUpTracks(parent) {
        if (parent.followUpIncidentId) return incidentById(parent.followUpIncidentId);
        const origin = parent.hex;
        const ns = window.getNeighbors?.(origin.q,origin.r) || [];
        const seed = ns.length ? ns[Math.floor(Math.random()*ns.length)] : {q:origin.q+2,r:origin.r};
        const hex = {q:seed.q + 4,r:seed.r + 2};
        const child = spawnIncident('fresh_tracks', hex, { force:true, regionId:parent.regionId });
        if (child) { child.parentIncidentId=parent.id; parent.followUpIncidentId=child.id; }
        return child;
    }

    function spawnTrackEncounter(incident) {
        const track = String(incident.provenance?.trackDescription || '').toLowerCase();
        const monsterType = track.includes('paw') ? 'wolf' : 'bandit';
        const count = monsterType === 'wolf' ? 2 : 2 + Math.floor(Math.random()*2);
        const neighbors = window.getNeighbors?.(incident.hex.q,incident.hex.r) || [];
        for (let i=0;i<count;i++) {
            const h = neighbors[i] || {q:incident.hex.q+i+1,r:incident.hex.r};
            try {
                const mob = window.createMonster?.(monsterType,h,null,null,'enemy');
                if (!mob) continue;
                mob.isRandomEncounter=true;
                mob.wildernessIncidentId=incident.id;
                window.entities.push(mob);
            } catch (_) {}
        }
    }

    function resolveIncident(id, outcome) {
        const incident = incidentById(id);
        if (!incident || incident.state === 'resolved' || !outcome) return incident;
        const region = incident.regionId || 'aldervale';
        let message = '';
        switch (`${incident.type}:${outcome}`) {
            case 'broken_cart:investigate':
                incident.state = 'discovered';
                message = 'The wheel failed first, but the scattered cargo and bootprints show someone searched the cart afterwards. Whoever did it headed away from the road.';
                spawnFollowUpTracks(incident);
                break;
            case 'broken_cart:salvage':
                addGold(10 + Math.floor(Math.random()*11));
                window.adjustRegionStat?.(region, 'prosperity', -1);
                message = 'You gather the saleable odds and ends. Whatever happened here, their owner will not be getting these back.';
                finish(incident,'salvaged');
                break;
            case 'broken_cart:report':
                window.adjustRegionStat?.(region, 'security', 1);
                window.recordWorldEvent?.('road_hazard_reported', `Travellers have been warned about a wrecked cart on the ${incident.provenance.origin} road.`, region);
                message = 'You mark the wreck clearly and make a note to report it. Patrols and travellers will know where to look.';
                finish(incident,'reported');
                break;
            case 'abandoned_camp:search':
                addGold(3 + Math.floor(Math.random()*6));
                message = 'Most of it is worthless, but a few coins were pushed beneath the bedroll as if hidden in haste.';
                finish(incident,'searched');
                break;
            case 'abandoned_camp:follow':
                spawnFollowUpTracks(incident);
                message = 'The signs are faint but readable. A second trail lies farther out, where whoever left this camp tried to leave the obvious path.';
                finish(incident,'followed');
                break;
            case 'fresh_tracks:follow':
                spawnTrackEncounter(incident);
                message = 'You follow until the trail stops being a mystery.';
                finish(incident,'followed');
                break;
            case 'fresh_tracks:study':
                message = 'You study the direction and spacing of the tracks, enough to remember what has been moving through this part of the country.';
                finish(incident,'studied');
                break;
            case 'injured_traveller:help':
                addStanding(1);
                window.adjustRegionStat?.(region, 'security', 1);
                window.recordWorldEvent?.('traveller_rescued', `${incident.provenance.person} made it back from the road alive after strangers stopped to help.`, region);
                message = `${incident.provenance.person} leans heavily on you until the safer road is in sight. “I won't forget that.”`;
                finish(incident,'helped');
                break;
            case 'injured_traveller:question':
                incident.state = 'discovered';
                message = '“Two people. Faces wrapped. They wanted the pack, not me. Went north after.” The traveller glances toward the trees.';
                spawnFollowUpTracks(incident);
                break;
            case 'injured_traveller:rob':
                addGold(12 + Math.floor(Math.random()*12));
                addStanding(-2);
                window.adjustRegionStat?.(region, 'security', -2);
                message = 'The traveller cannot stop you. News of what happened may travel farther than you expect.';
                finish(incident,'robbed');
                break;
            case 'poacher_cache:destroy_traps':
                window.adjustRegionStat?.(region, 'security', 1);
                message = 'You spring and break the snares, leaving the hidden bundle untouched. The next animal through here has one less danger to worry about.';
                finish(incident,'traps_destroyed');
                break;
            case 'poacher_cache:take':
                addGold(8 + Math.floor(Math.random()*8));
                message = 'The cache contains a little coin and tradeable gear. Someone will return to an unexpectedly empty hiding place.';
                finish(incident,'taken');
                break;
            case 'roadside_grave:tend':
                addStanding(1);
                message = 'You set the fallen stones back into place. Nothing flashes, no reward appears; the grave simply looks cared for again.';
                finish(incident,'tended');
                break;
            case 'roadside_grave:remember':
                message = `You repeat ${incident.provenance.person}'s name once before leaving.`;
                finish(incident,'remembered');
                break;
            default:
                return incident;
        }
        if (message) window.showMessage?.(message);
        return incident;
    }

    function presentIncident(incident) {
        const template = templates[incident?.type];
        if (!template || incident.state === 'resolved') return false;
        if (!incident.discoveredAt) incident.discoveredAt = now();
        if (incident.state === 'active') incident.state='discovered';
        const text = template.describe(incident);
        const choices = template.choices(incident).map(c => ({
            label:c.label,
            action:() => { if (c.outcome) resolveIncident(incident.id,c.outcome); }
        }));
        if (typeof window.showDialogue === 'function') {
            window.showDialogue({name:template.title, race:'human', gender:'male'}, text, choices);
        } else {
            window.showMessage?.(`${template.title}: ${text}`);
        }
        return true;
    }

    function discoverNearby() {
        const player = playerEntity();
        if (!player || !isOutdoors(player.hex) || window.isInCombat) return null;
        let found=null;
        for (const incident of activeIncidents()) {
            const near = distance(player.hex,incident.hex) <= DISCOVERY_RADIUS;
            if (near && !sessionNear.has(incident.id)) {
                sessionNear.add(incident.id);
                presentIncident(incident);
                if (!found) found=incident;
            } else if (!near) sessionNear.delete(incident.id);
        }
        return found;
    }

    function expireOld() {
        const t=now();
        for (const incident of activeIncidents()) {
            if (incident.discoveredAt) continue;
            if (t-incident.createdAt > INCIDENT_LIFETIME_SECONDS) incident.state='expired';
        }
    }

    function maybeSpawn(rng=Math.random) {
        const store=ensureStore();
        const player=playerEntity();
        if (!player || window.currentCampaign!=='2' || window.isInCombat || !isOutdoors(player.hex)) return null;
        if (settlementTooClose(player.hex)) return null;
        if (activeIncidents().length >= MAX_ACTIVE) return null;
        const elapsed=now()-Number(store.lastSpawnCheckAt || 0);
        if (elapsed < SPAWN_CHECK_SECONDS) return null;
        store.lastSpawnCheckAt=now();
        if (rng() >= SPAWN_CHANCE) return null;
        return spawnIncident(null,null,{rng});
    }

    function pulse() {
        ensureStore();
        expireOld();
        maybeSpawn();
        discoverNearby();
    }

    ensureStore();
    window.WildernessIncidents={
        templates,ensureStore,activeIncidents,incidentById,spawnIncident,resolveIncident,presentIncident,
        discoverNearby,maybeSpawn,findSiteAround,siteAvailable,expireOld,pulse,
        constants:{MAX_ACTIVE,SPAWN_CHECK_SECONDS,SPAWN_CHANCE,DISCOVERY_RADIUS,MIN_SETTLEMENT_DISTANCE,INCIDENT_LIFETIME_SECONDS},
    };
    window.__wildernessIncidentTimer=setInterval(pulse,1200);
    pulse();
})();