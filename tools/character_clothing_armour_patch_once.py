from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"Expected block not found in {path}: {old[:160]!r}")
    p.write_text(s.replace(old, new, count))

# --- Armour body-shape profiles: preserve existing placement/height and only
# deform horizontal width gradually through shoulder/waist/hip bands.
replace('humanoidRenderer.js', """    const ARMOUR_TARGETS = {
        front:{x:.03,y:.225,w:.94,h:.770},
        side: {x:.18,y:.225,w:.64,h:.770},
        // Rear-specific art should occupy the same visible envelope as front art.
        back: {x:.03,y:.225,w:.94,h:.770},
    };
""", """    const ARMOUR_TARGETS = {
        front:{x:.03,y:.225,w:.94,h:.770},
        side: {x:.18,y:.225,w:.64,h:.770},
        // Rear-specific art should occupy the same visible envelope as front art.
        back: {x:.03,y:.225,w:.94,h:.770},
    };

    // Optional local width shaping. Values are multipliers relative to the
    // existing rigid armour fit; vertical placement, anchors and total height
    // remain unchanged. Side view stays rigid to avoid inventing depth.
    const ARMOUR_BODY_SHAPE_PROFILES = {
        human_female:{average:{shoulders:1.00,waist:1.02,hips:1.10},broad:{shoulders:1.04,waist:1.06,hips:1.14}},
        elf_female:  {average:{shoulders:.98,waist:1.00,hips:1.05}},
        human_male:  {average:{shoulders:1.08,waist:1.00,hips:.98},broad:{shoulders:1.12,waist:1.05,hips:1.00}},
    };
    window.ARMOUR_BODY_SHAPE_PROFILES = ARMOUR_BODY_SHAPE_PROFILES;
""")

replace('humanoidRenderer.js', """    function drawArmour(ctx, entity, view, bounds) {
        const image = armourImage(entity, view);
        if (!imageReady(image)) return false;
        const baseTarget = ARMOUR_TARGETS[view] || ARMOUR_TARGETS.front;
        const armourY = usesApprovedHumanEquipmentBaseline(entity)
            ? (HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.armourY || 0)
            : 0;
        const target = armourY ? {...baseTarget,y:baseTarget.y+armourY} : baseTarget;
        const placement = drawVisibleFit(ctx, image, bounds, target);
        if (placement) {
            window.__humanoidRendererLastArmour = {
                entity, view, ...placement,
                compositionSource:'direct-axis-aligned-scale-translate',
                rotation:0, shear:false,
            };
        }
        return !!placement;
    }
""", """    function armourWidthAt(profile, t) {
        const shoulderY=.18, waistY=.53, hipY=.84;
        const lerp=(a,b,u)=>a+(b-a)*Math.max(0,Math.min(1,u));
        if(t<=waistY) return lerp(profile.shoulders,profile.waist,(t-shoulderY)/(waistY-shoulderY));
        return lerp(profile.waist,profile.hips,(t-waistY)/(hipY-waistY));
    }

    function armourShapeProfile(entity, view) {
        if(view==='side') return null;
        const byBody=ARMOUR_BODY_SHAPE_PROFILES[keyFor(entity)];
        if(!byBody) return null;
        return entity.armourBodyShape || byBody[entity.bodyType || 'average'] || byBody.average || null;
    }

    function drawShapedArmourFit(ctx, image, bounds, target, profile) {
        if(!profile) return drawVisibleFit(ctx,image,bounds,target);
        const trim=alphaTrim(image);
        if(!trim?.trimWidth || !trim?.trimHeight) return false;
        const iw=image.naturalWidth||image.width, ih=image.naturalHeight||image.height;
        const targetLeft=bounds.left+target.x*bounds.width;
        const targetTop=bounds.top+target.y*bounds.height;
        const targetWidth=target.w*bounds.width;
        const targetHeight=target.h*bounds.height;
        const scaleX=targetWidth/trim.trimWidth, scaleY=targetHeight/trim.trimHeight;
        const outerW=iw*scaleX, outerH=ih*scaleY;
        const dx=targetLeft-trim.trimLeft*scaleX, dy=targetTop-trim.trimTop*scaleY;
        const cx=dx+outerW/2;
        const strips=32;
        for(let i=0;i<strips;i++){
            const sy=Math.floor(i*ih/strips), sy2=Math.ceil((i+1)*ih/strips), sh=Math.max(1,sy2-sy);
            const sourceMid=sy+sh/2;
            const t=Math.max(0,Math.min(1,(sourceMid-trim.trimTop)/trim.trimHeight));
            const widthScale=armourWidthAt(profile,t);
            const dw=outerW*widthScale;
            const destY=dy+(sy/ih)*outerH;
            const destH=(sh/ih)*outerH+.35;
            ctx.drawImage(image,0,sy,iw,sh,cx-dw/2,destY,dw,destH);
        }
        return {dx,dy,width:outerW,height:outerH,target:{left:targetLeft,top:targetTop,width:targetWidth,height:targetHeight},shapeProfile:{...profile}};
    }

    function drawArmour(ctx, entity, view, bounds) {
        const image = armourImage(entity, view);
        if (!imageReady(image)) return false;
        const baseTarget = ARMOUR_TARGETS[view] || ARMOUR_TARGETS.front;
        const armourY = usesApprovedHumanEquipmentBaseline(entity)
            ? (HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.armourY || 0)
            : 0;
        const target = armourY ? {...baseTarget,y:baseTarget.y+armourY} : baseTarget;
        const profile=armourShapeProfile(entity,view);
        const placement = drawShapedArmourFit(ctx, image, bounds, target, profile);
        if (placement) {
            window.__humanoidRendererLastArmour = {
                entity, view, ...placement,
                compositionSource:profile?'direct-horizontal-strip-width-profile':'direct-axis-aligned-scale-translate',
                rotation:0, shear:false,
            };
        }
        return !!placement;
    }
""")

