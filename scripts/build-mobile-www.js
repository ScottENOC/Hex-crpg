#!/usr/bin/env node
// Populates mobile/www/ (Capacitor's webDir) from the repo root, WITHOUT
// touching the root itself — GitHub Pages serves the root directly, so
// this has to be purely additive/one-way, never a move.
//
// Two differences from a straight copy:
// 1. Only the files the game actually needs ship (root *.js/*.css/index.html,
//    images/, audio/) — not node_modules, tests/, scripts/, appstore/, docs/,
//    server.js (the multiplayer backend, irrelevant to a client bundle), or
//    the two known-stray unused files (gameEngine.js_new, learnSkill_fixed.js).
// 2. index.html's socket.io CDN <script> tag is swapped for a locally
//    bundled copy (see network.js's own comment: this used to leave
//    `io` undefined if the CDN load failed/was unreachable — already
//    guarded so solo play survives that, but a wrapped app with no
//    network at all shouldn't be depending on a CDN in the first place).
//    The GitHub Pages copy (the actual repo root) is untouched — it keeps
//    loading from the CDN exactly as it does today.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'mobile', 'www');

const CDN_TAG = '<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>';
const LOCAL_TAG = '<script src="vendor/socket.io.min.js"></script>';

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

    for (const dir of ['images', 'audio']) {
        const src = path.join(ROOT, dir);
        if (fs.existsSync(src)) copyDir(src, path.join(OUT, dir));
    }

    // Locally bundled socket.io client, same version the CDN tag pinned.
    const vendorDir = path.join(OUT, 'vendor');
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.copyFileSync(
        path.join(ROOT, 'node_modules', 'socket.io-client', 'dist', 'socket.io.min.js'),
        path.join(vendorDir, 'socket.io.min.js')
    );

    // Swap the CDN tag for the local one in the COPY only (mobile/www/index.html);
    // the repo root's own index.html is never touched.
    const indexPath = path.join(OUT, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    if (!html.includes(CDN_TAG)) {
        throw new Error(`Expected CDN tag not found in index.html — update CDN_TAG in ${__filename} to match (it may have changed).`);
    }
    fs.writeFileSync(indexPath, html.replace(CDN_TAG, LOCAL_TAG));

    console.log(`Built mobile/www (${fs.readdirSync(OUT).length} top-level entries).`);
}

main();
