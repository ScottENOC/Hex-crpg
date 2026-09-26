// directionalWeaponTuning.js
// Source-asset anchor metadata for rigid weapons.
//
// A body hand anchor and an image edge are NOT interchangeable. Each weapon
// defines the point inside its own artwork that represents the centre of the
// grip. characterRig aligns that source grip point to the body's semantic
// mainHand/offHand attachment point.

(() => {
    'use strict';

    // Normalised to each weapon's square source/destination artwork. These are
    // SOURCE anchors: do not move the body hand anchors to compensate for them.
    // The existing renderer consumes ITEM_GRIPS, so gripPrimary is projected
    // into that compatibility table after the source rigs are registered.
    const ITEM_SOURCE_RIGS = {
        sword:  { gripPrimary:{ x:0.56, y:0.79 }, source:'authored-grip-centre' },
        axe:    { gripPrimary:{ x:0.56, y:0.69 }, source:'authored-grip-centre' },
        spear:  { gripPrimary:{ x:0.56, y:0.75 }, source:'authored-grip-centre' },
        club:   { gripPrimary:{ x:0.56, y:0.71 }, source:'authored-grip-centre' },
        bow:    { gripPrimary:{ x:0.56, y:0.37 }, source:'authored-grip-centre' },
    };

    function copyPoint(p) {
        return p ? { x:Number(p.x), y:Number(p.y) } : null;
    }

    function getItemSourceAnchor(kind, name = 'gripPrimary') {
        return copyPoint(window.ITEM_SOURCE_RIGS?.[kind]?.[name]);
    }

    function apply() {
        const grips = window.ITEM_GRIPS;
        const bodyRigs = window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        if (!grips || !bodyRigs) return false;

        // Register source-side metadata and keep ITEM_GRIPS as a compatibility
        // projection for characterRig's current placement path.
        window.ITEM_SOURCE_RIGS = ITEM_SOURCE_RIGS;
        for (const [kind, rig] of Object.entries(ITEM_SOURCE_RIGS)) {
            if (!grips[kind]) continue;
            Object.assign(grips[kind], rig.gripPrimary);
        }

        // Deliberately DO NOT tune bodyRigs.front/back mainHand/offHand here.
        // Those are target anatomy landmarks and are owned by the canonical
        // character rig. Moving them to compensate for a weapon image is the
        // category error this module is designed to prevent.
        window.getItemSourceAnchor = getItemSourceAnchor;
        window.__directionalWeaponTuningApplied = true;
        return true;
    }

    if (apply()) return;
    const timer = setInterval(() => {
        if (apply()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 10000);
})();