# Default wardrobe and outer-clothes-first readiness gate. The compositor owns
# the frame while clothes load, preventing a transient naked/body-only flash.
replace('humanoidRenderer.js', """        const bodyType = entity.bodyType || 'average';
        const sourceBody = (set?.body?.[bodyType] || set?.body?.average)?.[view];
        if (!imageReady(sourceBody)) return true; // own the frame; never flash legacy art while loading
""", """        const bodyType = entity.bodyType || 'average';
        window.clothingSystem?.ensureDefaultOutfit?.(entity,{player:entity.side==='player'});
        window.clothingSystem?.preloadOutfit?.(entity,view);
        if (entity.displayClothes !== false && window.clothingSystem?.visibleSlotsReady && !window.clothingSystem.visibleSlotsReady(entity,view)) return true;
        const sourceBody = (set?.body?.[bodyType] || set?.body?.average)?.[view];
        if (!imageReady(sourceBody)) return true; // own the frame; never flash legacy art while loading
""")

replace('humanoidRenderer.js', """            if (entity.equipped?.armor && drawArmour(ctx, entity, view, bounds)) layerOrder.push('armour');
""", """            if (entity.displayArmour !== false && entity.equipped?.armor && drawArmour(ctx, entity, view, bounds)) layerOrder.push('armour');
""")

replace('humanoidRenderer.js', """            const skin = window.getPlayerSkinToneFromControls?.();
            if (skin) Object.assign(preview, {skinHue:skin.hue,skinSaturation:skin.saturation,skinLightness:skin.lightness});
            if (!canDirectRender(preview)) return creatorLegacy.apply(this, arguments);
""", """            const skin = window.getPlayerSkinToneFromControls?.();
            if (skin) Object.assign(preview, {skinHue:skin.hue,skinSaturation:skin.saturation,skinLightness:skin.lightness});
            preview.side='player';
            preview.displayArmour=true;
            preview.displayClothes=true;
            window.clothingSystem?.ensureDefaultOutfit?.(preview,{player:true});
            window.clothingSystem?.preloadOutfit?.(preview,'front');
            if (!canDirectRender(preview)) return creatorLegacy.apply(this, arguments);
""")

# Replace the old single-choice appearance concept with independent per-character
# checkboxes on the character screen.
replace('ui.js', """function showCharacterScreen() {
    if (!window.player) return;

    const char = window.player;
    const contentDiv = document.getElementById(\"character-screen-content\");
    if (!contentDiv) return;
    contentDiv.innerHTML = ''; 

    // SHOW ALL SKILLS TOGGLE
""", """function setAppearanceLayerVisibility(layer, checked) {
    const char=window.player;
    if(!char) return;
    const key=layer==='armour'?'displayArmour':'displayClothes';
    char[key]=!!checked;
    const partyChar=(window.party||[]).find(p=>p.name===char.name);
    if(partyChar) partyChar[key]=!!checked;
    const ent=(window.entities||[]).find(e=>e.name===char.name&&e.alive);
    if(ent) ent[key]=!!checked;
    window.renderEntities?.();
    window.refreshDirectionalTurnPortraits?.();
}
window.setAppearanceLayerVisibility=setAppearanceLayerVisibility;

function showCharacterScreen() {
    if (!window.player) return;

    const char = window.player;
    window.clothingSystem?.migrateLegacyEquipment?.(char);
    window.clothingSystem?.ensureDefaultOutfit?.(char,{player:true});
    const contentDiv = document.getElementById(\"character-screen-content\");
    if (!contentDiv) return;
    contentDiv.innerHTML = '';

    const appearanceDiv=document.createElement('div');
    appearanceDiv.style.cssText='display:flex;gap:18px;align-items:center;padding:8px 10px;margin-bottom:12px;border:1px solid #555;border-radius:5px;';
    appearanceDiv.innerHTML=`<strong>Display:</strong>
      <label style=\"font-weight:normal;\"><input type=\"checkbox\" ${char.displayArmour===false?'':'checked'} onchange=\"window.setAppearanceLayerVisibility('armour',this.checked)\"> Armour</label>
      <label style=\"font-weight:normal;\"><input type=\"checkbox\" ${char.displayClothes===false?'':'checked'} onchange=\"window.setAppearanceLayerVisibility('clothes',this.checked)\"> Clothes</label>`;
    contentDiv.appendChild(appearanceDiv);

    // SHOW ALL SKILLS TOGGLE
""")

print('character clothing/armour patch applied')
