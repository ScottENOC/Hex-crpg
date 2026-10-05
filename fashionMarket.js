// Silverhart fashion market: daily coloured stock plus delayed bespoke commissions.
(() => {
  'use strict';
  const BUILD='20260930-silverhart-fashion-v1';
  const GARMENT_PRICES={
    top_blouse:28,top_dress:48,top_shirt_f:26,top_masc_laced:28,
    pants_baggy_wraps:18,pants_breeches:28,
    pants_hose:24,pants_trousers:22,pants_shorts:18,pants_skirt:30,underwear_briefs:7,
    underwear_briefs_gstring:9,underwear_bra:12,underwear_bra_halter:30,underwear_bra_strapless:14
  };
  const STANDARD_ARMOUR=['light_armor','medium_armor','heavy_armor'];
  const PALETTE=[
    {name:'Brown',hue:28,saturation:62,value:48,weight:18,price:1},
    {name:'Cream',hue:42,saturation:20,value:92,weight:15,price:1},
    {name:'Black',hue:0,saturation:3,value:16,weight:14,price:1},
    {name:'White',hue:0,saturation:0,value:98,weight:12,price:1},
    {name:'Charcoal',hue:220,saturation:7,value:28,weight:10,price:1},
    {name:'Grey',hue:210,saturation:8,value:58,weight:9,price:1},
    {name:'Navy',hue:222,saturation:64,value:38,weight:6,price:1.05},
    {name:'Forest',hue:122,saturation:50,value:38,weight:6,price:1.05},
    {name:'Rust',hue:16,saturation:68,value:58,weight:5,price:1.05},
    {name:'Burgundy',hue:345,saturation:58,value:42,weight:4,price:1.08},
    {name:'Blue',hue:210,saturation:64,value:68,weight:4,price:1.08},
    {name:'Red',hue:0,saturation:70,value:68,weight:3,price:1.10},
    {name:'Teal',hue:178,saturation:58,value:55,weight:2,price:1.10},
    {name:'Purple',hue:278,saturation:55,value:56,weight:1.5,price:1.12},
    {name:'Rose',hue:338,saturation:46,value:76,weight:1,price:1.14},
    {name:'Gold',hue:48,saturation:78,value:82,weight:.55,price:1.18},
    {name:'Fuchsia',hue:316,saturation:82,value:82,weight:.22,price:1.28},
  ];
  const OPACITY=[
    {value:1,weight:78,label:''},{value:.94,weight:9,label:'light weave'},
    {value:.86,weight:6,label:'fine weave'},{value:.74,weight:4,label:'semi-sheer'},
    {value:.58,weight:2,label:'sheer'},{value:.38,weight:1,label:'very sheer'}
  ];
  const METAL_TONES=[
    {name:'Blackened steel',value:32,weight:15,price:1.08},
    {name:'Dark iron',value:48,weight:24,price:1},
    {name:'Steel',value:68,weight:36,price:1},
    {name:'Bright steel',value:82,weight:18,price:1.06},
    {name:'Polished steel',value:94,weight:7,price:1.12},
  ];
  const STAFF=[
    {name:'Sera Pell',title:'Garment Seller',gender:'female',dialogueId:'silverhart_fashion_stock',near:'clothier',color:'#6d455d'},
    {name:'Ilyra Vane',title:'Master Tailor',gender:'female',dialogueId:'silverhart_tailor',near:'clothier',color:'#865f8f'},
    {name:'Maela Darr',title:'Armourer',gender:'female',dialogueId:'silverhart_armour_stock',near:'general',color:'#5a5d66'},
    {name:'Garran Kest',title:'Master Armourer',gender:'male',dialogueId:'silverhart_armourer',near:'general',color:'#535a63'},
  ];
  let installed=false;

  function primary(){return window.party?.[0]||window.player||null;}
  function state(){
    const p=primary(); if(!p)return null;
    if(!p.silverhartFashionMarket||typeof p.silverhartFashionMarket!=='object')p.silverhartFashionMarket={version:1,stock:{},commissions:[],nextCommission:1};
    const s=p.silverhartFashionMarket;s.stock=s.stock||{};s.commissions=Array.isArray(s.commissions)?s.commissions:[];s.nextCommission=Number(s.nextCommission)||1;return s;
  }
  function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function hash(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function rngFor(seed){let x=hash(seed)||0x12345678;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
  function weighted(list,rng){const total=list.reduce((n,x)=>n+x.weight,0);let r=rng()*total;for(const x of list){r-=x.weight;if(r<=0)return x;}return list[list.length-1];}
  function day(){return Math.floor(Math.max(0,Number(window.worldSeconds)||0)/86400);}
  function hourText(seconds){const h=Math.max(0,Math.ceil(seconds/3600));if(h<24)return`${h} hour${h===1?'':'s'}`;const d=Math.floor(h/24),r=h%24;return r?`${d}d ${r}h`:`${d} day${d===1?'':'s'}`;}
  function ensurePrices(){for(const[id,price]of Object.entries(GARMENT_PRICES))if(window.items?.[id]&&window.items[id].buyPrice==null)window.items[id].buyPrice=price;}
  function garmentIds(){ensurePrices();return Object.entries(window.items||{}).filter(([,d])=>d?.type==='clothes').map(([id])=>id).filter(id=>window.clothingSystem?.getItemSpec?.(id)).sort((a,b)=>(window.items[a]?.name||a).localeCompare(window.items[b]?.name||b));}
  function armourIds(){return STANDARD_ARMOUR.filter(id=>window.items?.[id]&&window.equipmentAppearanceSystem?.armourParts?.(id)?.length);}
  function basePrice(id){const d=window.items?.[id];return Math.max(1,Number(d?.buyPrice??GARMENT_PRICES[id]??20));}
  function hsvCss(c){const rgb=window.preciseHSVToRGB?.(c.hue,c.saturation,c.value);return rgb?`rgb(${rgb.join(',')})`:`hsl(${c.hue} ${c.saturation}% ${Math.max(10,c.value)}%)`;}

  function garmentVariant(itemId,vendor,index,stockDay){
    const rng=rngFor(`${vendor}|${stockDay}|${itemId}|${index}`),spec=window.clothingSystem.getItemSpec(itemId),appearance={clothing:{}},names=[];let priceMult=1;
    spec.layers.forEach((part,i)=>{
      const pal=weighted(PALETTE,rng),op=weighted(OPACITY,rng);
      appearance.clothing[part.id]={hue:pal.hue,saturation:pal.saturation,value:pal.value,opacity:op.value};
      names.push(pal.name);priceMult*=pal.price;if(i===0&&op.value<.95){names.push(op.label);priceMult*=1+(1-op.value)*.28;}
    });
    const unique=[...new Set(names.filter(Boolean))],designName=unique.join(' / ');
    return{stockId:`${vendor}-${stockDay}-${itemId}-${index}`,itemId,designName,appearance,price:Math.max(1,Math.round(basePrice(itemId)*priceMult))};
  }
  function armourVariant(itemId,vendor,index,stockDay){
    const rng=rngFor(`${vendor}|${stockDay}|${itemId}|${index}`),parts=window.equipmentAppearanceSystem.armourParts(itemId),appearance={armour:{}},names=[];let price=basePrice(itemId);
    parts.forEach(part=>{
      if(part==='metal'){
        if(rng()<.035){
          const pal=weighted(PALETTE,rng);appearance.armour[part]={hue:pal.hue,saturation:Math.max(24,pal.saturation*.72),value:Math.min(90,Math.max(35,pal.value)),opacity:1,unlocked:true};
          names.push(`${pal.name} metal`);price+=Math.max(250,Math.round(basePrice(itemId)*3));
        }else{
          const tone=weighted(METAL_TONES,rng);appearance.armour[part]={hue:210,saturation:8,value:tone.value,opacity:1,unlocked:false};names.push(tone.name);price*=tone.price;
        }
      }else{
        const pal=weighted(PALETTE,rng);appearance.armour[part]={hue:pal.hue,saturation:pal.saturation,value:pal.value,opacity:1,unlocked:true};names.push(pal.name);price*=pal.price;
      }
    });
    return{stockId:`${vendor}-${stockDay}-${itemId}-${index}`,itemId,designName:[...new Set(names)].join(' / '),appearance,price:Math.round(price)};
  }
  function ensureStock(vendor,kind){
    const s=state();if(!s)return[];const today=day(),cur=s.stock[vendor];if(cur?.day===today&&Array.isArray(cur.entries))return cur.entries;
    const ids=kind==='garment'?garmentIds():armourIds(),entries=[];
    for(const id of ids){const count=kind==='garment'?2:3;for(let i=0;i<count;i++)entries.push(kind==='garment'?garmentVariant(id,vendor,i,today):armourVariant(id,vendor,i,today));}
    s.stock[vendor]={day:today,entries};return entries;
  }
  function makeInstance(itemId,appearance,designName,provenance){return window.equipmentIdentity?.make?.(itemId,{appearance:clone(appearance),designName,provenance})||{instanceId:`silverhart-${Date.now()}-${Math.random()}`,itemId,appearance:clone(appearance),designName,provenance};}
  function grantStyledItem(itemId,appearance,designName,provenance){
    const p=primary();if(!p)return false;p.inventory=p.inventory||[];p.inventory.push(itemId);
    const members=(window.party&&window.party.length)?window.party:[p];
    let primaryInstance=null;
    for(const member of members){
      member.physicalEquipment=Array.isArray(member.physicalEquipment)?member.physicalEquipment:[];
      const instance=makeInstance(itemId,appearance,designName,provenance);
      member.physicalEquipment.push(instance);
      if(member===p)primaryInstance=instance;
      window.physicalEquipment?.reconcile?.(member);
    }
    window.syncPlayerEntity?.();window.renderEntities?.();return primaryInstance||true;
  }
  function buyStock(vendor,stockId,kind){
    const p=primary(),s=state();if(!p||!s)return;const bucket=s.stock[vendor],idx=bucket?.entries?.findIndex(x=>x.stockId===stockId)??-1;if(idx<0)return;const entry=bucket.entries[idx];
    if((p.gold||0)<entry.price){window.showMessage?.(`You need ${entry.price} gold.`);return;}
    p.gold-=entry.price;grantStyledItem(entry.itemId,entry.appearance,entry.designName,`silverhart-${kind}-stock`);bucket.entries.splice(idx,1);window.showMessage?.(`Bought ${window.items[entry.itemId]?.name||entry.itemId} — ${entry.designName}.`);openStock(vendor,kind);
  }

  function closeModal(id){document.getElementById(id)?.remove();}
  function injectStyle(){if(document.getElementById('silverhart-fashion-style'))return;const s=document.createElement('style');s.id='silverhart-fashion-style';s.textContent=`
    .sf-overlay{position:fixed;inset:0;background:#000b;z-index:10040;display:flex;align-items:center;justify-content:center;padding:12px}
    .sf-panel{width:min(760px,96vw);max-height:88vh;overflow:auto;background:#1d1d1d;color:#eee;border:1px solid #777;border-radius:10px;padding:14px;box-sizing:border-box}
    .sf-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}.sf-head h2{margin:0 auto 0 0}.sf-close{width:auto;padding:5px 9px}
    .sf-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 4px;border-bottom:1px solid #3d3d3d}
    .sf-name{font-weight:700}.sf-sub{font-size:.8em;color:#aaa;margin-top:3px}.sf-swatches{display:flex;gap:4px;margin-top:5px;flex-wrap:wrap}.sf-swatch{width:20px;height:20px;border-radius:3px;border:1px solid #777;box-sizing:border-box}
    .sf-buy{width:auto;min-width:90px}.sf-editor{display:grid;gap:8px}.sf-editor select,.sf-editor input[type=text]{width:100%;box-sizing:border-box;background:#222;color:#eee;border:1px solid #555;border-radius:4px;padding:7px}
    .sf-part{border:1px solid #444;border-radius:6px;padding:8px}.sf-part>strong{display:block;margin-bottom:5px}.sf-price{font-weight:700;color:#ffd166;font-size:1.08em}
    .sf-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.sf-actions button{width:auto;flex:1;min-width:150px}.sf-note{font-size:.82em;color:#bbb;line-height:1.35}
  `;document.head.appendChild(s);}
  function modal(title){injectStyle();const ov=document.createElement('div');ov.className='sf-overlay';ov.id='silverhart-fashion-modal';const p=document.createElement('div');p.className='sf-panel';const h=document.createElement('div');h.className='sf-head';const t=document.createElement('h2');t.textContent=title;const x=document.createElement('button');x.className='sf-close';x.textContent='Close';x.onclick=()=>ov.remove();h.append(t,x);p.appendChild(h);ov.appendChild(p);ov.onclick=e=>{if(e.target===ov)ov.remove();};document.body.appendChild(ov);return p;}
  function swatches(entry){const w=document.createElement('div');w.className='sf-swatches';const buckets=entry.appearance?.clothing||entry.appearance?.armour||{};for(const c of Object.values(buckets)){const s=document.createElement('span');s.className='sf-swatch';s.style.background=hsvCss(c);s.style.opacity=String(c.opacity??1);s.title=`H${Math.round(c.hue)} S${Math.round(c.saturation)} V${Math.round(c.value)}${c.opacity<1?` · ${Math.round((1-c.opacity)*100)}% transparent`:''}`;w.appendChild(s);}return w;}
  function openStock(vendor,kind){
    closeModal('silverhart-fashion-modal');const p=modal(kind==='garment'?'Silverhart ready-made garments':'Silverhart armour showroom'),entries=ensureStock(vendor,kind),gold=document.createElement('div');gold.className='sf-note';gold.textContent=`Your gold: ${primary()?.gold||0}. Stock changes once per in-game day; sold pieces stay sold until the next restock.`;p.appendChild(gold);
    if(!entries.length){const empty=document.createElement('p');empty.textContent='Sold out for today. Come back after the next restock.';p.appendChild(empty);return;}
    const sorted=[...entries].sort((a,b)=>(window.items[a.itemId]?.name||a.itemId).localeCompare(window.items[b.itemId]?.name||b.itemId)||a.designName.localeCompare(b.designName));
    for(const e of sorted){const row=document.createElement('div');row.className='sf-row';const info=document.createElement('div'),n=document.createElement('div');n.className='sf-name';n.textContent=`${window.items[e.itemId]?.name||e.itemId} — ${e.designName}`;const sub=document.createElement('div');sub.className='sf-sub';sub.textContent=kind==='garment'?'A physical garment with its own colour/transparency combination.':'A physical suit with its own material finish.';info.append(n,sub,swatches(e));const b=document.createElement('button');b.className='sf-buy';b.textContent=`Buy · ${e.price}g`;b.onclick=()=>buyStock(vendor,e.stockId,kind);row.append(info,b);p.appendChild(row);}
  }

  function ensurePrecisePicker(done){if(window.buildPreciseColorPicker){done();return;}let s=document.querySelector('script[data-sf-precise-picker]');if(s){s.addEventListener('load',done,{once:true});return;}s=document.createElement('script');s.src=`preciseAppearanceColor.js?build=${BUILD}`;s.async=false;s.dataset.sfPrecisePicker='true';s.addEventListener('load',done,{once:true});document.head.appendChild(s);}
  function transparencyControl(value,onChange){const wrap=document.createElement('label');wrap.style.cssText='display:grid;grid-template-columns:120px 1fr 45px;gap:7px;align-items:center;font-size:.85em';const l=document.createElement('span');l.textContent='Transparency';const i=document.createElement('input');i.type='range';i.min='0';i.max='90';i.step='1';i.value=String(Math.round((1-(value.opacity??1))*100));const out=document.createElement('span');out.textContent=`${i.value}%`;i.oninput=()=>{out.textContent=`${i.value}%`;onChange(1-Number(i.value)/100);};wrap.append(l,i,out);return wrap;}
  function metalToneControl(value,onChange){const wrap=document.createElement('label');wrap.style.cssText='display:grid;grid-template-columns:120px 1fr 45px;gap:7px;align-items:center;font-size:.85em';const l=document.createElement('span');l.textContent='Steel tone';const i=document.createElement('input');i.type='range';i.min='20';i.max='100';i.value=String(Math.round(value.value??72));const out=document.createElement('span');out.textContent=i.value;i.oninput=()=>{out.textContent=i.value;onChange(Number(i.value));};wrap.append(l,i,out);return wrap;}
  function commissionLead(kind,itemId){if(kind==='armor'){const r=Number(window.items?.[itemId]?.reduction||0);return(r>=3?48:r>=2?36:24)*3600;}const n=(window.items?.[itemId]?.name||'').toLowerCase();if(n.includes('brief')||n.includes('bra')||n.includes('g-string'))return 4*3600;if(n.includes('dress')||n.includes('robe')||n.includes('doublet'))return 18*3600;return 10*3600;}
  function commissionPrice(kind,itemId,appearance){let price=Math.round(basePrice(itemId)*1.55)+(kind==='armor'?35:15);if(kind==='garment'){for(const c of Object.values(appearance.clothing||{}))if((c.opacity??1)<.8)price+=Math.round((.8-c.opacity)*50);}else{for(const c of Object.values(appearance.armour||{}))if(c.unlocked&&c.__metal)price+=Math.max(300,Math.round(basePrice(itemId)*3.5));}return price;}
  function placeCommission(kind,itemId,appearance,designName){const p=primary(),s=state();if(!p||!s)return;const price=commissionPrice(kind,itemId,appearance),lead=commissionLead(kind,itemId);if((p.gold||0)<price){window.showMessage?.(`You need ${price} gold.`);return;}p.gold-=price;const id=s.nextCommission++;s.commissions.push({id,kind,itemId,appearance:clone(appearance),designName:designName||'Bespoke',price,placedAt:Number(window.worldSeconds)||0,readyAt:(Number(window.worldSeconds)||0)+lead,collected:false,notified:false});closeModal('silverhart-fashion-modal');window.showMessage?.(`Commission placed for ${window.items[itemId]?.name||itemId}. Ready in ${hourText(lead)}.`);}
  function openDesigner(kind,free=false){ensurePrecisePicker(()=>openDesignerReady(kind,free));}
  function openDesignerReady(kind,free=false){
    closeModal('silverhart-fashion-modal');const p=modal(free?'Dev colour editor':(kind==='garment'?'Commission a bespoke garment':'Commission bespoke armour')),editor=document.createElement('div');editor.className='sf-editor';const ids=kind==='garment'?garmentIds():armourIds(),sel=document.createElement('select');for(const id of ids){const o=document.createElement('option');o.value=id;o.textContent=window.items[id]?.name||id;sel.appendChild(o);}editor.appendChild(sel);const design=document.createElement('input');design.type='text';design.maxLength=32;design.placeholder='Optional design name';editor.appendChild(design);const controls=document.createElement('div');editor.appendChild(controls);const summary=document.createElement('div');summary.className='sf-price';editor.appendChild(summary);const note=document.createElement('div');note.className='sf-note';editor.appendChild(note);const actions=document.createElement('div');actions.className='sf-actions';const order=document.createElement('button');order.textContent=free?'Apply colour':'Place commission';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>closeModal('silverhart-fashion-modal');actions.append(order,cancel);editor.appendChild(actions);p.appendChild(editor);
    let appearance={};
    const rebuild=()=>{
      controls.innerHTML='';const id=sel.value;
      if(kind==='garment'){
        const spec=window.clothingSystem.getItemSpec(id);appearance={clothing:{}};
        for(const part of spec.layers){const c={...part.defaultColor,opacity:part.defaultColor?.opacity??1};appearance.clothing[part.id]=c;const box=document.createElement('div');box.className='sf-part';const h=document.createElement('strong');h.textContent=part.label||part.id;box.appendChild(h);box.appendChild(window.buildPreciseColorPicker({key:`sf-${id}-${part.id}`,label:'Colour',hue:c.hue,saturation:c.saturation,value:c.value,compact:true,onChange:next=>{Object.assign(c,next);refresh();}}));box.appendChild(transparencyControl(c,op=>{c.opacity=op;refresh();}));controls.appendChild(box);}
      }else{
        appearance={armour:{}};const parts=window.equipmentAppearanceSystem.armourParts(id);
        for(const part of parts){const src=clone(window.equipmentAppearanceSystem.getArmourMaterial(primary(),id,part))||{hue:210,saturation:8,value:72,opacity:1,unlocked:false};const c={...src,opacity:1};appearance.armour[part]=c;const box=document.createElement('div');box.className='sf-part';const h=document.createElement('strong');h.textContent=part==='metal'?'Metal':part==='leather'?'Leather':part==='clothTrim'?'Cloth trim':part[0].toUpperCase()+part.slice(1);box.appendChild(h);
          if(part==='metal'){
            c.__metal=true;c.unlocked=false;c.hue=210;c.saturation=8;box.appendChild(metalToneControl(c,v=>{c.value=v;refresh();}));const toggle=document.createElement('label');toggle.style.cssText='display:flex;gap:6px;align-items:center;font-size:.85em;margin-top:6px';const cb=document.createElement('input');cb.type='checkbox';toggle.append(cb,document.createTextNode('Commission specially coloured metal (major premium)'));box.appendChild(toggle);const colourHost=document.createElement('div');box.appendChild(colourHost);cb.onchange=()=>{c.unlocked=cb.checked;colourHost.innerHTML='';if(cb.checked){c.hue=210;c.saturation=55;c.value=68;colourHost.appendChild(window.buildPreciseColorPicker({key:`sf-metal-${id}`,label:'Metal colour',hue:c.hue,saturation:c.saturation,value:c.value,compact:true,onChange:next=>{Object.assign(c,next);refresh();}}));}else{c.hue=210;c.saturation=8;}refresh();};
          }else box.appendChild(window.buildPreciseColorPicker({key:`sf-armour-${id}-${part}`,label:'Colour',hue:c.hue,saturation:c.saturation,value:c.value,compact:true,onChange:next=>{Object.assign(c,next);c.unlocked=true;refresh();}}));controls.appendChild(box);}
      }
      refresh();
    };
    const refresh=()=>{const id=sel.value,price=commissionPrice(kind,id,appearance),lead=commissionLead(kind,id);summary.textContent=`${price} gold · ready in about ${hourText(lead)}`;note.textContent=kind==='garment'?'Bespoke colour and transparency are included in the tailoring price.':'Leather and cloth colours are included. Deliberately coloured metal is specialist work and adds several hundred gold.';};
    sel.onchange=rebuild;order.onclick=()=>{const name=design.value.trim()||'Dev colour';if(free){const instance=grantStyledItem(sel.value,appearance,name,'dev-colour-editor');if(instance&&kind==='garment'){const p=primary(),slot=window.clothingSystem?.getItemSpec?.(sel.value)?.slot;if(p&&slot){p.equipped=p.equipped||{};p.equipped[slot]=sel.value;p.equippedInstances=p.equippedInstances||{};p.equippedInstances[slot]=instance;window.physicalEquipment?.reconcile?.(p);}}window.syncPlayerEntity?.();window.renderEntities?.();closeModal('silverhart-fashion-modal');window.showMessage?.(`Added and equipped ${window.items[sel.value]?.name||sel.value} — ${name}.`);}else placeCommission(kind,sel.value,appearance,name);};rebuild();
  }
  function commissions(kind){return(state()?.commissions||[]).filter(c=>c.kind===kind&&!c.collected);}
  function collectCommission(id){const s=state(),c=s?.commissions?.find(x=>x.id===id&&!x.collected);if(!c)return;if((Number(window.worldSeconds)||0)<c.readyAt){window.showMessage?.(`Not ready yet — about ${hourText(c.readyAt-(Number(window.worldSeconds)||0))} remaining.`);return;}grantStyledItem(c.itemId,c.appearance,c.designName,`silverhart-bespoke-${c.kind}`);c.collected=true;window.showMessage?.(`Collected ${window.items[c.itemId]?.name||c.itemId} — ${c.designName}.`);openCommissions(c.kind);}
  function openCommissions(kind){closeModal('silverhart-fashion-modal');const p=modal(kind==='garment'?'Tailoring commissions':'Armour commissions'),list=commissions(kind),now=Number(window.worldSeconds)||0;if(!list.length){const x=document.createElement('p');x.textContent='No outstanding commissions.';p.appendChild(x);return;}for(const c of list){const row=document.createElement('div');row.className='sf-row';const info=document.createElement('div'),n=document.createElement('div');n.className='sf-name';n.textContent=`${window.items[c.itemId]?.name||c.itemId} — ${c.designName}`;const sub=document.createElement('div');sub.className='sf-sub';sub.textContent=now>=c.readyAt?'Ready for collection':`Ready in about ${hourText(c.readyAt-now)}`;info.append(n,sub,swatches(c));const b=document.createElement('button');b.className='sf-buy';b.textContent=now>=c.readyAt?'Collect':'Not ready';b.disabled=now<c.readyAt;b.onclick=()=>collectCommission(c.id);row.append(info,b);p.appendChild(row);}}
  function checkReady(){const s=state();if(!s)return;const now=Number(window.worldSeconds)||0;for(const c of s.commissions){if(c.collected||c.notified||now<c.readyAt)continue;c.notified=true;window.showMessage?.(`Silverhart message: your custom ${window.items?.[c.itemId]?.name||'order'} is ready for collection.`);}}

  function shopClosed(name){return window.isShopOpen&&!window.isShopOpen(name);}
  function commerceBlocked(npc){if(window.isShunnedByHumanCommerce?.()){window.showDialogue(npc,'Not to you.',[{label:'...',action:()=>{}}]);return true;}return false;}
  function dialogueStock(npc,vendor,kind,scheduleName){if(commerceBlocked(npc))return;if(shopClosed(scheduleName)){window.showDialogue(npc,'The shutters are down for the night. Come back after sunrise.',[{label:'I will.',action:()=>{}}]);return;}window.showDialogue(npc,kind==='garment'?'Silverhart wears every colour eventually. The ordinary bolts sell first; the strange shades are here if you catch them.':'Off the rack, fitted and finished here in the capital. Coloured metal is another matter entirely.',[{label:'Show me today\'s stock.',action:()=>openStock(vendor,kind)},{label:'Maybe later.',action:()=>{}}]);}
  function dialogueMaker(npc,kind,scheduleName){if(commerceBlocked(npc))return;if(shopClosed(scheduleName)){window.showDialogue(npc,'Workshop is closed. Come back after sunrise.',[{label:'Understood.',action:()=>{}}]);return;}const ready=commissions(kind).filter(c=>(Number(window.worldSeconds)||0)>=c.readyAt).length,pending=commissions(kind).length;const opts=[{label:kind==='garment'?'Commission a garment.':'Commission armour.',action:()=>openDesigner(kind)}];if(pending)opts.push({label:`My commissions${ready?` (${ready} ready)`:''}.`,action:()=>openCommissions(kind)});opts.push({label:'Nothing today.',action:()=>{}});window.showDialogue(npc,kind==='garment'?'Choose the cut, the colours, even the transparency of the cloth. Bespoke work takes time.':'Cloth, leather and steel can all be finished to order. If you want steel itself coloured, expect the price to hurt.',opts);}

  function freeFloorNear(center){if(!center)return null;const offsets=[[1,0],[-1,0],[0,0],[1,-1],[-1,1],[2,0],[-2,1],[1,1],[-1,-1]];for(const[dq,dr]of offsets){const h={q:center.q+dq,r:center.r+dr},t=window.getTerrainAt?.(h.q,h.r),key=`${h.q},${h.r}`;if(t?.name!=='Wood Floor'||window.tileObjects?.[key])continue;const occupied=(window.entities||[]).some(e=>e.alive&&e.hex?.q===h.q&&e.hex?.r===h.r);if(!occupied)return h;}return null;}
  function ensureStaff(){if(window.currentCampaign!=='2'||!window.buildNPC||!window.entities)return;const cc=window.campaign2ClothierCounterHex?{q:window.campaign2ClothierCounterHex.q,r:window.campaign2ClothierCounterHex.r-1}:null,gc=window.campaign2SilverhartGeneralGoodsCenter||null;if(!cc||!gc)return;for(const s of STAFF){if(window.entities.some(e=>e.name===s.name))continue;const hex=freeFloorNear(s.near==='clothier'?cc:gc);if(!hex)continue;window.entities.push(window.buildNPC({name:s.name,title:s.title,race:'human',gender:s.gender,classLevels:[],skillPicks:[],equipment:[],side:'neutral',factionId:null,color:s.color,dialogueId:s.dialogueId,hex}));}}
  function installDialogue(){if(!window.npcDialogueTrees)return false;if(!window.npcDialogueTrees.__silverhartFashionPatched){window.npcDialogueTrees.__silverhartFashionPatched=true;window.npcDialogueTrees.silverhart_clothier=npc=>dialogueStock(npc,'mirelle','garment','Mirelle Sondhe');window.npcDialogueTrees.silverhart_fashion_stock=npc=>dialogueStock(npc,'sera','garment','Mirelle Sondhe');window.npcDialogueTrees.silverhart_tailor=npc=>dialogueMaker(npc,'garment','Mirelle Sondhe');window.npcDialogueTrees.silverhart_armour_stock=npc=>dialogueStock(npc,'maela','armor','Perrin Vance');window.npcDialogueTrees.silverhart_armourer=npc=>dialogueMaker(npc,'armor','Perrin Vance');}return true;}
  function install(){if(installed)return;if(!window.items||!window.clothingSystem||!window.equipmentAppearanceSystem)return;ensurePrices();installDialogue();installed=true;setInterval(()=>{ensurePrices();installDialogue();ensureStaff();checkReady();},1000);ensureStaff();}
  const timer=setInterval(()=>{install();if(installed)clearInterval(timer);},50);if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
  window.silverhartFashion={build:BUILD,openStock,openDesigner,openCommissions,ensureStock,checkReady,garmentIds,armourIds};
})();
