// civilianVisualDiversity.js
// Applies stable visual identity to the cheap generated civilian records.
// Only materialised civilians are touched, so off-screen population scale stays
// governed by generatedCivilianPopulation.js rather than render-time work.
(() => {
    'use strict';

    const STYLE_INTERVAL_MS = 1200;
    const HAIR_STYLE_MAP = {
        short: 'brown_1',
        cropped: 'brown_1',
        braided: 'braid',
        tied_back: 'braid',
        long: 'curly',
        wavy: 'curly',
        // No detachable bald head art exists yet. Keep the most restrained
        // authored style rather than suppressing the whole hair/body layer.
        bald: 'brown_1',
    };
    const OCCUPATION_CLOTHES = {
        farmer: 'traveler_garb',
        labourer: 'traveler_garb',
        merchant: 'fine_tunic',
        smith: 'traveler_garb',
        fisher: 'traveler_garb',
        hunter: 'traveler_garb',
        clerk: 'scholars_robe',
        tavern_worker: 'traveler_garb',
        craftsperson: 'traveler_garb',
        unemployed: null,
    };
    const OCCUPATION_HUES = {
        farmer: [88, 34],
        labourer: [28, 22],
        merchant: [222, 32],
        smith: [205, 20],
        fisher: [196, 215],
        hunter: [108, 46],
        clerk: [266, 32],
        tavern_worker: [18, 36],
        craftsperson: [72, 28],
        unemployed: [28, 18],
    };
    const CLOTHING_VARIANTS = {
        plain:    { hueOffset: 0,   sat: 0.72 },
        earth:    { hueOffset: -10, sat: 0.62 },
        patched:  { hueOffset: 12,  sat: 0.52 },
        dyed:     { hueOffset: 38,  sat: 0.95 },
        workwear: { hueOffset: -18, sat: 0.58 },
        clean:    { hueOffset: 18,  sat: 0.82 },
    };

    let stylePasses = 0;
    let entitiesStyled = 0;
    let propDrawPasses = 0;
    let propDraws = 0;

    function unit(seed, channel) {
        const scheduler = window.NPCRoutineScheduler;
        if (scheduler?.deterministicUnit) return scheduler.deterministicUnit(seed, channel);
        const text = `${seed}|${channel}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    function paletteTone(record) {
        const palette = window.PLAYER_SKIN_PALETTES?.[record.race]
            || window.PLAYER_SKIN_PALETTES?.human;
        if (palette?.length) {
            const idx = Math.max(0, Math.min(palette.length - 1, Number(record.appearance?.skinVariant) || 0));
            return { ...palette[idx] };
        }
        return window.pickNaturalSkinTone
            ? window.pickNaturalSkinTone(`${record.seed}:skin`)
            : { hue: 24, saturation: 0.4, lightness: 0.58 };
    }

    function hairPreset(record) {
        if (window.pickHairPreset) return window.pickHairPreset(`${record.seed}:hair-colour`);
        const fallback = [
            { hue:25, lightMult:0.95, satMult:1 },
            { hue:45, lightMult:1.7, satMult:0.65 },
            { hue:30, lightMult:0.3, satMult:0.9 },
            { hue:12, lightMult:1.05, satMult:1.35 },
        ];
        return fallback[Math.floor(unit(record.seed, 'hair-colour') * fallback.length) % fallback.length];
    }

    function appearanceKey(entity) {
        return [
            entity.race, entity.gender, entity.bodyType, entity.hairStyle,
            Math.round(entity.shirtHue || 0), Math.round(entity.pantsHue || 0),
            Math.round(entity.hairHue || 0), Math.round(entity.skinHue || 0),
            entity.occupation, entity.ambientProp || 'none'
        ].join('|');
    }

    function styleEntity(entity, record) {
        if (!entity || !record || !entity.isGeneratedCivilian) return false;
        const variant = CLOTHING_VARIANTS[record.appearance?.clothing] || CLOTHING_VARIANTS.plain;
        const baseHues = OCCUPATION_HUES[record.occupation] || OCCUPATION_HUES.unemployed;
        const personalShift = Math.round((unit(record.seed, 'clothing-personal') - 0.5) * 20);

        entity.shirtHue = (baseHues[0] + variant.hueOffset + personalShift + 360) % 360;
        entity.pantsHue = (baseHues[1] + Math.round(variant.hueOffset * 0.45) - personalShift + 360) % 360;
        entity.clothingSatMult = variant.sat;

        const skin = paletteTone(record);
        entity.skinHue = skin.hue;
        entity.skinSaturation = skin.saturation;
        entity.skinLightness = skin.lightness;

        const hair = hairPreset(record);
        entity.hairStyle = HAIR_STYLE_MAP[record.appearance?.hair] || 'brown_1';
        entity.hairHue = hair.hue;
        entity.hairLightMult = hair.lightMult;
        entity.hairSatMult = hair.satMult;

        // Only human female currently has authored broad directional body art.
        // Other race/gender combinations still retain their height/build data for
        // future rigs without asking the renderer for an asset that does not exist.
        const broad = record.appearance?.build === 'broad' || record.appearance?.build === 'stocky';
        entity.bodyType = entity.race === 'human' && entity.gender === 'female' && broad ? 'broad' : 'average';
        entity.visualHeightScale = record.appearance?.heightScale || 1;
        entity.ageBand = record.appearance?.ageBand || 'adult';

        entity.equipped = entity.equipped || { weapon:null, offhand:null, armor:null, helmet:null };
        const clothes = OCCUPATION_CLOTHES[record.occupation];
        if (clothes && window.CLOTHING_PRESETS?.[clothes]) entity.equipped.clothes = clothes;
        else delete entity.equipped.clothes;

        // Props remain cosmetic. They are deliberately not put in equipped.weapon
        // or offhand because doing that would silently alter civilian combat stats.
        entity.ambientProp = record.prop || null;
        entity.civilianVisual = {
            clothing: record.appearance?.clothing || 'plain',
            prop: record.prop || null,
            heightScale: entity.visualHeightScale,
            ageBand: entity.ageBand,
        };
        entity.civilianAppearanceKey = appearanceKey(entity);
        if (!entity.__civilianVisualStyled) {
            entity.__civilianVisualStyled = true;
            entitiesStyled++;
        }
        return true;
    }

    function styleMaterialised() {
        const population = window.GeneratedCivilianPopulation;
        if (!population?.materialised || !population?.records) return { scanned: 0, styled: 0 };
        stylePasses++;
        let scanned = 0;
        let styled = 0;
        for (const [id, entity] of population.materialised) {
            scanned++;
            const record = population.records.get(id);
            if (styleEntity(entity, record)) styled++;
        }
        return { scanned, styled };
    }

    function drawPropShape(ctx, prop, x, y, size) {
        if (!ctx || !prop) return false;
        const s = Math.max(4, size);
        ctx.save();
        ctx.lineWidth = Math.max(1, s * 0.11);
        ctx.strokeStyle = '#2a2118';
        ctx.fillStyle = '#9b7448';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        try {
            if (prop === 'basket') {
                ctx.beginPath(); ctx.rect(x - s*0.35, y - s*0.12, s*0.7, s*0.42); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(x, y - s*0.10, s*0.32, Math.PI, 0); ctx.stroke();
            } else if (prop === 'sack' || prop === 'pouch') {
                ctx.beginPath(); ctx.ellipse(x, y + s*0.05, s*(prop === 'sack' ? 0.34 : 0.24), s*(prop === 'sack' ? 0.42 : 0.28), 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x-s*0.18,y-s*0.25); ctx.lineTo(x+s*0.18,y-s*0.25); ctx.stroke();
            } else if (prop === 'hammer' || prop === 'tool') {
                ctx.beginPath(); ctx.moveTo(x-s*0.25,y+s*0.35); ctx.lineTo(x+s*0.2,y-s*0.3); ctx.stroke();
                ctx.fillStyle = '#777'; ctx.fillRect(x+s*0.03,y-s*0.38,s*0.42,s*0.16); ctx.strokeRect(x+s*0.03,y-s*0.38,s*0.42,s*0.16);
            } else if (prop === 'net') {
                ctx.beginPath(); ctx.arc(x, y, s*0.34, 0, Math.PI*2); ctx.stroke();
                for (let i=-1;i<=1;i++) {
                    ctx.beginPath(); ctx.moveTo(x-s*0.28,y+i*s*0.16); ctx.lineTo(x+s*0.28,y+i*s*0.16); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(x+i*s*0.16,y-s*0.28); ctx.lineTo(x+i*s*0.16,y+s*0.28); ctx.stroke();
                }
            } else if (prop === 'bundle') {
                for (let i=-1;i<=1;i++) {
                    ctx.beginPath(); ctx.moveTo(x-s*0.3,y+s*(0.18+i*0.07)); ctx.lineTo(x+s*0.28,y-s*(0.18-i*0.06)); ctx.stroke();
                }
                ctx.beginPath(); ctx.moveTo(x-s*0.22,y); ctx.lineTo(x+s*0.2,y+s*0.08); ctx.stroke();
            } else if (prop === 'scroll') {
                ctx.fillStyle = '#d8c79d'; ctx.fillRect(x-s*0.28,y-s*0.32,s*0.56,s*0.64); ctx.strokeRect(x-s*0.28,y-s*0.32,s*0.56,s*0.64);
                ctx.beginPath(); ctx.moveTo(x-s*0.16,y-s*0.12); ctx.lineTo(x+s*0.15,y-s*0.12); ctx.moveTo(x-s*0.16,y+s*0.05); ctx.lineTo(x+s*0.12,y+s*0.05); ctx.stroke();
            } else if (prop === 'jug') {
                ctx.beginPath(); ctx.ellipse(x, y+s*0.05, s*0.27, s*0.34, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(x+s*0.28,y-s*0.02,s*0.18,-Math.PI/2,Math.PI/2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x-s*0.08,y-s*0.3); ctx.lineTo(x+s*0.08,y-s*0.3); ctx.stroke();
            } else {
                return false;
            }
            return true;
        } finally {
            ctx.restore();
        }
    }

    function drawOccupationProps() {
        const population = window.GeneratedCivilianPopulation;
        const ctx = window.mapCtx;
        if (!population?.materialised || !ctx || typeof window.hexToPixel !== 'function') return { scanned: 0, drawn: 0 };
        propDrawPasses++;
        let scanned = 0;
        let drawn = 0;
        const size = Math.max(5, (window.hexSize || 20) * (window.cameraZoom || 1) * 0.42);
        for (const entity of population.materialised.values()) {
            scanned++;
            if (!entity?.alive || !entity.ambientProp || !entity.hex) continue;
            if (window.isVisibleToPlayer && !window.isVisibleToPlayer(entity.hex)) continue;
            const q = Number.isFinite(entity.visualQ) ? entity.visualQ : entity.hex.q;
            const r = Number.isFinite(entity.visualR) ? entity.visualR : entity.hex.r;
            const p = window.hexToPixel(q, r);
            const facingLeft = entity.facing === 'left';
            const handX = p.x + (facingLeft ? -1 : 1) * size * 0.72;
            const handY = p.y + size * 0.18;
            if (drawPropShape(ctx, entity.ambientProp, handX, handY, size)) {
                drawn++;
                propDraws++;
            }
        }
        return { scanned, drawn };
    }

    function installRenderHook() {
        const original = window.renderEntities;
        if (typeof original !== 'function') return false;
        if (original.__civilianOccupationProps) return true;
        const wrapped = function(...args) {
            const result = original.apply(this, args);
            drawOccupationProps();
            return result;
        };
        wrapped.__civilianOccupationProps = true;
        wrapped.__original = original;
        window.renderEntities = wrapped;
        return true;
    }

    window.CivilianVisualDiversity = {
        styleEntity,
        styleMaterialised,
        appearanceKey,
        drawOccupationProps,
        drawPropShape,
        installRenderHook,
        get stats() { return { stylePasses, entitiesStyled, propDrawPasses, propDraws }; },
        HAIR_STYLE_MAP,
        OCCUPATION_CLOTHES,
    };

    window.__civilianVisualDiversityTimer = setInterval(styleMaterialised, STYLE_INTERVAL_MS);
    styleMaterialised();
    if (!installRenderHook()) {
        const installTimer = setInterval(() => {
            if (installRenderHook()) clearInterval(installTimer);
        }, 50);
        setTimeout(() => clearInterval(installTimer), 10000);
    }
})();
