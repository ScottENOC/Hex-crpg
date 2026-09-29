// shieldInventoryInstances.js
// End-to-end player shield identity without forcing the combat engine to stop
// using stable item-definition IDs in equipped slots. Inventory owns physical
// objects; equippedInstances remembers which physical object supplies a slot.
(()=>{'use strict';
const identity=()=>window.equipmentIdentity;
const baseId=v=>window.getEquipmentBaseId?.(v)||v;
const isShield=v=>window.items?.[baseId(v)]?.type==='shield';
function ensureInstances(player){
 if(!player?.inventory||!identity())return;
 player.inventory=player.inventory.map(v=>isShield(v)&&!identity().isInstance(v)?identity().make(baseId(v),{provenance:'found'}):v);
 player.equippedInstances=player.equippedInstances||{};
 // A legacy equipped shield has no physical object attached yet. Claim the
 // first matching backpack instance; if none exists, create one. Inventory in
 // this game includes equipped gear, so it remains in the shared pool.
 if(isShield(player.equipped?.offhand)&&!player.equippedInstances.offhand){
   const id=baseId(player.equipped.offhand);
   let inst=player.inventory.find(v=>identity().isInstance(v)&&v.itemId===id&&!Object.values(player.equippedInstances).includes(v));
   if(!inst){inst=identity().make(id,{provenance:'found'});player.inventory.push(inst);}
   player.equippedInstances.offhand=inst;
 }
}
function findInstance(player,instanceId){ensureInstances(player);return player?.inventory?.find(v=>identity()?.isInstance(v)&&v.instanceId===instanceId)||null;}
function equip(instanceId){
 const p=window.player,inst=findInstance(p,instanceId);if(!p||!inst||!isShield(inst))return;
 const ent=window.entities?.find(e=>e.name===p.name);if(!ent)return;
 if(window.isInCombat){if(window.gamePhase!=='PLAYER_TURN'||window.currentTurnEntity!==ent){window.showMessage?.("It must be this character's turn to change equipment.");return;}if(ent.timePoints<1){window.showMessage?.('Not enough Time Points to change equipment.');return;}}
 const def=window.items[inst.itemId],weaponId=baseId(p.equipped?.weapon),weapon=weaponId&&window.items[weaponId];
 if(weapon?.hands===2)p.equipped.weapon=null;
 p.equipped.offhand=inst.itemId; // compatibility ID for combat/stat code
 p.equippedInstances=p.equippedInstances||{};p.equippedInstances.offhand=inst;
 if(window.isInCombat)ent.timePoints-=1;
 if(ent){ent.equipped=p.equipped;ent.equippedInstances=p.equippedInstances;}
 window.showInventoryScreen?.();window.drawMap?.();window.renderEntities?.();window.updatePlayerUI?.();
 window.showMessage?.(`Equipped ${window.describeEquipment?.(inst)||def.name}.`);
}
function unequip(){const p=window.player;if(!p)return;p.equipped.offhand=null;if(p.equippedInstances)delete p.equippedInstances.offhand;const ent=window.entities?.find(e=>e.name===p.name);if(ent){ent.equipped=p.equipped;ent.equippedInstances=p.equippedInstances;}window.showInventoryScreen?.();window.drawMap?.();window.renderEntities?.();}
function renderShieldSection(){
 const p=window.player,content=document.getElementById('inventory-content');if(!p||!content)return;ensureInstances(p);
 content.querySelector('#physical-shields')?.remove();const shields=p.inventory.filter(v=>identity().isInstance(v)&&isShield(v));if(!shields.length)return;
 // Hide the old grouped shield row; it cannot distinguish physical designs.
 [...content.querySelectorAll('strong')].forEach(el=>{if(shields.some(s=>el.textContent.startsWith(window.items[s.itemId]?.name||'\0')))el.closest('div[style*="border-bottom"]')?.remove();});
 const box=document.createElement('div');box.id='physical-shields';box.innerHTML='<h3>Shields</h3>';
 for(const inst of shields){const equipped=p.equippedInstances?.offhand?.instanceId===inst.instanceId,row=document.createElement('div');row.style.cssText='margin-bottom:10px;border-bottom:1px solid #444;padding-bottom:5px';const def=window.items[inst.itemId];row.innerHTML=`<strong>${window.describeEquipment(inst)}</strong> <span style="color:#aaa">(${def.shieldVisual?.material||'wood'}, ${def.shieldVisual?.shape||'round'})</span>${equipped?' <span style="color:#4caf50">Equipped</span>':''}<br><button data-shield-instance="${inst.instanceId}">${equipped?'Unequip':'Equip Off-hand'}</button>`;row.querySelector('button').onclick=()=>equipped?unequip():equip(inst.instanceId);box.appendChild(row);}
 const backpackHeading=[...content.querySelectorAll('h3')].find(h=>h.textContent==='Backpack');backpackHeading?.parentNode.insertBefore(box,backpackHeading.nextSibling);
}
function install(){const old=window.showInventoryScreen;if(typeof old!=='function'||old.__physicalShieldInstances)return false;window.showInventoryScreen=function(...a){ensureInstances(window.player);const r=old.apply(this,a);renderShieldSection();return r;};window.showInventoryScreen.__physicalShieldInstances=true;const oldUnequip=window.unequipItem;if(typeof oldUnequip==='function')window.unequipItem=function(slot){if(slot==='offhand'&&window.player?.equippedInstances?.offhand)return unequip();return oldUnequip.apply(this,arguments);};return true;}
window.shieldInventoryInstances={ensureInstances,findInstance,equip,unequip,renderShieldSection};
const timer=setInterval(()=>{if(install()){clearInterval(timer);ensureInstances(window.player);}},50);window.addEventListener('load',()=>ensureInstances(window.player),{once:true});
})();
