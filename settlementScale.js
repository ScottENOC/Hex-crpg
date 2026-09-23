// settlementScale.js
// Settlement size is descriptive only. It NEVER creates loading zones.
// The world is continuous; expensive simulation is streamed around every
// relevant party member by worldChunkStreaming.js.
(() => {
    'use strict';

    const TIERS = Object.freeze({
        hamlet: Object.freeze({ key:'hamlet', populationRange:[20,40], defaultPopulation:30 }),
        village: Object.freeze({ key:'village', populationRange:[60,120], defaultPopulation:80 }),
        town: Object.freeze({ key:'town', populationRange:[150,300], defaultPopulation:220 }),
        capital: Object.freeze({ key:'capital', populationRange:[400,800], defaultPopulation:500 }),
    });

    const settlements = new Map();

    function register(spec) {
        if (!spec?.id || !TIERS[spec.tier]) throw new Error('Settlement scale registration requires id and valid tier');
        const tier = TIERS[spec.tier];
        const entry = {
            id:String(spec.id),
            name:String(spec.name || spec.id),
            tier:spec.tier,
            centre:spec.centre ? { q:Number(spec.centre.q), r:Number(spec.centre.r) } : null,
            radius:Number(spec.radius || (spec.tier === 'capital' ? 170 : spec.tier === 'town' ? 105 : 75)),
            populationTarget:Number(spec.populationTarget ?? tier.defaultPopulation),
            // Districts are semantic labels only: quests, ambient flavour,
            // addresses and encounter tables may use them, but streaming does not.
            districts:Array.isArray(spec.districts) ? spec.districts.map(d => ({...d, centre:d.centre ? {...d.centre} : null})) : [],
        };
        settlements.set(entry.id, entry);
        return entry;
    }

    function seedCampaign2Settlements() {
        const cp = window.campaign2Landmarks?.crossroads;
        if (cp && !settlements.has('hollowmere')) register({ id:'hollowmere', name:'Hollowmere', tier:'village', centre:cp, populationTarget:80, radius:75 });
        const reddale = window.campaign2ReddaleCenter;
        if (reddale && !settlements.has('reddale')) register({ id:'reddale', name:'Reddale', tier:'town', centre:reddale, populationTarget:220, radius:105 });
        const silverhart = window.campaign2PalaceThroneCenter || window.campaign2SilverhartCenter;
        if (silverhart && !settlements.has('silverhart')) register({
            id:'silverhart', name:'Silverhart', tier:'capital', centre:silverhart, populationTarget:500, radius:170,
            districts:[
                {id:'palace',name:'Palace & Inner Court',centre:window.campaign2PalaceThroneCenter || silverhart,radius:40},
                {id:'merchant',name:'Merchant Quarter',centre:window.campaign2MerchantQuarterCenter || null,radius:45},
                {id:'diplomatic',name:'Diplomatic Quarter',centre:window.campaign2DiplomaticPlazaCenter || null,radius:45},
                {id:'commons',name:'Commons',centre:window.campaign2CommonsCenter || null,radius:45},
                {id:'warrens',name:'Warrens',centre:window.campaign2ThievesGuildCenter || null,radius:45},
            ].filter(d=>d.centre),
        });
        return settlements;
    }

    function hexDistance(a,b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function settlementAt(hex) {
        seedCampaign2Settlements();
        let best=null, bestD=Infinity;
        for (const s of settlements.values()) {
            const d=hexDistance(hex,s.centre);
            if (d<=s.radius && d<bestD) { best=s; bestD=d; }
        }
        return best;
    }

    function districtAt(settlementId, hex) {
        const s=settlements.get(String(settlementId));
        if (!s) return null;
        let best=null, bestD=Infinity;
        for (const d of s.districts || []) {
            const dist=hexDistance(hex,d.centre);
            if (dist<=Number(d.radius||45) && dist<bestD) { best=d; bestD=dist; }
        }
        return best;
    }

    window.SettlementScale = {
        TIERS, settlements, register, seedCampaign2Settlements, settlementAt, districtAt,
        get(id){ seedCampaign2Settlements(); return settlements.get(String(id)) || null; },
    };

    seedCampaign2Settlements();
})();
