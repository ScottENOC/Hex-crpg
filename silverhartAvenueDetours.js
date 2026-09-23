// silverhartAvenueDetours.js
// Keeps Silverhart's six principal avenues continuous without bulldozing
// authored buildings that already occupy an ideal radial centreline. Rather
// than side-stepping one blocked hex at a time, contiguous authored obstacles
// are routed around as a single cluster so a several-hex-wide building still
// gets a genuinely connected boulevard bypass.
(() => {
    'use strict';

    const BLOCKERS = new Set([
        'Wall', 'Palisade Wall', 'Climbable Wall', 'Keep Wall', 'Stone Wall',
        'Water', 'Wood Floor', 'Cave Floor'
    ]);
    const DIRS = [
        {q:1,r:0,name:'east'}, {q:1,r:-1,name:'north-east'},
        {q:0,r:-1,name:'north'}, {q:-1,r:0,name:'west'},
        {q:-1,r:1,name:'south-west'}, {q:0,r:1,name:'south'},
    ];
    let wrapperInstalled = false;

    const key = h => `${h.q},${h.r}`;
    function terrain(h) { return window.getTerrainAt?.(h.q,h.r)?.name || ''; }
    function dist(a,b) {
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }
    function centre() { return window.campaign2PalaceThroneCenter || window.campaign2SilverhartCenter || null; }

    function paintSafe(h) {
        const t=terrain(h);
        if(BLOCKERS.has(t)) return false;
        if(t!=='Path') window.setTerrainAt(h.q,h.r,'Path');
        return true;
    }

    function lineHex(c, dir, d) {
        return { q:c.q+dir.q*d, r:c.r+dir.r*d };
    }

    function findClearLinePoint(c,dir,startD,step,minD,maxD) {
        let d=startD;
        while(d>=minD && d<=maxD) {
            const h=lineHex(c,dir,d);
            if(!BLOCKERS.has(terrain(h))) {
                paintSafe(h);
                return {d,hex:h};
            }
            d+=step;
        }
        return null;
    }

    function reconstructPath(parent,startKey,goalKey,byKey) {
        if(!parent.has(goalKey) && goalKey!==startKey) return null;
        const out=[];
        let cur=goalKey;
        while(cur) {
            out.push(byKey.get(cur));
            if(cur===startKey) break;
            cur=parent.get(cur);
        }
        if(out[out.length-1] && key(out[out.length-1])===startKey) return out.reverse();
        return null;
    }

    function routeCluster(c,dir,entry,exit) {
        if(!entry||!exit) return [];
        const start={...entry.hex},goal={...exit.hex};
        const startKey=key(start),goalKey=key(goal);
        const queue=[start];
        const seen=new Set([startKey]);
        const parent=new Map();
        const byKey=new Map([[startKey,start]]);
        // Keep the bypass local to this stretch of boulevard. The +3 radial
        // allowance is enough to skirt even the larger authored embassy/shop
        // footprints without letting BFS wander across the city.
        const minRad=Math.max(0,Math.min(entry.d,exit.d)-3);
        const maxRad=Math.max(entry.d,exit.d)+3;
        let cursor=0,visited=0;
        while(cursor<queue.length && visited<600) {
            const cur=queue[cursor++]; visited++;
            if(key(cur)===goalKey) break;
            for(const n of (window.getNeighbors?.(cur.q,cur.r)||[])) {
                const nk=key(n);
                if(seen.has(nk)) continue;
                const radial=dist(c,n);
                if(radial<minRad||radial>maxRad) continue;
                if(nk!==goalKey && BLOCKERS.has(terrain(n))) continue;
                seen.add(nk); parent.set(nk,key(cur)); byKey.set(nk,{...n}); queue.push({...n});
            }
        }
        const path=reconstructPath(parent,startKey,goalKey,byKey);
        if(!path) return [];
        const painted=[];
        for(const h of path) if(paintSafe(h)) painted.push({...h});
        return painted;
    }

    function ensureAvenueDetours() {
        const c=centre();
        const registry=window.SilverhartCapitalRegistry;
        if(!c||!registry||!window.setTerrainAt) return false;
        const inner=Number(window.campaign2SilverhartRingRoadRadius||registry.innerRingRadius||30);
        const wall=Number(window.campaign2SilverhartCityWallRadius||registry.cityWallRadius||60);
        const lineEnd=wall+8;
        const detours=[];
        const blocked=[];

        DIRS.forEach(dir => {
            let d=inner;
            while(d<=lineEnd) {
                const h=lineHex(c,dir,d);
                const t=terrain(h);
                if(t==='Path') { d++; continue; }
                if(!BLOCKERS.has(t)) { paintSafe(h); d++; continue; }

                // Consume the entire contiguous blocked run on the ideal
                // centreline. Every member is retained in diagnostics so a
                // test/debug overlay can explain exactly what forced the road
                // off-axis.
                const cluster=[];
                let scan=d;
                while(scan<=lineEnd) {
                    const bh=lineHex(c,dir,scan);
                    const bt=terrain(bh);
                    if(!BLOCKERS.has(bt)) break;
                    const item={direction:dir.name,d:scan,hex:{...bh},terrain:bt};
                    cluster.push(item); blocked.push(item); scan++;
                }

                const entry=findClearLinePoint(c,dir,d-1,-1,inner-3,lineEnd);
                const exit=findClearLinePoint(c,dir,scan,1,inner-3,lineEnd+3);
                const bypass=routeCluster(c,dir,entry,exit);

                // Associate the connected bypass with every blocked ideal
                // centreline cell in the cluster. This makes diagnostics say
                // "this authored building caused this detour" rather than
                // only recording the cluster's first cell.
                for(const item of cluster) {
                    for(const p of bypass) {
                        if(entry && key(p)===key(entry.hex)) continue;
                        if(exit && key(p)===key(exit.hex)) continue;
                        detours.push({direction:dir.name,d:item.d,hex:{...p},around:{...item.hex}});
                    }
                }
                d=Math.max(scan,d+1);
            }
        });

        registry.avenueDiagnostics={blocked,detours};
        window._campaign2TerrainBaseline={...window.overrideTerrain};
        window._campaign2TileObjectsBaseline={...window.tileObjects};
        return true;
    }

    function installWrapper() {
        if(wrapperInstalled) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function'||!original.__silverhartCapitalCompletion) return false;
        if(original.__silverhartAvenueDetours){wrapperInstalled=true;return true;}
        const wrapped=function(...args){
            const result=original.apply(this,args);
            ensureAvenueDetours();
            return result;
        };
        wrapped.__silverhartAvenueDetours=true;
        wrapped.__silverhartCapitalCompletion=true;
        wrapped.__silverhartCapitalRebuild=true;
        wrapped.__original=original;
        window.setupVillageScene=wrapped;
        wrapperInstalled=true;
        return true;
    }

    window.SilverhartAvenueDetours={ensureAvenueDetours,installWrapper};
    const timer=setInterval(()=>{
        if(installWrapper()) {
            if(window.currentCampaign==='2') ensureAvenueDetours();
            clearInterval(timer);
        }
    },25);
    setTimeout(()=>clearInterval(timer),5000);
})();
