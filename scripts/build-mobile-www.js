#!/usr/bin/env node
// Populates mobile/www/ (Capacitor's webDir) from the repo root, WITHOUT
// touching the root itself — GitHub Pages serves the root directly, so
// this has to be purely additive/one-way, never a move.
//
// Only the files the game actually needs ship (root *.js/*.css/index.html,
// images/, audio/, vendor/) — not node_modules, tests/, scripts/,
// appstore/, docs/, server.js (the multiplayer backend, irrelevant to a
// client bundle), or the two known-stray unused files (gameEngine.js_new,
// learnSkill_fixed.js). index.html itself already references
// vendor/socket.io.min.js directly (bundled locally, not a CDN — see
// vendor/socket.io.min.js and network.js), so it's copied as-is with no
// substitution needed; the GitHub Pages copy (the repo root) behaves
// identically to the mobile one.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'mobile', 'www');

function rmrf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

function main() {
    rmrf(OUT);
    fs.mkdirSync(OUT, { recursive: true });

    const skipRootFiles = new Set(['gameEngine.js_new', 'learnSkill_fixed.js', 'server.js']);
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.js') && !entry.name.endsWith('.css') && entry.name !== 'index.html') continue;
        if (skipRootFiles.has(entry.name)) continue;
        fs.copyFileSync(path.join(ROOT, entry.name), path.join(OUT, entry.name));
    }

    for (const dir of ['images', 'audio', 'vendor']) {
        const src = path.join(ROOT, dir);
        if (fs.existsSync(src)) copyDir(src, path.join(OUT, dir));
    }

    console.log(`Built mobile/www (${fs.readdirSync(OUT).length} top-level entries).`);
}

main();
