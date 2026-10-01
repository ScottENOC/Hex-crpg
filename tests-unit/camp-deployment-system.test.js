const assert = require('assert');
const mod = require('../campDeploymentSystem.js');
function member(name,q=0,r=0){ return {name,alive:true,side:'player',hex:{q,r}}; }
function reset(terrain='Grass') {
  global.tileObjects = {};
  global.entities = [];
  global.player = {hex:{q:0,r:0}};
  global.getTerrainAt = () => ({name:terrain});
  global.isHexInBounds = () => true;
}
function plan(members, tents, bedrolls, fireLit=true){
  return {ok:true,site:{indoor:false},anchorHex:{q:0,r:0},members,tents,bedrolls,fireLit};
}
function dist(hex){
  const dq=hex.q, dr=hex.r;
  return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;
}
reset();
let fps = mod.tentFootprints({q:1,r:0});
assert.strictEqual(fps.length,6);
assert.ok(fps.every(fp => fp.length===4 && new Set(fp.map(h=>`${h.q},${h.r}`)).size===4));

reset('Rocky Outcrop');
assert.strictEqual(mod.terrainAllowsCampObject({q:1,r:0}),false);
reset('Forest');
assert.strictEqual(mod.terrainAllowsCampObject({q:1,r:0}),false);

reset();
const ms=[member('A'),member('B'),member('C'),member('D')];
global.entities=[...ms];
let p=plan(ms,[{occupants:ms}],ms,true);
let layout=mod.buildDeploymentLayout(p);
assert.strictEqual(layout.ok,true);
assert.strictEqual(layout.tents.length,1);
assert.strictEqual(layout.tents[0].footprint.length,4);
assert.strictEqual(new Set(layout.tents[0].footprint.map(h=>`${h.q},${h.r}`)).size,4);
assert.ok(layout.bedrolls.every(b=>b.sheltered));
assert.ok(layout.fire);
assert.ok(!layout.tents[0].footprint.some(h=>h.q===layout.fire.q&&h.r===layout.fire.r));

reset();
global.tileObjects['1,0']={type:'timber_tree'};
const two=[member('A'),member('B')]; global.entities=[...two];
layout=mod.buildDeploymentLayout(plan(two,[{occupants:two}],two,true));
assert.strictEqual(layout.ok,true);
assert.ok(!layout.tents[0].footprint.some(h=>h.q===1&&h.r===0));
assert.ok(!(layout.fire.q===1&&layout.fire.r===0));

reset('Rocky Outcrop');
global.entities=[...two];
layout=mod.buildDeploymentLayout(plan(two,[{occupants:two}],two,true));
assert.strictEqual(layout.ok,false);
assert.match(layout.reason,/clear ground nearby/i);
assert.match(layout.reason,/trees, rocky ground, water/i);

// Search must genuinely extend past the old five-hex limit. Everything at
// radius <=5 is forest; the first usable camp ground is radius 6-8.
reset();
global.getTerrainAt=(q,r)=>({name:dist({q,r})<=5?'Forest':'Grass'});
global.entities=[...two];
layout=mod.buildDeploymentLayout(plan(two,[{occupants:two}],two,true));
assert.strictEqual(layout.ok,true);
assert.ok(layout.tents[0].footprint.every(h=>dist(h)>5));
assert.ok(dist(layout.fire)>5);

reset();
global.entities=[...two];
global.invalidateTileLightsCache=()=>{};
global.invalidateVisibilityCache=()=>{};
global.drawMap=()=>{};
global.renderEntities=()=>{};
layout=mod.buildDeploymentLayout(plan(two,[{occupants:two}],two,true));
mod.deployLayout(layout, p);
assert.strictEqual(global.tileObjects[`${layout.fire.q},${layout.fire.r}`].type,'fireplace');
assert.strictEqual(global.tileObjects[`${layout.fire.q},${layout.fire.r}`].lit,true);
mod.removeDeployment();
assert.strictEqual(global.tileObjects[`${layout.fire.q},${layout.fire.r}`],undefined);
console.log('camp deployment tests: 9 passed');
