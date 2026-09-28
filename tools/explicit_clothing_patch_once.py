from pathlib import Path

def replace(path, old, new, count=1):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'Expected block not found in {path}: {old[:120]!r}')
    p.write_text(s.replace(old,new,count))

replace('humanoidRenderer.js', """    function ensureAppearance(entity) {
        if (entity.shirtHue === undefined) entity.shirtHue = window.pickClothingHue?.(`${entity.name || 'x'}_shirt`) ?? 30;
        if (entity.pantsHue === undefined) entity.pantsHue = window.pickClothingHue?.(`${entity.name || 'x'}_pants`) ?? 220;
        if (entity.clothingSatMult === undefined) entity.clothingSatMult = .85;
""", """    function ensureAppearance(entity) {
""")
replace('humanoidRenderer.js', """    function resolvedBodyImage(entity, source) {
        ensureAppearance(entity);
        const clothesId = entity.equipped?.clothes;
        const clothesPreset = clothesId && window.CLOTHING_PRESETS?.[clothesId];
        const showClothes = !!clothesPreset && (window.clothingDisplayMode === 'clothes' || !entity.equipped?.armor);
        const shirtHue = showClothes ? clothesPreset.shirtHue : entity.shirtHue;
        const pantsHue = showClothes ? clothesPreset.pantsHue : entity.pantsHue;
        const satMult = showClothes ? (clothesPreset.satMult ?? 1) : (entity.clothingSatMult || 1);
        const skinned = window.getRecoloredSkinSprite
            ? window.getRecoloredSkinSprite(source, {hue:entity.skinHue,saturation:entity.skinSaturation,lightness:entity.skinLightness})
            : source;
        return window.getRecoloredSprite ? window.getRecoloredSprite(skinned, {shirtHue,pantsHue,satMult}) : skinned;
    }
""", """    function resolvedBodyImage(entity, source) {
        ensureAppearance(entity);
        return window.getRecoloredSkinSprite
            ? window.getRecoloredSkinSprite(source, {hue:entity.skinHue,saturation:entity.skinSaturation,lightness:entity.skinLightness})
            : source;
    }
""")
replace('humanoidRenderer.js', """        const hasHelmet = !!entity.equipped?.helmet;
        const showClothes = !!entity.equipped?.clothes
            && (window.clothingDisplayMode === 'clothes' || !entity.equipped?.armor);
        const mirror = facing === 'left';
""", """        const hasHelmet = !!entity.equipped?.helmet;
        window.clothingSystem?.migrateLegacyEquipment?.(entity);
        const mirror = facing === 'left';
""")
replace('humanoidRenderer.js', """            if (bodyDrawn) layerOrder.push('body');
            if (!hasHelmet && imageReady(hairImage)) {
                if (drawCropped(ctx, hairImage, layout.hairCrop, layout.hairDest, bounds)) layerOrder.push('hair');
            } else if (hasHelmet && drawHelmet(ctx, entity, view, bounds)) {
                layerOrder.push('helmet');
            }
            if (entity.equipped?.armor && !showClothes && drawArmour(ctx, entity, view, bounds)) {
                layerOrder.push('armour');
            }

            if (view !== 'back') drawHeldLayers();
""", """            if (bodyDrawn) layerOrder.push('body');
            for (const slot of ['underwear','bra','pants','shirt']) {
                if (window.clothingSystem?.drawSlot?.(ctx, entity, slot, view, bounds)) layerOrder.push(slot);
            }
            if (entity.equipped?.armor && drawArmour(ctx, entity, view, bounds)) layerOrder.push('armour');
            if (typeof window.drawFacialHairLayer === 'function' && window.drawFacialHairLayer(ctx,entity,view,bounds)) layerOrder.push('facialHair');
            if (!hasHelmet && imageReady(hairImage)) {
                if (drawCropped(ctx, hairImage, layout.hairCrop, layout.hairDest, bounds)) layerOrder.push('hair');
            } else if (hasHelmet && drawHelmet(ctx, entity, view, bounds)) layerOrder.push('helmet');

            if (view !== 'back') drawHeldLayers();
""")
replace('humanoidRenderer.js', """                hairHue:Number(document.getElementById('hair-hue-slider')?.value || 25),
                shirtHue:Number(document.getElementById('shirt-hue-slider')?.value || 30),
                pantsHue:Number(document.getElementById('pants-hue-slider')?.value || 220),
""", """                hairHue:Number(document.getElementById('hair-hue-slider')?.value || 25),
""")

