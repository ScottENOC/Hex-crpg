// dialogueHearing.js
// Shared hearing, reactive ambient chatter, and renderer-derived modesty cues.
(() => {
    'use strict';

    const BUILD = '20260929-dialogue-hearing-v1';
    const VOLUMES = {
        whisper: { clear: 2, max: 4, fontScale: 0.82, italic: true, bold: false, upper: false },
        quiet:   { clear: 3, max: 6, fontScale: 0.90, italic: true, bold: false, upper: false },
        normal:  { clear: 5, max: 9, fontScale: 1.00, italic: false, bold: false, upper: false },
        loud:    { clear: 8, max: 13, fontScale: 1.16, italic: false, bold: true, upper: false },
        shout:   { clear: 12, max: 19, fontScale: 1.30, italic: false, bold: true, upper: true },
    };
    const REACTION_CHECK_SECONDS = 16;
    const REACTION_RANGE = 7;
    const EXPOSURE_THRESHOLD = 0.75;
    const reactionCooldowns = new Map();
    let reactionAccum = 0;

    function hash01(text) {
        let h = 2166136261;
        for (const ch of String(text || '')) {
            h ^= ch.charCodeAt(0);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967296;
    }

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (window.distance) return window.distance(a, b);
        const dq = a.q - b.q, dr = a.r - b.r;
        return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    }

    function slotVisible(entity, slot) {
        return window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) !== false;
    }

    function installElfHearingSkill() {
        if (!window.skills || window.skills.elf_keen_hearing) return;
        window.skills.elf_keen_hearing = {
            name: 'Keen Hearing',
            description: 'Hear conversations clearly from farther away and make out more words at the edge of hearing. Each rank adds 2 hexes of clear hearing and 3 hexes to maximum hearing distance.',
            tree: 'elf',
            maxRanks: 2,
            apply: () => {},
        };
    }

    // Render only the layers that can cover the body, then sample the actual
    // composited alpha around the front-view pelvis. Skipping the renderer's
    // first drawImage suppresses the body itself; clothing opacity, sprite alpha,
    // garment fitting and armour are otherwise exactly the live renderer path.
    function getHumanoidPelvisTransparency(entity) {
        if (!entity || typeof document === 'undefined' || !window.drawDirectionalHumanoidInBounds) return null;
        if (!['human_female', 'human_male', 'elf_female'].includes(`${entity.race}_${entity.gender}`)) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 192;
        const real = canvas.getContext('2d', { willReadFrequently: true });
        if (!real) return null;

        let skipFirstDraw = true;
        const ctx = new Proxy(real, {
            get(target, prop) {
                if (prop === 'drawImage') {
                    return (...args) => {
                        if (skipFirstDraw) { skipFirstDraw = false; return; }
                        return target.drawImage(...args);
                    };
                }
                const value = target[prop];
                return typeof value === 'function' ? value.bind(target) : value;
            },
            set(target, prop, value) { target[prop] = value; return true; },
        });

        const clone = {
            ...entity,
            facing: 'down',
            equipped: { ...(entity.equipped || {}), weapon: null, offhand: null, helmet: null },
            clothingColors: entity.clothingColors ? JSON.parse(JSON.stringify(entity.clothingColors)) : {},
        };
        const previousLayerOrder = window.__humanoidRendererLastLayerOrder;
        const previousLastDraw = window.__humanoidRendererLastDraw;
        const previousArmour = window.__humanoidRendererLastArmour;
        let rendered = false;
        try {
            rendered = !!window.drawDirectionalHumanoidInBounds(ctx, clone, { left: 2, top: 4, width: 92, height: 184 }, 'down');
        } catch (_) {
            return null;
        } finally {
            window.__humanoidRendererLastLayerOrder = previousLayerOrder;
            window.__humanoidRendererLastDraw = previousLastDraw;
            window.__humanoidRendererLastArmour = previousArmour;
        }
        if (!rendered || skipFirstDraw) return null;

        // A small rectangle just above the leg join, expressed in the same
        // normalised front-view bounds as the compositor.
        const left = Math.floor(2 + 92 * 0.43);
        const right = Math.ceil(2 + 92 * 0.57);
        const top = Math.floor(4 + 184 * 0.585);
        const bottom = Math.ceil(4 + 184 * 0.655);
        let data;
        try { data = real.getImageData(left, top, Math.max(1, right - left), Math.max(1, bottom - top)).data; }
        catch (_) { return null; }
        if (!data.length) return null;
        let alpha = 0;
        for (let i = 3; i < data.length; i += 4) alpha += data[i] / 255;
        const averageOpacity = alpha / (data.length / 4);
        return Math.max(0, Math.min(1, 1 - averageOpacity));
    }

    function playerListeners() {
        return (window.entities || []).filter(e => e?.alive && e.side === 'player' && !e.rider && e.hex);
    }

    function bestHearing(speaker, volumeName) {
        const volume = VOLUMES[volumeName] || VOLUMES.normal;
        let best = null;
        for (const listener of playerListeners()) {
            const d = distance(speaker.hex, listener.hex);
            const ranks = Number(listener.skills?.elf_keen_hearing || 0);
            let clear = volume.clear + ranks * 2;
            let max = volume.max + ranks * 3;
            let occluded = false;
            if (window.hasLineOfSight) {
                try { occluded = !window.hasLineOfSight(listener.hex, speaker.hex); } catch (_) { occluded = false; }
            }
            if (occluded) {
                clear *= 0.65;
                max *= 0.65;
            }
            if (d > max) continue;
            let clarity = d <= clear ? 1 : Math.max(0.15, 1 - ((d - clear) / Math.max(0.001, max - clear)) * 0.85);
            if (occluded) clarity *= 0.55;
            const candidate = { listener, distance: d, clarity: Math.max(0, Math.min(1, clarity)), clear, max, occluded };
            if (!best || candidate.clarity > best.clarity || (candidate.clarity === best.clarity && d < best.distance)) best = candidate;
        }
        return best;
    }

    function maskText(text, clarity, seed) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        if (clarity >= 0.995 || !words.length) return words.join(' ');
        const out = words.map((word, i) => hash01(`${seed}|${i}`) <= clarity ? word : '…');
        return out.filter((word, i) => word !== '…' || i === 0 || out[i - 1] !== '…').join(' ');
    }

    function normaliseSpawnArgs(durationOrOptions, options) {
        if (durationOrOptions && typeof durationOrOptions === 'object') {
            return { duration: Number(durationOrOptions.durationMs || 3200), options: durationOrOptions };
        }
        return { duration: Number(durationOrOptions || 3200), options: options || {} };
    }

    function installSpeechSystem() {
        if (!window.speechBubbles || window.spawnSpeechBubble?.__volumeAware) return;

        const spawn = function(speakerName, text, durationOrOptions = 3200, options = {}) {
            const parsed = normaliseSpawnArgs(durationOrOptions, options);
            const volume = VOLUMES[parsed.options.volume] ? parsed.options.volume : 'normal';
            const start = performance.now();
            window.speechBubbles.push({
                speakerName,
                text: String(text || ''),
                start,
                duration: parsed.duration,
                volume,
                hearingSeed: `${speakerName}|${text}|${Math.floor(start)}`,
            });
        };
        spawn.__volumeAware = true;
        window.spawnSpeechBubble = spawn;

        window.renderSpeechBubbles = function(ctx, hexToPixel, zoom) {
            const now = performance.now();
            window.speechBubbles = window.speechBubbles.filter(b => now - b.start < b.duration);
            const placedRects = [];

            window.speechBubbles.forEach(b => {
                const ent = (window.entities || []).find(e => e.name === b.speakerName && e.alive);
                if (!ent?.hex) return;
                const hearing = bestHearing(ent, b.volume || 'normal');
                if (!hearing) return;

                const style = VOLUMES[b.volume] || VOLUMES.normal;
                let audibleText = maskText(b.text, hearing.clarity, b.hearingSeed || `${b.speakerName}|${b.text}|${b.start}`);
                if (style.upper) audibleText = audibleText.toUpperCase();
                if (!audibleText) return;

                const { x, y } = hexToPixel(ent.hex.q, ent.hex.r);
                const fontPx = Math.max(8, Math.round(12 * style.fontScale * zoom));
                const lineHeight = Math.max(10 * zoom, 14 * style.fontScale * zoom);
                const maxTextWidth = 160 * zoom * Math.max(1, style.fontScale * 0.9);
                const padding = 8 * zoom;

                ctx.save();
                ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : ''}${fontPx}px sans-serif`;
                ctx.textAlign = 'center';

                const words = audibleText.split(' ');
                const lines = [];
                let current = '';
                words.forEach(word => {
                    const candidate = current ? `${current} ${word}` : word;
                    if (current && ctx.measureText(candidate).width > maxTextWidth) {
                        lines.push(current);
                        current = word;
                    } else current = candidate;
                });
                if (current) lines.push(current);
                if (!lines.length) { ctx.restore(); return; }

                const boxWidth = Math.min(maxTextWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
                const boxHeight = lines.length * lineHeight + padding * 2;
                const boxX = x - boxWidth / 2;
                let boxY = y - 45 * zoom - boxHeight;
                const overlaps = (a, r) => a.x < r.x + r.width && a.x + a.width > r.x && a.y < r.y + r.height && a.y + a.height > r.y;
                const stackGap = 4 * zoom;
                let attempts = 0;
                while (attempts < 6 && placedRects.some(r => overlaps({ x: boxX, y: boxY, width: boxWidth, height: boxHeight }, r))) {
                    boxY -= boxHeight + stackGap;
                    attempts++;
                }
                placedRects.push({ x: boxX, y: boxY, width: boxWidth, height: boxHeight });

                let borderColor = '#fff';
                if (ent.shirtHue === undefined && window.pickClothingHue) {
                    ent.shirtHue = window.pickClothingHue((ent.name || 'x') + '_shirt');
                    ent.clothingSatMult = 0.85;
                }
                if (ent.shirtHue !== undefined) borderColor = `hsl(${ent.shirtHue}, 70%, 65%)`;

                ctx.fillStyle = 'rgba(20,20,20,0.85)';
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6 * zoom);
                else ctx.rect(boxX, boxY, boxWidth, boxHeight);
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x - 6 * zoom, boxY + boxHeight);
                ctx.lineTo(x + 6 * zoom, boxY + boxHeight);
                ctx.lineTo(x, boxY + boxHeight + 8 * zoom);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#fff';
                lines.forEach((line, i) => ctx.fillText(line, x, boxY + padding + (i + 1) * lineHeight - 4 * zoom));
                ctx.restore();
            });
        };
    }

    function nearbyParty(pair) {
        return (window.entities || []).filter(e => e?.alive && e.side === 'player' && !e.rider && e.hex && pair.some(n => distance(e.hex, n.hex) <= REACTION_RANGE));
    }

    function isVisibleHeavyArmour(entity) {
        if (entity.displayArmour === false || !slotVisible(entity, 'armor')) return false;
        const id = entity.equipped?.armor;
        const item = id && window.items?.[id];
        return !!item && Number(item.reduction || 0) >= 3;
    }

    function hasVisibleAxe(entity) {
        for (const [slot, appearanceSlot] of [['weapon', 'weapon'], ['offhand', 'offhand']]) {
            if (!slotVisible(entity, appearanceSlot)) continue;
            const id = entity.equipped?.[slot];
            const item = id && window.items?.[id];
            if (item?.type === 'weapon' && /axe/i.test(`${id} ${item.name || ''}`)) return true;
        }
        return false;
    }

    function partyPresence(pair) {
        const party = nearbyParty(pair);
        let heavyArmourCount = 0, axeCount = 0, mostlyUndressedCount = 0;
        for (const member of party) {
            if (isVisibleHeavyArmour(member)) heavyArmourCount++;
            if (hasVisibleAxe(member)) axeCount++;
            const transparency = getHumanoidPelvisTransparency(member);
            if (transparency !== null && transparency >= EXPOSURE_THRESHOLD) mostlyUndressedCount++;
        }
        return { party, partySize: party.length, heavyArmourCount, axeCount, mostlyUndressedCount };
    }

    const REACTIONS = [
        {
            id: 'mostly-undressed', cooldown: 180, chance: 0.42, volume: 'whisper',
            when: p => p.mostlyUndressedCount > 0,
            lines: [
                ["Is that… deliberate?", "Eyes up. Let them get on with it."],
                ["Did they lose a wager?", "Lower your voice."],
                ["Bit underdressed, aren't they?", "Pretend you didn't notice."],
            ],
        },
        {
            id: 'armoured-axe-party', cooldown: 150, chance: 0.78, volume: 'quiet',
            when: p => p.partySize >= 4 && p.heavyArmourCount >= 3 && p.axeCount >= 2,
            lines: [
                ["That's a lot of steel for one table.", "And a lot of axes. Don't stare."],
                ["Four armed travellers walk in and everyone remembers their manners.", "Including you, apparently."],
                ["Think they're expecting trouble?", "With that much plate, I think trouble's expecting them."],
            ],
        },
        {
            id: 'armoured-party', cooldown: 150, chance: 0.58, volume: 'quiet',
            when: p => p.partySize >= 3 && p.heavyArmourCount >= 2,
            lines: [
                ["That's serious armour for a quiet drink.", "Then let's hope the drink stays quiet."],
                ["Lot of plate coming through the door.", "Best give them room."],
            ],
        },
        {
            id: 'axe-party', cooldown: 150, chance: 0.48, volume: 'quiet',
            when: p => p.axeCount >= 2,
            lines: [
                ["That's a lot of axes.", "Maybe they're very serious about firewood."],
                ["You notice the axes?", "I was trying very hard not to."],
            ],
        },
    ];

    function eligibleNpcPairs() {
        const npcs = (window.entities || []).filter(e => e?.alive && e.isNPC && e.side === 'neutral' && !e.rider && e.hex);
        const pairs = [];
        for (let i = 0; i < npcs.length; i++) {
            for (let j = i + 1; j < npcs.length; j++) {
                if (distance(npcs[i].hex, npcs[j].hex) > 2) continue;
                if (!nearbyParty([npcs[i], npcs[j]]).length) continue;
                pairs.push([npcs[i], npcs[j]]);
            }
        }
        return pairs;
    }

    function playReaction(pair, reaction) {
        const variants = reaction.lines;
        const lines = variants[Math.floor(Math.random() * variants.length)];
        lines.forEach((text, i) => setTimeout(() => {
            const speaker = pair[i % pair.length];
            if (speaker?.alive) window.spawnSpeechBubble?.(speaker.name, text, { volume: reaction.volume, durationMs: 3600 });
        }, i * 2400));
        reactionCooldowns.set(reaction.id, Number(window.worldSeconds || 0));
    }

    function tryReactiveChatter() {
        if (window.isInCombat) return false;
        const pairs = eligibleNpcPairs();
        if (!pairs.length) return false;
        // Prefer the pair nearest any party member so a reaction reads as local,
        // rather than choosing two people on the far side of the same building.
        pairs.sort((a, b) => {
            const pa = nearbyParty(a), pb = nearbyParty(b);
            const da = Math.min(...pa.flatMap(p => a.map(n => distance(p.hex, n.hex))));
            const db = Math.min(...pb.flatMap(p => b.map(n => distance(p.hex, n.hex))));
            return da - db;
        });
        const pair = pairs[0];
        const presence = partyPresence(pair);
        const now = Number(window.worldSeconds || 0);
        for (const reaction of REACTIONS) {
            if (!reaction.when(presence)) continue;
            const last = reactionCooldowns.get(reaction.id);
            if (last !== undefined && now - last < reaction.cooldown) continue;
            if (Math.random() > reaction.chance) continue;
            playReaction(pair, reaction);
            return true;
        }
        return false;
    }

    function installReactiveChatter() {
        const base = window.checkAmbientNpcChatter;
        if (typeof base !== 'function' || base.__reactiveAppearanceAware) return;
        const wrapped = function(delta) {
            reactionAccum += Number(delta || 0);
            if (reactionAccum >= REACTION_CHECK_SECONDS) {
                reactionAccum = 0;
                if (tryReactiveChatter()) return;
            }
            return base.apply(this, arguments);
        };
        wrapped.__reactiveAppearanceAware = true;
        wrapped.__baseAmbientChatter = base;
        window.checkAmbientNpcChatter = wrapped;
    }

    function install() {
        installElfHearingSkill();
        window.getHumanoidPelvisTransparency = getHumanoidPelvisTransparency;
        installSpeechSystem();
        installReactiveChatter();
        window.dialogueHearingSystem = {
            build: BUILD,
            volumes: VOLUMES,
            exposureThreshold: EXPOSURE_THRESHOLD,
            bestHearing,
            maskText,
            partyPresence,
            getHumanoidPelvisTransparency,
            tryReactiveChatter,
        };
    }

    // Loaded from data.js before most game scripts. Install only after the
    // complete blocking script list has run, so skills, characterBanter and the
    // direct humanoid renderer are all available without changing index.html.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
})();
