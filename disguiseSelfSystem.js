// disguiseSelfSystem.js
// Appearance-only Disguise Self state. Equipment is handled as a separate
// visual overlay when the character has the Disguised Equipment skill.
(() => {
    'use strict';
    const BUILD = '20261008-disguise-self-v1';

    function hasSkill(entity) {
        return !!(entity?.skills?.disguise_equipment);
    }

    function cloneProfile(p) {
        return {
            gender: p?.gender || 'female',
            bodyType: p?.bodyType || 'average',
            hairStyle: p?.hairStyle || 'brown_1',
            hairHue: Number(p?.hairHue ?? 25),
            hairSaturation: Number(p?.hairSaturation ?? 70),
            hairValue: Number(p?.hairValue ?? 55),
            skinToneSlider: Number(p?.skinToneSlider ?? 45)
        };
    }

    function apply(entity, profile) {
        if (!entity) return false;
        const appearance = cloneProfile(profile?.appearance || profile);
        entity.disguiseSelf = {
            spell: 'disguise_self',
            appearance,
            visualEquipment: profile?.visualEquipment ? {...profile.visualEquipment} : null,
            clothingColours: profile?.clothingColours ? {...profile.clothingColours} : null,
            equipmentSkill: hasSkill(entity)
        };
        window.drawMap?.();
        window.renderEntities?.();
        return true;
    }

    function clear(entity) {
        if (!entity?.disguiseSelf) return false;
        delete entity.disguiseSelf;
        window.drawMap?.();
        window.renderEntities?.();
        return true;
    }

    function getVisualAppearance(entity) {
        return entity?.disguiseSelf?.appearance || null;
    }

    function getVisualEquipment(entity, slot) {
        const d = entity?.disguiseSelf;
        if (!d || !d.equipmentSkill || !d.visualEquipment) return entity?.equipped?.[slot];
        return d.visualEquipment[slot] || entity?.equipped?.[slot];
    }

    function getClothingColour(entity, layerId, fallback) {
        const d = entity?.disguiseSelf;
        if (!d?.equipmentSkill || !d.clothingColours) return fallback;
        return d.clothingColours[layerId] || d.clothingColours.base || fallback;
    }

    window.disguiseSelfSystem = { BUILD, apply, clear, getVisualAppearance, getVisualEquipment, getClothingColour };
    window.getDisguiseVisualEquipment = getVisualEquipment;
    window.getDisguiseVisualAppearance = getVisualAppearance;
    window.getDisguiseVisualClothingColour = getClothingColour;
})();
