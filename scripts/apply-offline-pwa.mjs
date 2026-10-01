#!/usr/bin/env node
import fs from 'node:fs';

function replaceOnce(text, search, replacement, label) {
    const first = text.indexOf(search);
    if (first < 0) throw new Error(`Could not find ${label}`);
    if (text.indexOf(search, first + search.length) >= 0) throw new Error(`Found ${label} more than once`);
    return text.slice(0, first) + replacement + text.slice(first + search.length);
}

let index = fs.readFileSync('index.html', 'utf8');
if (!index.includes('manifest.webmanifest')) {
    const headNeedle = '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n    <meta name="app-build" content="20261001-unified-asset-loading-v2">\n';
    const headReplacement = '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n' +
        '    <meta name="theme-color" content="#201d19">\n' +
        '    <meta name="apple-mobile-web-app-capable" content="yes">\n' +
        '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
        '    <meta name="apple-mobile-web-app-title" content="Silverhart Saga">\n' +
        '    <link rel="manifest" href="manifest.webmanifest">\n' +
        '    <link rel="apple-touch-icon" href="appstore/icon-1024.png">\n' +
        '    <meta name="app-build" content="20261001-pwa-offline-cache-v1">\n';
    index = replaceOnce(index, headNeedle, headReplacement, 'index PWA head insertion point');
}
if (!index.includes('src="offlineCache.js')) {
    const schedulerNeedle = '    <script data-asset-load-scheduler src="assetLoadScheduler.js?v=6"></script>';
    index = replaceOnce(index, schedulerNeedle,
        '    <script src="offlineCache.js?v=1"></script>\n' + schedulerNeedle,
        'asset loader script tag');
}
fs.writeFileSync('index.html', index);

let mobile = fs.readFileSync('scripts/build-mobile-www.js', 'utf8');
const oldFilter = "        if (!entry.name.endsWith('.js') && !entry.name.endsWith('.css') && entry.name !== 'index.html') continue;";
const newFilter = "        if (!entry.name.endsWith('.js') && !entry.name.endsWith('.css') && !entry.name.endsWith('.webmanifest') && entry.name !== 'index.html') continue;";
if (mobile.includes(oldFilter)) mobile = replaceOnce(mobile, oldFilter, newFilter, 'mobile root-file filter');
if (!mobile.includes("appstore', 'icon-1024.png")) {
    const dirLoop = "    for (const dir of ['images', 'audio', 'vendor']) {\n        const src = path.join(ROOT, dir);\n        if (fs.existsSync(src)) copyDir(src, path.join(OUT, dir));\n    }\n";
    const iconCopy = dirLoop + "\n    // Keep the PWA/app icon reference valid in the Capacitor bundle too.\n    const appIcon = path.join(ROOT, 'appstore', 'icon-1024.png');\n    if (fs.existsSync(appIcon)) {\n        const iconOut = path.join(OUT, 'appstore', 'icon-1024.png');\n        fs.mkdirSync(path.dirname(iconOut), { recursive: true });\n        fs.copyFileSync(appIcon, iconOut);\n    }\n";
    mobile = replaceOnce(mobile, dirLoop, iconCopy, 'mobile directory copy loop');
}
fs.writeFileSync('scripts/build-mobile-www.js', mobile);

console.log('Applied PWA/offline-cache wiring.');
