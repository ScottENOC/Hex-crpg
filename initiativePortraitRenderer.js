// initiativePortraitRenderer.js
// Keeps initiative portraits visually consistent with the map/dialogue renderer.
(() => {
    'use strict';

    let installed = false;
    let observer = null;
    let renderPasses = 0;
    let portraitsRendered = 0;

    function trackedEntities() {
        const list = [...(window.entities || [])]
            .filter(e => e?.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
        if (window.isInCombat) list.sort((a, b) => (b.timePoints || 0) - (a.timePoints || 0));
        return list;
    }

    function canUseSharedRenderer(entity) {
        if (!entity || entity.customImage || entity.name === 'Wolf' || entity.name === 'Horse') return false;
        if (typeof window.drawPlayerCharacter !== 'function') return false;
        return !!window.CHAR_CONFIG?.[`${entity.race}_${entity.gender}`];
    }

    function gearSignature(entity) {
        const eq = entity?.equipped || {};
        return [
            entity?.race || '', entity?.gender || '', entity?.bodyType || 'average', entity?.hairStyle || '',
            entity?.facing || 'down', eq.weapon || '', eq.offhand || '', eq.armor || '', eq.helmet || '', eq.clothes || '',
            Math.round(entity?.skinHue || 0), Math.round(entity?.hairHue || 0), Math.round(entity?.shirtHue || 0), Math.round(entity?.pantsHue || 0)
        ].join('|');
    }

    function drawSharedPortrait(portraitDiv, entity) {
        if (!portraitDiv || !canUseSharedRenderer(entity)) return false;

        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.classList.add('portrait-layer', 'initiative-shared-character-portrait');
        canvas.dataset.sharedCharacterPortrait = 'true';
        canvas.dataset.gearSignature = gearSignature(entity);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.left = '0';
        canvas.style.top = '0';

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const cfg = window.CHAR_CONFIG[`${entity.race}_${entity.gender}`];
        const hs = window.hexSize || 40;
        const z = (100 * 0.65) / (cfg.bodyH * hs);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        window.drawPlayerCharacter(ctx, entity, 50, 65, z, 0);

        portraitDiv.replaceChildren(canvas);
        portraitsRendered++;
        return true;
    }

    function renderAll() {
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar) return { scanned: 0, rendered: 0 };
        renderPasses++;
        const entities = trackedEntities();
        const items = [...bar.querySelectorAll(':scope > .turn-indicator-item')];
        let rendered = 0;
        for (let i = 0; i < Math.min(items.length, entities.length); i++) {
            const portrait = items[i].querySelector('.turn-indicator-portrait');
            if (!portrait || !canUseSharedRenderer(entities[i])) continue;
            if (drawSharedPortrait(portrait, entities[i])) rendered++;
        }
        return { scanned: Math.min(items.length, entities.length), rendered };
    }

    function scheduleRender() {
        if (scheduleRender.pending) return;
        scheduleRender.pending = true;
        requestAnimationFrame(() => {
            scheduleRender.pending = false;
            renderAll();
        });
    }

    function install() {
        if (installed) return true;
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar) return false;
        observer = new MutationObserver(scheduleRender);
        observer.observe(bar, { childList: true });

        const previousRefresh = window.refreshDirectionalTurnPortraits;
        window.refreshDirectionalTurnPortraits = function() {
            if (typeof previousRefresh === 'function') previousRefresh();
            scheduleRender();
        };

        installed = true;
        scheduleRender();
        return true;
    }

    window.InitiativePortraitRenderer = {
        install, renderAll, trackedEntities, gearSignature,
        get stats() { return { installed, renderPasses, portraitsRendered }; }
    };

    if (!install()) {
        const timer = setInterval(() => {
            if (install()) clearInterval(timer);
        }, 50);
        setTimeout(() => clearInterval(timer), 10000);
    }
})();