replace('characterCreation.js', """    // Baked-in/base clothing colours remain distinct from the colours of a
    // separately equipped clothing sprite. Male base art uses one colour;
    // the UI mirrors shirtHue to pantsHue for that body. Female art exposes
    // upper and lower base colours independently.
    shirtHue: 30,
    pantsHue: gender === 'male' ? 30 : 220,
    clothingPrimaryHue: 28,
    clothingSecondaryHue: 215,
    equipped: {
        weapon: null,
        offhand: null,
        armor: null,
        helmet: null,
        clothes: null
    }
""", """    clothingColors: {},
    equipped: {
        weapon: null,
        offhand: null,
        armor: null,
        helmet: null,
        shirt: null,
        pants: null,
        bra: null,
        underwear: null
    }
""")
replace('characterCreation.js','clothingSystem.js?build=20260928-clothing-v1','clothingSystem.js?build=20260928-clothing-v3')

replace('index.html', """                        <label for="shirt-hue-slider" style="font-weight: normal; font-size: 0.85em;">Shirt Color</label>
                        <input type="range" id="shirt-hue-slider" min="0" max="359" value="30"
                               oninput="if(window.updateAppearancePreview) window.updateAppearancePreview(); if(window.syncCharacterToServer) window.syncCharacterToServer()">
                        <label for="pants-hue-slider" style="font-weight: normal; font-size: 0.85em;">Pants Color</label>
                        <input type="range" id="pants-hue-slider" min="0" max="359" value="220"
                               oninput="if(window.updateAppearancePreview) window.updateAppearancePreview(); if(window.syncCharacterToServer) window.syncCharacterToServer()">
""",'')

replace('ui.js', """    const slots = [{ label: 'Weapon', key: 'weapon' }, { label: 'Off-hand', key: 'offhand' }, { label: 'Armor/Barding', key: 'armor' }, { label: 'Helmet', key: 'helmet' }, { label: 'Accessory', key: 'accessory' }, { label: 'Clothes', key: 'clothes' }];
""", """    window.clothingSystem?.migrateLegacyEquipment?.(player);
    const slots = [{ label: 'Weapon', key: 'weapon' }, { label: 'Off-hand', key: 'offhand' }, { label: 'Armor/Barding', key: 'armor' }, { label: 'Helmet', key: 'helmet' }, { label: 'Accessory', key: 'accessory' }, { label: 'Shirt / Dress', key: 'shirt' }, { label: 'Pants', key: 'pants' }, { label: 'Bra', key: 'bra' }, { label: 'Underwear', key: 'underwear' }];
""")
replace('ui.js', """    // Only matters when both an armor and a clothes item are equipped at
    // once — otherwise whichever's actually equipped just shows (see
    // showClothes in drawPlayerCharacter, gameEngine.js).
    const mode = window.clothingDisplayMode === 'clothes' ? 'clothes' : 'armor';
    html += `<div style="margin-bottom: 10px;"><strong>Always show:</strong>
        <button onclick="window.setClothingDisplayMode('armor')" style="${mode === 'armor' ? 'font-weight:bold;text-decoration:underline;' : ''}">Armor</button>
        <button onclick="window.setClothingDisplayMode('clothes')" style="margin-left:5px;${mode === 'clothes' ? 'font-weight:bold;text-decoration:underline;' : ''}">Clothes</button>
    </div>`;
""",'')
replace('ui.js',"            if (player.equipped.clothes === itemId) equipCount++;\n","""            if (player.equipped.shirt === itemId) equipCount++;
            if (player.equipped.pants === itemId) equipCount++;
            if (player.equipped.bra === itemId) equipCount++;
            if (player.equipped.underwear === itemId) equipCount++;
""")
replace('ui.js', """    if (slot === 'clothes') {
        player.equipped.clothes = null;
        syncPlayerEntity();
        showInventoryScreen();
        showCharacter();
        window.renderEntities();
        return;
    }
""", """    if (['shirt','pants','bra','underwear'].includes(slot)) {
        player.equipped[slot] = null;
        syncPlayerEntity();
        showInventoryScreen();
        showCharacter();
        window.renderEntities();
        return;
    }
""")
replace('ui.js', """    if (item.type === 'clothes') {
        player.equipped.clothes = itemId;
        syncPlayerEntity();
        showInventoryScreen();
        showCharacter();
        window.renderEntities();
        return;
    }
""", """    if (item.type === 'clothes') {
        window.clothingSystem?.migrateLegacyEquipment?.(player);
        const slot = window.clothingSystem?.getItemSpec?.(itemId)?.slot || item.clothingSlot || 'shirt';
        player.equipped[slot] = itemId;
        syncPlayerEntity();
        showInventoryScreen();
        showCharacter();
        window.renderEntities();
        return;
    }
""")

Path('.github/workflows/explicit-clothing-integration-once.yml').unlink(missing_ok=True)
Path('tools/explicit_clothing_patch_once.py').unlink(missing_ok=True)
