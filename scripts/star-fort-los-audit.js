#!/usr/bin/env node
// Audits every current Northwatch garrison post for outward line of sight
// (can they see at least one hex meaningfully outside the fort's own wall
// ring?), to find bad posts like the ones the user spotted (263,-11 can't
// see out, 254,-2 can).
const { chromium } = require('playwright');
const http = require('http');
const BASE_URL = 'http://localhost:3000';

function waitForServer(url, timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            http.get(url, (res) => { res.resume(); resolve(); })
                .on('error', () => {
                    if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
                    else setTimeout(tryOnce, 300);
                });
        };
        tryOnce();
    });
}

async function main() {
    await waitForServer(BASE_URL, 5000);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => { window.console.log = () => {}; });
    await page.goto(BASE_URL + '/');
    await page.waitForSelector('#race-select', { state: 'visible' });
    await page.selectOption('#race-select', 'human');
    await page.selectOption('#gender-select', 'male');
    await page.selectOption('#class-select', 'fighter');
    await page.selectOption('#campaign-select', '2');
    await page.click('#createCharacterButton');
    await page.waitForSelector('#character-screen-modal', { state: 'visible' });
    await page.click('#character-screen-modal .close-btn');
    await page.waitForFunction(() => window.campaign2NorthwatchFortRegion && window.campaign2NorthwatchGateHex);

    const result = await page.evaluate(() => {
        // Force full daylight so the light-based visibility cutoff in
        // hasLineOfSightUncached (hexMap.js) doesn't confound a pure
        // "is a wall blocking this" question.
        window.lightLevel = 1.0;
        window.invalidateVisibilityCache && window.invalidateVisibilityCache();

        const center = window.campaign2NorthwatchCenter;
        const fortRegion = window.campaign2NorthwatchFortRegion;
        const keepRegion = window.campaign2NorthwatchKeepRegion;
        const insideFort = new Set([
            ...fortRegion.floorHexes, ...fortRegion.wallHexes,
            ...keepRegion.floorHexes, ...keepRegion.wallHexes,
        ].map(h => `${h.q},${h.r}`));
        const defenders = window.entities.filter(e => e.factionTag === 'northwatch_human' && e.alive !== undefined);

        // "Can see out" test. Two candidate-target strategies combined,
        // since a single-hex-wide gap (the keep's own gaps, and the star's
        // gate) is easy to miss with generic angle sampling that doesn't
        // align with the hex grid's actual 6 neighbor directions:
        //  1. The 6 real axial hex directions this world is built from
        //     (matches STAR_FORT_DIRECTIONS/carveStarFort/carveHexKeep),
        //     radiating from the fort CENTER at radius 20 — these are
        //     exactly where the star's wedge gaps and the keep's 6 corner
        //     gaps actually point, so they reliably hit a real sightline
        //     if one exists from anywhere near that spoke.
        //  2. A 12-direction Euclidean ring around the post itself
        //     (backstop for posts that aren't near a spoke line at all,
        //     e.g. the outer wall corners).
        // Every candidate is filtered to hexes confirmed NOT in insideFort
        // first, so a "pass" always means real, verified outside terrain.
        const HEX_DIRS = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
        ];
        const DIRS12 = [];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * 2 * Math.PI;
            DIRS12.push({ dq: Math.cos(angle), dr: Math.sin(angle) });
        }
        function canSeeOutward(hex) {
            const candidates = [];
            HEX_DIRS.forEach(d => candidates.push({ q: center.q + d.q * 20, r: center.r + d.r * 20 }));
            DIRS12.forEach(d => candidates.push({ q: Math.round(hex.q + d.dq * 15), r: Math.round(hex.r + d.dr * 15) }));
            let anyOutsideTarget = false;
            for (const t of candidates) {
                if (insideFort.has(`${t.q},${t.r}`)) continue;
                anyOutsideTarget = true;
                if (window.hasLineOfSight(hex, t)) return { ok: true, hadOutsideTarget: true };
            }
            return { ok: false, hadOutsideTarget: anyOutsideTarget };
        }

        const audit = defenders.map(e => {
            const r = canSeeOutward(e.hex);
            return {
                name: e.name,
                hex: { ...e.hex },
                distFromCenter: window.distance(e.hex, center),
                canSeeOut: r.ok,
                hadOutsideTarget: r.hadOutsideTarget,
            };
        });

        return { center, audit };
    });

    console.log(`Fort center: ${result.center.q},${result.center.r}\n`);
    const bad = result.audit.filter(a => !a.canSeeOut);
    const good = result.audit.filter(a => a.canSeeOut);
    console.log(`${good.length}/${result.audit.length} posts have outward LOS. ${bad.length} do NOT:`);
    bad.forEach(a => console.log(`  BAD: ${a.name} at ${a.hex.q},${a.hex.r} (dist ${a.distFromCenter} from center)`));
    console.log('\nAll posts:');
    result.audit.forEach(a => console.log(`  ${a.canSeeOut ? 'OK ' : 'BAD'}: ${a.name} at ${a.hex.q},${a.hex.r} (dist ${a.distFromCenter})`));

    await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
