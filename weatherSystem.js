// weatherSystem.js
// Deterministic outdoor weather + temperature. Weather is derived entirely
// from worldSeconds, so it needs no save-file state: loading the same in-game
// time recreates the same front, temperature, precipitation and ground cover.
(() => {
    'use strict';

    const WEATHER_BLOCK_SECONDS = 3 * 3600;
    const YEAR_DAYS = 360;
    const SUMMER_PEAK_DAY = 165; // matches worldTime.js's longest-day peak
    const SNOW_CUTOFF_C = 1.5;
    const WORLD_HEX_SIZE = 130; // campaign2World.js
    const NORTH_C_PER_WORLD_HEX = 0.8;
    const MAX_LATITUDE_OFFSET_C = 8;
    const SURFACE_HISTORY_BLOCKS = 80; // ten in-game days at 3 h per block

    const SNOWABLE_TERRAIN = new Set([
        'Grass', 'Forest', 'Foliage', 'Path', 'Dirt', 'Sand', 'Swamp',
        'Mountain', 'Rocky Outcrop', 'Rubble', 'High Ground'
    ]);

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function fract(v) { return v - Math.floor(v); }
    function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

    // Cheap deterministic hash for an integer weather block + salt. This is
    // intentionally independent of Math.random(), so weather does not change
    // because combat/AI happened to consume a different number of RNG calls.
    function hash01(n, salt = 0) {
        let x = (n | 0) ^ (salt | 0);
        x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
        x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
        x ^= x >>> 16;
        return (x >>> 0) / 4294967296;
    }

    function dayOfYear(seconds) {
        const day = Math.floor(Math.max(0, Number(seconds) || 0) / 86400);
        return ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
    }

    function hourOfDay(seconds) {
        const s = Math.max(0, Number(seconds) || 0) % 86400;
        return s / 3600;
    }

    function seasonalSignal(seconds) {
        return Math.cos(((dayOfYear(seconds) - SUMMER_PEAK_DAY) / YEAR_DAYS) * Math.PI * 2);
    }

    function seasonalMeanC(seconds) {
        // Temperate climate: roughly 4 C mean at the winter trough and 24 C
        // at the summer peak before time-of-day, latitude and weather terms.
        return 14 + 10 * seasonalSignal(seconds);
    }

    function diurnalOffsetC(seconds) {
        // Warmest around 2 pm, coolest before dawn. +/-5 C gives a useful
        // gameplay swing without turning every summer night into winter.
        return 5 * Math.cos(((hourOfDay(seconds) - 14) / 24) * Math.PI * 2);
    }

    function interpolatedFrontOffsetC(seconds) {
        const rawBlock = Math.max(0, Number(seconds) || 0) / WEATHER_BLOCK_SECONDS;
        const block = Math.floor(rawBlock);
        const f = smoothstep(rawBlock - block);
        const a = (hash01(block, 0x51f15e) - 0.5) * 8;      // +/-4 C
        const b = (hash01(block + 1, 0x51f15e) - 0.5) * 8;
        return a + (b - a) * f;
    }

    function weatherReferenceHex() {
        return window.entities?.find?.(e => e.alive && e.side === 'player' && !e.rider)?.hex
            || window.player?.hex
            || null;
    }

    function weatherOriginR() {
        return Number(window.campaign2Landmarks?.crossroads?.r ?? 24);
    }

    function northingWorldHexes(hex) {
        if (!hex || !Number.isFinite(Number(hex.r))) return 0;
        // Campaign 2 explicitly builds its north road with {q:0,r:-1}, so
        // decreasing r is north. Express northing in world-map-cell units.
        return (weatherOriginR() - Number(hex.r)) / WORLD_HEX_SIZE;
    }

    function northTemperatureOffsetC(hex) {
        // A modest climatic gradient: Silverhart, four world-map hexes north
        // of Hollowmere, is about 3.2 C colder under the same weather front.
        return clamp(-northingWorldHexes(hex) * NORTH_C_PER_WORLD_HEX,
            -MAX_LATITUDE_OFFSET_C, MAX_LATITUDE_OFFSET_C);
    }

    function getWeatherStateAt(seconds = window.worldSeconds || 0, hex = weatherReferenceHex()) {
        const s = Math.max(0, Number(seconds) || 0);
        const block = Math.floor(s / WEATHER_BLOCK_SECONDS);
        const winterFactor = (1 - seasonalSignal(s)) * 0.5; // 0 summer -> 1 winter
        const cloudiness = hash01(block, 0x77a11d);

        // Wetter winters, drier summers. The weather front itself is shared
        // across the local map, while local temperature decides rain vs snow.
        const precipChance = 0.15 + 0.13 * winterFactor;
        const precipRoll = hash01(block, 0x2c1b3c);
        const precipitating = precipRoll < precipChance;
        const intensity = precipitating ? (0.35 + hash01(block, 0x99c4a7) * 0.65) : 0;

        // Clouds and active precipitation both cool the outdoor air. Latitude
        // is a real temperature term too: heading north (lower r) gets colder.
        const cloudCoolingC = cloudiness * 1.4;
        const precipCoolingC = precipitating ? (0.7 + intensity * 1.3) : 0;
        const latitudeOffsetC = northTemperatureOffsetC(hex);
        const temperatureC = seasonalMeanC(s) + diurnalOffsetC(s) +
            interpolatedFrontOffsetC(s) + latitudeOffsetC - cloudCoolingC - precipCoolingC;

        const precipitation = !precipitating ? 'none' : (temperatureC <= SNOW_CUTOFF_C ? 'snow' : 'rain');
        // Wet rain makes exposed characters feel colder than the thermometer;
        // snow is already selected only in genuinely cold air, so its extra
        // apparent penalty is smaller.
        const feelsLikeC = temperatureC - (precipitation === 'rain'
            ? 1.5 * intensity
            : precipitation === 'snow' ? 0.5 * intensity : 0);

        return {
            block,
            precipitation,
            intensity,
            cloudiness,
            temperatureC,
            feelsLikeC,
            latitudeOffsetC,
            northingWorldHexes: northingWorldHexes(hex),
            wind: (hash01(block, 0x6ed9eb) - 0.5) * 2, // -1..1, also drives particle slant
        };
    }

    function refreshWeatherState() {
        const referenceHex = weatherReferenceHex();
        const state = getWeatherStateAt(window.worldSeconds || 0, referenceHex);
        window.currentWeather = state;
        window.ambientTemperatureC = state.temperatureC;
        return state;
    }

    function getAmbientTemperatureC(seconds = window.worldSeconds || 0, hex = weatherReferenceHex()) {
        return getWeatherStateAt(seconds, hex).temperatureC;
    }

    function getFeelsLikeTemperatureC(seconds = window.worldSeconds || 0, hex = weatherReferenceHex()) {
        return getWeatherStateAt(seconds, hex).feelsLikeC;
    }

    // ---------------------------------------------------------------------
    // Settled snow + shallow-water ice. These are derived from recent weather
    // rather than saved as thousands of per-hex values. Surface state is
    // quantised into half-world-hex north/south bands and cached for the
    // current 3-hour block, so asking about every visible hex is effectively
    // one short history simulation per latitude band, not per tile.
    let surfaceCacheBlock = null;
    const surfaceCache = new Map();

    function surfaceBand(hex) {
        const r = Number(hex?.r ?? weatherOriginR());
        return Math.round((r - weatherOriginR()) / (WORLD_HEX_SIZE / 2));
    }

    function sampleHexForBand(band) {
        return { q: 0, r: weatherOriginR() + band * (WORLD_HEX_SIZE / 2) };
    }

    function getSurfaceStateAt(seconds = window.worldSeconds || 0, hex = weatherReferenceHex()) {
        const s = Math.max(0, Number(seconds) || 0);
        const block = Math.floor(s / WEATHER_BLOCK_SECONDS);
        if (surfaceCacheBlock !== block) {
            surfaceCacheBlock = block;
            surfaceCache.clear();
        }
        const band = surfaceBand(hex);
        if (surfaceCache.has(band)) return surfaceCache.get(band);

        let snowCover = 0;
        let iceCover = 0;
        const sampleHex = sampleHexForBand(band);
        const firstBlock = Math.max(0, block - SURFACE_HISTORY_BLOCKS + 1);

        for (let b = firstBlock; b <= block; b++) {
            const sampleSeconds = (b + 0.5) * WEATHER_BLOCK_SECONDS;
            const state = getWeatherStateAt(sampleSeconds, sampleHex);
            const sunshine = 1 - state.cloudiness;

            if (state.precipitation === 'snow') {
                // Three hours of snow can lay a noticeable but not instantly
                // complete blanket. Repeated snow builds toward full cover.
                snowCover += 0.10 + 0.22 * state.intensity;
            }
            if (state.precipitation === 'rain') {
                // Rain attacks an existing snowpack even if air is only just
                // above freezing.
                snowCover -= 0.08 + 0.15 * state.intensity;
            }
            if (state.temperatureC > 0) {
                // Warm air is the primary melt term; direct sunshine matters
                // too, so a bright 3 C afternoon clears snow faster than an
                // overcast 3 C afternoon.
                snowCover -= state.temperatureC * 0.012;
                snowCover -= sunshine * Math.min(0.055, state.temperatureC * 0.006);
            } else {
                // Very slow settling/compaction stops ancient snow from being
                // mathematically immortal during a long dry freeze.
                snowCover *= 0.997;
            }
            snowCover = clamp(snowCover, 0, 1);

            // Shallow water needs sustained sub-zero weather rather than one
            // cold hour. Around -2 C it takes several days to become solid;
            // a deeper freeze can establish substantial cover in ~1-2 days.
            if (state.temperatureC <= -1.5) {
                iceCover += 0.035 + Math.min(0.075, (-1.5 - state.temperatureC) * 0.012);
            } else if (state.temperatureC > 0) {
                iceCover -= 0.04 + state.temperatureC * 0.018;
            } else {
                iceCover -= 0.008;
            }
            iceCover = clamp(iceCover, 0, 1);
        }

        const result = { snowCover, iceCover, band };
        surfaceCache.set(band, result);
        return result;
    }

    function isOutdoorSnowSurface(q, r, terrainName) {
        if (!SNOWABLE_TERRAIN.has(terrainName)) return false;
        if (typeof window.findInteriorRegion === 'function' && window.findInteriorRegion({ q, r })) return false;
        return true;
    }

    function getGroundSnowCoverAt(q, r, terrainName, seconds = window.worldSeconds || 0) {
        if (window.currentCampaign && window.currentCampaign !== '2') return 0;
        if (terrainName && !isOutdoorSnowSurface(q, r, terrainName)) return 0;
        let cover = getSurfaceStateAt(seconds, { q, r }).snowCover;
        // Travel and exposed surfaces retain a little less snow. This is only
        // visual ground cover; it does not create a movement penalty yet.
        if (terrainName === 'Path' || terrainName === 'Dirt') cover *= 0.72;
        else if (terrainName === 'Sand' || terrainName === 'Swamp') cover *= 0.85;
        else if (terrainName === 'Forest' || terrainName === 'Foliage') cover *= 1.05;
        return clamp(cover, 0, 1);
    }

    function getWaterIceCoverAt(q, r, terrainName = 'Water', seconds = window.worldSeconds || 0) {
        // Only shallow Water freezes. Deep Water represents large/open bodies
        // and remains visually open in this first pass.
        if (window.currentCampaign && window.currentCampaign !== '2') return 0;
        if (terrainName !== 'Water') return 0;
        return getSurfaceStateAt(seconds, { q, r }).iceCover;
    }

    window.getWeatherStateAt = getWeatherStateAt;
    window.getWeatherState = () => refreshWeatherState();
    window.getAmbientTemperatureC = getAmbientTemperatureC;
    window.getFeelsLikeTemperatureC = getFeelsLikeTemperatureC;
    window.getGroundSnowCoverAt = getGroundSnowCoverAt;
    window.getWaterIceCoverAt = getWaterIceCoverAt;
    window.getWeatherSurfaceStateAt = getSurfaceStateAt;

    // ---------------------------------------------------------------------
    // Precipitation renderer. This is a separate canvas over #mapCanvas, so
    // rain/snow can animate without forcing terrain + every entity to redraw
    // 30-60 times per second. The game UI sits above #game-board already.
    let overlay = null;
    let ctx = null;
    let cssW = 0;
    let cssH = 0;
    let backingScale = 1;
    let lastDrawAt = 0;
    let lastWasVisible = false;
    let resizeObserver = null;

    function ensureOverlay() {
        if (typeof document === 'undefined') return null;
        const board = document.getElementById('game-board');
        if (!board) return null;
        if (overlay && overlay.parentElement === board) return overlay;

        overlay = document.createElement('canvas');
        overlay.id = 'weather-overlay-canvas';
        overlay.setAttribute('aria-hidden', 'true');
        Object.assign(overlay.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '5',
        });
        board.appendChild(overlay);
        ctx = overlay.getContext('2d');
        resizeOverlay();

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver?.disconnect?.();
            resizeObserver = new ResizeObserver(resizeOverlay);
            resizeObserver.observe(board);
        }
        return overlay;
    }

    function resizeOverlay() {
        if (!overlay || !overlay.parentElement || !ctx) return;
        const rect = overlay.parentElement.getBoundingClientRect();
        cssW = Math.max(1, Math.round(rect.width));
        cssH = Math.max(1, Math.round(rect.height));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const renderScale = typeof window.renderScale === 'number' ? clamp(window.renderScale, 0.5, 1) : 1;
        backingScale = Math.max(0.5, dpr * renderScale);
        const w = Math.max(1, Math.round(cssW * backingScale));
        const h = Math.max(1, Math.round(cssH * backingScale));
        if (overlay.width !== w) overlay.width = w;
        if (overlay.height !== h) overlay.height = h;
        ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    }

    function isPlayerInside() {
        const player = window.entities?.find?.(e => e.side === 'player' && !e.rider) || window.player;
        if (!player?.hex) return false;
        if (typeof window.findInteriorRegion === 'function' && window.findInteriorRegion(player.hex)) return true;
        if (typeof window.isPlayerIndoors === 'function' && window.isPlayerIndoors()) return true;
        return false;
    }

    function shouldShowPrecipitation(state) {
        if (!state || state.precipitation === 'none') return false;
        if (typeof document === 'undefined') return false;
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer && gameContainer.style.display === 'none') return false;
        return !isPlayerInside();
    }

    function particleCount(state, kind) {
        const areaFactor = clamp((cssW * cssH) / (900 * 600), 0.45, 1.7);
        const full = !window.reduceMotion && (typeof window.renderScale !== 'number' || window.renderScale >= 0.75);
        const base = kind === 'rain' ? (full ? 150 : 55) : (full ? 95 : 38);
        const motionMult = window.reduceMotion ? 0.45 : 1;
        return Math.max(8, Math.round(base * areaFactor * (0.45 + state.intensity * 0.75) * motionMult));
    }

    function drawRain(state, nowSec) {
        const count = particleCount(state, 'rain');
        const motion = window.reduceMotion ? 0.25 : 1;
        const speedBase = (430 + 260 * state.intensity) * motion;
        const windPx = state.wind * (90 + 80 * state.intensity) * motion;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = window.reduceMotion ? 1 : 1.25;
        ctx.strokeStyle = 'rgba(185, 215, 235, 0.58)';
        for (let i = 0; i < count; i++) {
            const sx = hash01(i, state.block ^ 0x105acd);
            const sy = hash01(i, state.block ^ 0x49db2f);
            const speed = speedBase * (0.72 + hash01(i, 0x31f22a) * 0.55);
            const cycle = cssH + 70;
            const y = fract((sy * cycle + nowSec * speed) / cycle) * cycle - 35;
            const xRaw = sx * cssW + nowSec * windPx + y * (state.wind * 0.08);
            const x = ((xRaw % (cssW + 60)) + (cssW + 60)) % (cssW + 60) - 30;
            const len = (9 + 10 * state.intensity) * (0.8 + hash01(i, 0x71c833) * 0.5);
            ctx.globalAlpha = 0.38 + hash01(i, 0x511abe) * 0.38;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + state.wind * len * 0.7, y + len);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawSnow(state, nowSec) {
        const count = particleCount(state, 'snow');
        const motion = window.reduceMotion ? 0.2 : 1;
        const fallBase = (34 + 38 * state.intensity) * motion;

        ctx.save();
        ctx.fillStyle = '#f4fbff';
        for (let i = 0; i < count; i++) {
            const sx = hash01(i, state.block ^ 0x0f911b);
            const sy = hash01(i, state.block ^ 0x6a15df);
            const phase = hash01(i, 0x39ab2d) * Math.PI * 2;
            const fall = fallBase * (0.72 + hash01(i, 0x5e3421) * 0.55);
            const cycle = cssH + 30;
            const y = fract((sy * cycle + nowSec * fall) / cycle) * cycle - 15;
            const drift = Math.sin(nowSec * (0.7 + hash01(i, 0x245acd)) + phase) * (8 + 13 * state.intensity) * motion;
            const wind = state.wind * nowSec * 12 * motion;
            const xRaw = sx * cssW + drift + wind;
            const x = ((xRaw % (cssW + 30)) + (cssW + 30)) % (cssW + 30) - 15;
            const radius = 1.2 + hash01(i, 0x1267da) * (1.5 + state.intensity);
            ctx.globalAlpha = 0.5 + hash01(i, 0x7c9e11) * 0.45;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function clearOverlay() {
        if (!ctx || !overlay) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.restore();
    }

    function drawPrecipitation(state, now) {
        if (!ensureOverlay() || !ctx) return;
        if (overlay.clientWidth !== cssW || overlay.clientHeight !== cssH) resizeOverlay();
        clearOverlay();

        // Heavy weather very lightly cools/desaturates the world beneath it.
        if (state.intensity > 0.62) {
            ctx.save();
            ctx.globalAlpha = 0.025 + (state.intensity - 0.62) * 0.07;
            ctx.fillStyle = state.precipitation === 'snow' ? '#dceeff' : '#6d87a0';
            ctx.fillRect(0, 0, cssW, cssH);
            ctx.restore();
        }

        const nowSec = now / 1000;
        if (state.precipitation === 'rain') drawRain(state, nowSec);
        else if (state.precipitation === 'snow') drawSnow(state, nowSec);
    }

    function animationLoop(now) {
        const state = refreshWeatherState();
        const visible = shouldShowPrecipitation(state);
        const simple = window.reduceMotion || (typeof window.renderScale === 'number' && window.renderScale < 0.75);
        const frameMs = simple ? 66 : 33; // 15 or 30 FPS: enough for weather, cheap on phones

        if (visible) {
            if (now - lastDrawAt >= frameMs) {
                drawPrecipitation(state, now);
                lastDrawAt = now;
            }
            lastWasVisible = true;
            requestAnimationFrame(animationLoop);
        } else {
            if (lastWasVisible) clearOverlay();
            lastWasVisible = false;
            setTimeout(() => requestAnimationFrame(animationLoop), 400);
        }
    }

    // ---------------------------------------------------------------------
    // Ground surface renderer. It deliberately does NOT run in the animated
    // precipitation canvas. Instead it hooks the existing drawMap ->
    // renderEntities boundary, drawing settled snow/ice after terrain+fog but
    // before characters. A camera-anchored offscreen buffer means normal
    // frames pay one drawImage; expensive per-hex work happens only when the
    // party/weather/zoom changes or the camera leaves a small slack margin.
    let insideDrawMap = false;
    let groundBuffer = null;
    let groundBufferCtx = null;
    let groundOriginX = 0;
    let groundOriginY = 0;
    let groundZoom = null;
    let groundKey = '';
    let groundMargin = 0;
    let groundHasPixels = false;

    function fillHexOn(ctx2d, x, y, radius, fillStyle, strokeStyle = null) {
        ctx2d.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            if (i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
        }
        ctx2d.closePath();
        ctx2d.fillStyle = fillStyle;
        ctx2d.fill();
        if (strokeStyle) {
            ctx2d.strokeStyle = strokeStyle;
            ctx2d.lineWidth = Math.max(0.5, radius * 0.035);
            ctx2d.stroke();
        }
    }

    function groundVisibilityKey() {
        const friendlies = (window.entities || []).filter(e => e.alive && e.side === 'player');
        const party = friendlies.map(e => `${e.hex?.q ?? 0},${e.hex?.r ?? 0}`).join(';');
        const block = Math.floor((Number(window.worldSeconds) || 0) / WEATHER_BLOCK_SECONDS);
        return `${block}|${party}|L${Number(window.lightLevel || 1).toFixed(2)}|z${Number(window.cameraZoom || 1).toFixed(3)}|rs${window.renderScale || 1}|fd${window.foliageDetail || 'full'}`;
    }

    function rebuildGroundBuffer() {
        const map = document.getElementById('mapCanvas');
        if (!map || typeof window.getVisibleHexes !== 'function' || typeof window.hexToPixel !== 'function') return;
        const mainCtx = map.getContext('2d');
        if (!mainCtx) return;

        const simple = (typeof window.renderScale === 'number' && window.renderScale < 0.75)
            || window.foliageDetail === 'simple'
            || (window.cameraZoom || 1) < 0.35;
        groundMargin = simple ? 70 : 180;
        const w = Math.max(1, map.width + groundMargin * 2);
        const h = Math.max(1, map.height + groundMargin * 2);
        if (!groundBuffer || groundBuffer.width !== w || groundBuffer.height !== h) {
            groundBuffer = document.createElement('canvas');
            groundBuffer.width = w;
            groundBuffer.height = h;
            groundBufferCtx = groundBuffer.getContext('2d');
        }
        if (!groundBufferCtx) return;
        groundBufferCtx.clearRect(0, 0, w, h);
        groundHasPixels = false;

        groundOriginX = window.cameraX || 0;
        groundOriginY = window.cameraY || 0;
        groundZoom = window.cameraZoom || 1;
        groundKey = groundVisibilityKey();

        const bounds = window.getVisibleHexes();
        const radius = (window.hexSize || 30) * groundZoom;
        const padHex = Math.min(45, Math.ceil(groundMargin / Math.max(4, radius)) + 3);
        const friendlies = (window.entities || []).filter(e => e.alive && e.side === 'player');

        for (let q = bounds.minQ - padHex; q <= bounds.maxQ + padHex; q++) {
            for (let r = bounds.minR - padHex; r <= bounds.maxR + padHex; r++) {
                if (typeof window.isVisibleToPlayer === 'function' && !window.isVisibleToPlayer({ q, r }, friendlies)) continue;
                const terrain = typeof window.getTerrainAt === 'function' ? window.getTerrainAt(q, r) : null;
                if (!terrain) continue;

                const snow = getGroundSnowCoverAt(q, r, terrain.name);
                const ice = getWaterIceCoverAt(q, r, terrain.name);
                if (snow <= 0.035 && ice <= 0.035) continue;

                const p = window.hexToPixel(q, r);
                const x = p.x + groundMargin;
                const y = p.y + groundMargin;

                if (ice > 0.035) {
                    const localIce = simple ? ice : clamp(ice + (hash01((q * 92821) ^ (r * 68917), 0x17ac) - 0.5) * 0.10, 0, 1);
                    if (localIce > 0.035) {
                        const alpha = 0.20 + localIce * 0.62;
                        fillHexOn(groundBufferCtx, x, y, radius,
                            `rgba(210,235,246,${alpha.toFixed(3)})`,
                            simple ? null : `rgba(244,251,255,${(0.12 + localIce * 0.22).toFixed(3)})`);
                        groundHasPixels = true;
                    }
                } else if (snow > 0.035) {
                    // Full detail varies cover by hex to create natural bare
                    // patches. Simple/low settings use one uniform wash only.
                    const localSnow = simple ? snow : clamp(snow + (hash01((q * 73871) ^ (r * 19391), 0x53b1) - 0.5) * 0.28, 0, 1);
                    if (localSnow > 0.035) {
                        const alpha = 0.12 + localSnow * 0.68;
                        const blueShift = simple ? 246 : Math.round(244 + hash01((q * 31337) ^ r, 0x7721) * 8);
                        fillHexOn(groundBufferCtx, x, y, radius,
                            `rgba(${blueShift},${Math.min(255, blueShift + 5)},255,${alpha.toFixed(3)})`);
                        groundHasPixels = true;
                    }
                }
            }
        }
    }

    function drawGroundSurfaceOverlay() {
        if (typeof document === 'undefined') return;
        const map = document.getElementById('mapCanvas');
        if (!map) return;
        const mainCtx = map.getContext('2d');
        if (!mainCtx) return;

        const key = groundVisibilityKey();
        const dx = (window.cameraX || 0) - groundOriginX;
        const dy = (window.cameraY || 0) - groundOriginY;
        const limit = groundMargin ? groundMargin * 0.55 : 0;
        const needsRebuild = !groundBuffer || groundKey !== key || groundZoom !== (window.cameraZoom || 1)
            || groundBuffer.width !== map.width + groundMargin * 2
            || groundBuffer.height !== map.height + groundMargin * 2
            || Math.abs(dx) > limit || Math.abs(dy) > limit;
        if (needsRebuild) rebuildGroundBuffer();
        if (!groundBuffer || !groundHasPixels) return;

        const shiftX = (window.cameraX || 0) - groundOriginX - groundMargin;
        const shiftY = (window.cameraY || 0) - groundOriginY - groundMargin;
        mainCtx.drawImage(groundBuffer, shiftX, shiftY);
    }

    function installGroundRendererHook() {
        if (typeof window.drawMap !== 'function' || typeof window.renderEntities !== 'function') return false;
        if (window.drawMap.__weatherGroundWrapped || window.renderEntities.__weatherGroundWrapped) return true;

        const baseDrawMap = window.drawMap;
        const baseRenderEntities = window.renderEntities;
        const wrappedDrawMap = function() {
            insideDrawMap = true;
            try { return baseDrawMap.apply(this, arguments); }
            finally { insideDrawMap = false; }
        };
        wrappedDrawMap.__weatherGroundWrapped = true;
        wrappedDrawMap.__weatherGroundBase = baseDrawMap;

        const wrappedRenderEntities = function() {
            if (insideDrawMap) drawGroundSurfaceOverlay();
            return baseRenderEntities.apply(this, arguments);
        };
        wrappedRenderEntities.__weatherGroundWrapped = true;
        wrappedRenderEntities.__weatherGroundBase = baseRenderEntities;

        window.drawMap = wrappedDrawMap;
        window.renderEntities = wrappedRenderEntities;
        return true;
    }

    function startWeatherSystem() {
        refreshWeatherState();
        if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
        ensureOverlay();
        requestAnimationFrame(animationLoop);
        if (!installGroundRendererHook() && typeof setInterval === 'function') {
            const hookTimer = setInterval(() => {
                if (installGroundRendererHook()) clearInterval(hookTimer);
            }, 100);
        }
    }

    window.weatherSystem = {
        refresh: refreshWeatherState,
        stateAt: getWeatherStateAt,
        surfaceStateAt: getSurfaceStateAt,
        resizeOverlay,
        start: startWeatherSystem,
        constants: {
            WEATHER_BLOCK_SECONDS,
            SNOW_CUTOFF_C,
            WORLD_HEX_SIZE,
            NORTH_C_PER_WORLD_HEX,
            MAX_LATITUDE_OFFSET_C,
            SURFACE_HISTORY_BLOCKS,
        },
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWeatherSystem, { once: true });
        else startWeatherSystem();
        window.addEventListener?.('resize', () => {
            resizeOverlay();
            groundKey = '';
        });
    } else {
        refreshWeatherState();
    }
})();
