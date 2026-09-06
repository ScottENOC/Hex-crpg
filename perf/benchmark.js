const { performance } = require('perf_hooks');

function makeEntities(n) {
  return Array.from({length:n}, (_,i) => ({
    alive: true,
    hex: {q:i%211, r:(i*17)%197},
    extraHexes: i%20===0 ? [{q:1,r:0},{q:0,r:1}] : [],
    getAllHexes() {
      return [{q:this.hex.q,r:this.hex.r}, ...this.extraHexes.map(o=>({q:this.hex.q+o.q,r:this.hex.r+o.r}))];
    }
  }));
}

function oldGetEntityAtHex(entities,q,r) {
  return entities.find(e => e.alive && e.getAllHexes().some(h => h.q===q && h.r===r));
}

function buildIndex(entities) {
  const m=new Map();
  for (const e of entities) if (e.alive) for (const h of e.getAllHexes()) {
    const k=`${h.q},${h.r}`;
    let b=m.get(k);
    if(!b)m.set(k,b=[]);
    b.push(e);
  }
  return m;
}

function bench(fn, rounds=8) {
  for(let i=0;i<3;i++) fn();
  const times=[];
  for(let i=0;i<rounds;i++){
    const t=performance.now();
    fn();
    times.push(performance.now()-t);
  }
  times.sort((a,b)=>a-b);
  return times[Math.floor(times.length/2)];
}

const lookups=Array.from({length:2000},(_,i)=>({q:(i*37)%223,r:(i*53)%211}));
console.log('entities,oldLookupMs,indexBuildMs,indexedLookupMs,speedup');
for(const n of [100,250,500,1000,2000,5000]){
  const es=makeEntities(n);
  const old=bench(()=>{for(const h of lookups) oldGetEntityAtHex(es,h.q,h.r)},5);
  const build=bench(()=>buildIndex(es),8);
  const idx=buildIndex(es);
  const fast=bench(()=>{for(const h of lookups) idx.get(`${h.q},${h.r}`)},8);
  console.log([n,old.toFixed(3),build.toFixed(3),fast.toFixed(3),(old/(build+fast)).toFixed(1)+'x'].join(','));
}

// Touch/pinch coalescing model: 240 gesture events/s on a 60Hz display.
// Before: every event causes a draw. After: at most one draw per display frame.
const gestureEvents=240, displayFrames=60;
console.log(`gestureDrawsBefore=${gestureEvents}`);
console.log(`gestureDrawsAfterMax=${displayFrames}`);
console.log(`gestureRenderReduction=${((1-displayFrames/gestureEvents)*100).toFixed(0)}%`);
