// banditCampWildernessFix.js
// Expanded settlements can exhaust the old 40-69 hex camp search once its
// 30-hex building exclusion is applied. Search farther into the seamless
// wilderness while preserving the legacy active-camp state shape.
(() => {
    'use strict';
    function findSite(rng=Math.random) {
        const cp=window.campaign2Landmarks?.crossroads || {q:0,r:0};
        for(let attempt=0;attempt<80;attempt++) {
            const angle=rng()*Math.PI*2;
            const radius=58+Math.floor(rng()*62);
            const raw={q:cp.q+Math.round(Math.cos(angle)*radius),r:cp.r+Math.round(Math.sin(angle)*radius)};
            const h=window.hexRound?window.hexRound(raw.q,raw.r):raw;
            if(window.getEntityAtHex?.(h.q,h.r)) continue;
            if(window.getTerrainAt?.(h.q,h.r)?.name==='Water') continue;
            if(window.isVisibleToPlayer?.(h)) continue;
            const buffer=attempt<50?22:12;
            if(window.isNearAnyBuilding?.(h,buffer)) continue;
            return h;
        }
        return null;
    }
    function seed() {
        const site=findSite();
        if(!site) return null;
        const count=3+Math.floor(Math.random()*2);
        const memberIds=[];
        const spaces=[site,...(window.getNeighbors?.(site.q,site.r)||[])];
        for(let i=0;i<count;i++) {
            const h=spaces[i]||{q:site.q+i,r:site.r};
            const bandit=window.createMonster?.('bandit',h,null,null,'enemy');
            if(!bandit) continue;
            bandit.behaviorType='campRoutine';
            bandit.isRandomEncounter=true;
            bandit.banditCampId=site;
            window.entities.push(bandit);
            memberIds.push(bandit.id);
        }
        if(!memberIds.length) return null;
        window.tileObjects[`${site.q},${site.r}`]={type:'fireplace',lightRadius:6};
        window._activeBanditCamp={hexes:[site],memberIds};
        window.recordWorldEvent?.('bandit_camp_seeded','Word spreads of a new bandit camp somewhere beyond the settled roads.','aldervale');
        return window._activeBanditCamp;
    }
    function tick(deltaSeconds) {
        if(window._activeBanditCamp) {
            const site=window._activeBanditCamp.hexes?.[0];
            const alive=(window.entities||[]).some(e=>e.banditCampId===site&&e.alive);
            if(!alive) {
                window.adjustRegionStat?.('aldervale','security',8);
                window._activeBanditCamp=null;
                window._banditCampLowSecurityAccum=0;
                window.recordWorldEvent?.('bandit_camp_cleared','Word travels fast: that bandit camp beyond the road is gone.','aldervale');
            }
        }
        if(window._activeBanditCamp) return;
        const sec=window.regions?.aldervale?.security ?? 50;
        if(sec>=30) { window._banditCampLowSecurityAccum=0; return; }
        window._banditCampLowSecurityAccum=Number(window._banditCampLowSecurityAccum||0)+Number(deltaSeconds||0);
        if(window._banditCampLowSecurityAccum>=3*24*3600) {
            window._banditCampLowSecurityAccum=0;
            seed();
        }
    }
    window.findBanditCampSite=findSite;
    window.seedBanditCamp=seed;
    window.checkBanditCampSeeding=tick;
    window.BanditCampWildernessFix={findSite,seed,tick};
})();