// humanFemaleMapPolish.js
// Keeps the first directional human-female sprite at the same natural
// proportions on the tactical map as in the character/initiative previews.
//
// The legacy human-female render box is 1.60 / 1.92 = 0.833x as wide as it is
// tall. The new artwork looks right at 0.48x width:height (the proportion used
// by directionalCharacterUI.js), so scale every directional destination rect
// horizontally around its centre by 0.48 / 0.833 = 0.576.
(() => {
    'use strict';

    const LEGACY_BODY_ASPECT = 1.60 / 1.92;
    const DIRECTIONAL_BODY_ASPECT = 0.48;
    const X_SCALE = DIRECTIONAL_BODY_ASPECT / LEGACY_BODY_ASPECT;

    function scaleDestAroundCentre(dest) {
        if (!dest || dest.__humanFemaleMapPolished) return;
        const centre = dest.x + dest.w / 2;
        dest.w *= X_SCALE;
        dest.x = centre - dest.w / 2;
        Object.defineProperty(dest, '__humanFemaleMapPolished', {
            value: true,
            enumerable: false,
            configurable: false,
        });
    }

    function install() {
        const layout = window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT;
        if (!layout) return false;
        if (layout.__mapWidthPolished) return true;

        for (const view of ['front', 'side', 'back']) {
            scaleDestAroundCentre(layout[view]?.bodyDest);
            scaleDestAroundCentre(layout[view]?.hairDest);
        }

        Object.defineProperty(layout, '__mapWidthPolished', {
            value: true,
            enumerable: false,
            configurable: false,
        });
        window.HUMAN_FEMALE_MAP_X_SCALE = X_SCALE;
        return true;
    }

    if (!install()) {
        const timer = setInterval(() => {
            if (install()) clearInterval(timer);
        }, 50);
    }
})();
