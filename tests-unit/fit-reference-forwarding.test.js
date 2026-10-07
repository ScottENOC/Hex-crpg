import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=process.cwd();
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function installWrappers({baseDrawSlot,clothingTargets={front:{pants:{x:0,y:0,w:1,h:1}}}}){
  const context={
    console,
    window:{
      clothingSystem:{
        drawSlot:baseDrawSlot,
        clothingTargets,
        getItemSpec:()=>null,
        tintWholeLayer:(img)=>img,
        getLayerColour:()=>null,
      },
      items:{pants_shorts:{name:'Shorts'}},
      assetManager:{request:()=>null,whenReady:()=>Promise.resolve()},
      equipmentAppearanceSystem:{isSlotVisible:()=>true,redraw:()=>{}},
      renderEntities:()=>{},
      refreshDirectionalTurnPortraits:()=>{},
      worldSeconds:0,
      entities:[],
      player:null,
      PRESENTATION_BUILD:'test',
    },
    document:{
      readyState:'loading',
      createElement:(tag)=>tag==='canvas'
        ? {width:0,height:0,getContext:()=>({})}
        : {style:{},appendChild(){},querySelector(){return null},querySelectorAll(){return []}},
      querySelectorAll:()=>[],
      body:{},
    },
    MutationObserver:class{observe(){}},
    setInterval:()=>0,
    clearInterval:()=>{},
  };
  context.window.window=context.window;
  vm.runInNewContext(read('skirtClothing.js'),context,{filename:'skirtClothing.js'});
  vm.runInNewContext(read('seasonalClothing.js'),context,{filename:'seasonalClothing.js'});
  return context.window.clothingSystem;
}

test('skirt and seasonal drawSlot wrappers preserve fitReference',()=>{
  const baseCalls=[];
  const baseDrawSlot=(...args)=>{baseCalls.push(args);return false;};
  const fitReference={shirtWidthPx:123,pantsWidthPx:97,boundsWidthPx:200};

  const cs=installWrappers({baseDrawSlot});
  const entity={equipped:{pants:'pants_breeches'},side:'player',gender:'female',race:'human'};

  cs.drawSlot({},entity,'shirt','front',{},fitReference);
  assert.equal(baseCalls.at(-1)[5],fitReference);

  cs.drawSlot({},entity,'pants','front',{},fitReference);
  assert.equal(baseCalls.at(-1)[5],fitReference);
});
