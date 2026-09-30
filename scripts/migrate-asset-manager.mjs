import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);

function replaceMust(text, search, replacement, label) {
  const before = text;
  text = typeof search === 'string' ? text.replace(search, replacement) : text.replace(search, replacement);
  if (text === before) throw new Error(`Migration pattern not found: ${label}`);
  return text;
}

function replaceSection(file, startMarker, endMarker, replacement) {
  let text = read(file);
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`${file}: start marker not found: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${file}: end marker not found: ${endMarker}`);
  text = text.slice(0, start) + replacement + text.slice(end);
  write(file, text);
}

// 1. Shared manager: make it the sole owner of loading/retries, preserve phase deferral,
// and preserve intentional suppression of retired flat character aliases.
{
  const file = 'assetLoadScheduler.js';
  let text = read(file);
  text = replaceMust(text,
    '// Shared image loading, phase-aware preload gates and a temporary compatibility\n// path redirector for legacy callers. The redirector deliberately does NOT own\n// retries: AssetManager owns network/cache/retry work for all local images.',
    '// Shared image loading and phase-aware preload gates. AssetManager is the sole\n// owner of local image network requests, decoding, cache reuse and retries.',
    'scheduler header');
  text = replaceMust(text, "const SCHEDULER_VERSION = '4';", "const SCHEDULER_VERSION = '5';", 'scheduler version');
  text = replaceMust(text, '// data.js loads this before any other game script in a normal page load.', '// index.html loads this before the other game scripts in a normal page load.', 'scheduler load comment');
  text = replaceMust(text, '    const deferred = [];\n', '', 'legacy deferred array');
  text = replaceMust(text, '    const assignmentVersions = new WeakMap();\n', '', 'legacy assignment versions');
  text = replaceMust(text, /\n    function isLocalAsset\(value\) \{[\s\S]*?\n    \}\n\n    function currentBuild\(\)/, '\n    function currentBuild()', 'legacy local-asset helper');
  text = replaceMust(text, /\n    function dispatchSyntheticError\(img,path,reason\) \{[\s\S]*?\n    \}\n\n    function recordFor\(value\) \{/, `
    function recordKey(value) {
        const requested = normalise(value);
        return SUPPRESSED.has(requested) ? requested : canonicalPath(value);
    }

    function recordFor(value) {`, 'legacy compatibility helpers');
  text = replaceMust(text, /    function recordFor\(value\) \{[\s\S]*?\n    \}\n\n    function settleLoaded/, `    function recordFor(value) {
        const requested = normalise(value);
        const suppressed = SUPPRESSED.has(requested);
        const path = suppressed ? requested : canonicalPath(value);
        let record = managerRecords.get(path);
        if (record) return record;
        const image = new Image();
        let resolvePromise, rejectPromise;
        const promise = new Promise((resolve,reject) => { resolvePromise=resolve; rejectPromise=reject; });
        promise.catch(() => {});
        record = {
            path,image,promise,resolve:resolvePromise,reject:rejectPromise,
            status:suppressed?'suppressed':'idle',queued:false,attempt:0,error:null,
        };
        managerRecords.set(path,record);
        if (suppressed) {
            record.error = new Error(\`Suppressed obsolete asset: \${requested}\`);
            record.reject(record.error);
        }
        return record;
    }

    function settleLoaded`, 'manager record suppression');
  text = replaceMust(text,
    "        if (record.status==='ready' || record.status==='loading' || record.queued || record.status==='error') return record.image;",
    "        if (record.status==='ready' || record.status==='loading' || record.queued || record.status==='error' || record.status==='suppressed') return record.image;",
    'request suppressed state');
  text = replaceMust(text,
    `    function loadManaged(value,opts={}) {
        return ensureManagedStarted(value,opts).promise;
    }

    function whenReady(value,opts={}) {`,
    `    function loadManaged(value,opts={}) {
        return ensureManagedStarted(value,opts).promise;
    }

    function waitManaged(value) {
        return recordFor(value).promise;
    }

    function whenReady(value,opts={}) {`,
    'wait API');
  text = replaceMust(text,
    "        return Promise.allSettled([...new Set(values.map(canonicalPath))].map(path=>loadManaged(path,opts)));",
    "        return Promise.allSettled([...new Set(values.map(recordKey))].map(path=>loadManaged(path,opts)));",
    'preload keying');
  text = replaceMust(text, /\n    \/\/ Temporary compatibility entrance for old `new Image\(\); image\.src=\.\.\.`[\s\S]*?\n    function hash\(text\) \{/, '\n    function hash(text) {', 'prototype src compatibility hook');
  text = replaceMust(text,
    `        request:requestManaged,
        load:loadManaged,
        whenReady,
        preload:preloadManaged,`,
    `        request:requestManaged,
        load:loadManaged,
        wait:waitManaged,
        whenReady,
        preload:preloadManaged,`,
    'manager wait export');
  text = replaceMust(text,
    "        get(path){return managerRecords.get(canonicalPath(path))?.image || null;},\n        status(path){return managerRecords.get(canonicalPath(path))?.status || 'unrequested';},",
    "        get(path){return managerRecords.get(recordKey(path))?.image || null;},\n        status(path){return managerRecords.get(recordKey(path))?.status || 'unrequested';},",
    'manager keyed lookup');
  text = replaceMust(text,
    "        const deferredArt = deferred.map(entry=>entry.canonical).filter(path=>path?.startsWith('images/'));",
    "        const deferredArt = [...managerRecords.values()].filter(record=>record.status==='deferred').map(record=>record.path).filter(path=>path?.startsWith('images/'));",
    'game manifest deferred records');
  text = replaceMust(text, '            releaseDeferred();\n', '', 'legacy deferred release');
  text = replaceMust(text,
    '        get deferred(){return deferred.length;},',
    "        get deferred(){return [...managerRecords.values()].filter(record=>record.status==='deferred').length;},",
    'scheduler deferred count');
  write(file, text);
}

// 2. Ensure every browser entry point installs AssetManager before consumers.
{
  let text = read('index.html');
  if (!text.includes('assetLoadScheduler.js')) {
    text = replaceMust(text, /(<script\s+src=["']data\.js[^>]*><\/script>)/, '<script src="assetLoadScheduler.js?v=5"></script>\n$1', 'index manager script');
  }
  write('index.html', text);

  text = read('spriteRigPreview.html');
  if (!text.includes('assetLoadScheduler.js')) {
    text = replaceMust(text, '<script src="spriteRigging.js"></script>', '<script src="assetLoadScheduler.js?v=5"></script>\n<script src="spriteRigging.js"></script>', 'sprite preview manager script');
  }
  write('spriteRigPreview.html', text);
}

// 3. Replace the giant gameEngine image table in one deterministic pass.
{
  const file = 'gameEngine.js';
  let text = read(file);
  const startMarker = '  const visuals = {';
  const endMarker = '  window.gameVisuals = visuals;';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('gameEngine visual table markers not found');
  const block = text.slice(start, end);
  const keys = [...block.matchAll(/^\s+([A-Za-z0-9_]+): new Image\(\),?\s*$/gm)].map(m=>m[1]);
  const sources = new Map([...block.matchAll(/^\s*visuals\.([A-Za-z0-9_]+)\.src\s*=\s*(['"])(.*?)\2;\s*$/gm)].map(m=>[m[1],m[3]]));
  if (keys.length < 100) throw new Error(`Expected >100 gameEngine visual constructors, found ${keys.length}`);
  if (sources.size !== keys.length) throw new Error(`gameEngine visual/source mismatch: ${keys.length} keys vs ${sources.size} sources`);
  for (const key of keys) if (!sources.has(key)) throw new Error(`gameEngine visual has no literal source: ${key}`);
  const sourceRows = keys.map(key => `      ${key}: ${JSON.stringify(sources.get(key))},`).join('\n');
  const replacement = `  const visualSources = Object.freeze({\n${sourceRows}\n  });\n  const visuals = Object.fromEntries(\n      Object.entries(visualSources).map(([key, src]) => [key, window.assetManager.request(src)])\n  );\n  for (const src of new Set(Object.values(visualSources))) {\n      window.assetManager.whenReady(src).then(() => drawMap()).catch(() => {});\n  }\n`;
  text = text.slice(0,start) + replacement + text.slice(end);
  write(file,text);
}

// 4. Explicit loaders. Local maps remain only to avoid duplicate redraw subscriptions;
// image identity/network/retry ownership is entirely AssetManager's.
replaceSection('humanoidRenderer.js', '    function loadImage(src) {', '    function loadSet(paths) {', `    function loadImage(src) {
        if (!src) return null;
        if (rendererImageCache.has(src)) return rendererImageCache.get(src);
        const image = window.assetManager.request(src);
        rendererImageCache.set(src, image);
        window.assetManager.whenReady(src).then(() => {
            window.drawMap?.();
            window.renderEntities?.();
            queuePortraitRefresh();
        }).catch(() => {});
        return image;
    }

`);

replaceSection('pantsVariantFixes.js', '  function load(src){', '  function ready(img){', `  function load(src){
    if(!src)return null;
    if(images.has(src))return images.get(src);
    const img=window.assetManager.request(src);
    images.set(src,img);
    window.assetManager.whenReady(src).then(()=>{
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
      window.renderEquipmentInterface?.();
    }).catch(()=>{});
    return img;
  }
`);

replaceSection('skirtClothing.js', '  function load(src){', '  function ready(img){', `  function load(src){
    if(images.has(src)) return images.get(src);
    const img=window.assetManager.request(src);
    images.set(src,img);
    window.assetManager.whenReady(src).then(()=>redraw(window.player)).catch(()=>{});
    return img;
  }
`);

replaceSection('braidDirectionalHair.js', '    function ensureSideLeftImage() {', '    function leftRenderSource(entity) {', `    function ensureSideLeftImage() {
        if (sideLeftImage) return sideLeftImage;
        const image = window.assetManager.request(SIDE_LEFT_PATH);
        sideLeftImage = image;
        window.assetManager.whenReady(SIDE_LEFT_PATH).then(() => {
            sideLeftRenderSources.clear();
            window.drawMap?.();
            window.renderEntities?.();
            window.refreshDirectionalTurnPortraits?.();
        }).catch(() => {});
        return image;
    }

`);

replaceSection('equipmentInterface.js', 'function previewImage(src,notify){', 'function alphaBounds(canvas){', `function previewImage(src,notify){
  let entry=clothingPreviewImages.get(src);
  if(!entry){
    const img=window.assetManager.request(src);
    entry={img,ready:false,failed:false,listeners:new Set()};
    clothingPreviewImages.set(src,entry);
    window.assetManager.whenReady(src).then(()=>{
      entry.ready=true;
      for(const fn of entry.listeners)fn();
      entry.listeners.clear();
    }).catch(()=>{
      entry.failed=true;
      for(const fn of entry.listeners)fn();
      entry.listeners.clear();
    });
  }
  if(notify&&!entry.ready&&!entry.failed)entry.listeners.add(notify);
  return entry;
}

`);

// Straightforward per-path loaders whose callbacks are redraw-only.
const redrawLoaderFiles = [
  ['clothingLayers.js', '  function load(src){', '  function ready(img){', `  function load(src){
    if(!src)return null;
    if(images.has(src))return images.get(src);
    const img=window.assetManager.request(src);
    images.set(src,img);
    window.assetManager.whenReady(src).then(()=>{
      window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();window.updateAppearancePreview?.();
    }).catch(()=>{});
    return img;
  }
`],
  ['renderHotPathCache.js', '  function loadSource(src) {', '  function ', `  function loadSource(src) {
    if (!src) return null;
    if (sourceImages.has(src)) return sourceImages.get(src);
    const img = window.assetManager.request(src);
    sourceImages.set(src, img);
    window.assetManager.whenReady(src).then(requestRedraw).catch(() => console.warn('Shirt hot-path asset failed:', src));
    return img;
  }

`],
];
for (const [file,startMarker,endMarker,replacement] of redrawLoaderFiles) replaceSection(file,startMarker,endMarker,replacement);

// Functions with simple known bodies are transformed with constrained regexes.
{
  let text=read('facingSystem.js');
  text=replaceMust(text,/    function loadImage\(src\) \{[\s\S]*?\n    \}\n(?=\n    function )/,`    function loadImage(src) {
        if (!src) return null;
        const img = window.assetManager.request(src);
        window.assetManager.whenReady(src).then(() => {
            window.drawMap?.();
            window.renderEntities?.();
            window.refreshDirectionalTurnPortraits?.();
        }).catch(() => {});
        return img;
    }
`,'facing managed loader');
  write('facingSystem.js',text);
}
{
  let text=read('npcBuilder.js');
  text=replaceMust(text,/\s+const img = new Image\(\);\n\s+img\.src = src;\n\s+img\.addEventListener\('load', \(\) => window\.drawMap\?\.\(\)\);/,
`            const img = window.assetManager.request(src);
            window.assetManager.whenReady(src).then(() => window.drawMap?.()).catch(() => {});`,'npc managed images');
  write('npcBuilder.js',text);
}
{
  let text=read('equipmentAppearance.js');
  text=replaceMust(text,/      const img=new Image\(\);\n      img\.addEventListener\('load',\(\)=>\{window\.drawMap\?\.\(\);window\.renderEntities\?\.\(\);window\.refreshDirectionalTurnPortraits\?\.\(\);\}\);\n      const build=encodeURIComponent\(window\.PRESENTATION_BUILD\|\|BUILD\);\n      img\.src=`\$\{path\}\?build=\$\{build\}`;/,
`      const img=window.assetManager.request(path);
      window.assetManager.whenReady(path).then(()=>{window.drawMap?.();window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();}).catch(()=>{});`,'armour rear managed images');
  write('equipmentAppearance.js',text);
}
{
  let text=read('directionalPresentationFixes.js');
  text=replaceMust(text,/            const img = new Image\(\);\n            img\.addEventListener\('load', \(\) => \{ window\.drawMap\?\.\(\); window\.renderEntities\?\.\(\); \}\);\n            img\.src = `\$\{path\}\?build=\$\{BUILD\}`;/,
`            const img = window.assetManager.request(path);
            window.assetManager.whenReady(path).then(() => { window.drawMap?.(); window.renderEntities?.(); }).catch(() => {});`,'directional presentation managed images');
  write('directionalPresentationFixes.js',text);
}
{
  let text=read('shieldAppearance.js');
  text=replaceMust(text,/if\(!extra\.kite\)\{extra\.kite=new Image\(\);extra\.kite\.addEventListener\('load',redraw\);extra\.kite\.src=`images\/kiteshield\.png\?build=\$\{encodeURIComponent\(BUILD\)\}`;\}/,
`if(!extra.kite){const path='images/kiteshield.png';extra.kite=window.assetManager.request(path);window.assetManager.whenReady(path).then(redraw).catch(()=>{});}`,'shield managed image');
  write('shieldAppearance.js',text);
}
{
  let text=read('scenario5ArmourLab.js');
  text=replaceMust(text,/function loadImage\(src\) \{\n  return new Promise\(\(resolve, reject\) => \{\n    const img = new Image\(\);\n    img\.onload = \(\) => resolve\(img\);\n    img\.onerror = \(\) => reject\(new Error\(`Failed to load \$\{src\}`\)\);\n    img\.src = src;\n  \}\);\n\}/,
`function loadImage(src) {
  return window.assetManager.load(src);
}`,'armour lab managed loader');
  write('scenario5ArmourLab.js',text);
}
{
  let text=read('spriteRigPreview.js');
  text=replaceMust(text,/function loadImage\(src\) \{[\s\S]*?\n\}\n(?=\nfunction )/,
`function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = window.assetManager.load(src);
  imageCache.set(src, promise);
  return promise;
}
`,'sprite preview managed loader');
  write('spriteRigPreview.js',text);
}

// Race-body packing must execute even when the shared source was already ready.
{
  let text=read('raceSkinPalettes.js');
  text=replaceMust(text,
    '        const img = new Image();\n        img.onload = () => {',
    '        const img = window.assetManager.request(src);\n        window.assetManager.whenReady(src).then(() => {',
    'race packed body start');
  text=replaceMust(text,
    '        };\n        img.src = src;\n        return output;',
    '        }).catch(() => {});\n        return output;',
    'race packed body finish');
  text=replaceMust(text,
`            if (!imageCache[src]) {
                const img = new Image();
                img.onload = () => window.updateAppearancePreview?.();
                img.src = src;
                imageCache[src] = img;
            }`,
`            if (!imageCache[src]) {
                const img = window.assetManager.request(src);
                window.assetManager.whenReady(src).then(() => window.updateAppearancePreview?.()).catch(() => {});
                imageCache[src] = img;
            }`,
    'race creator preview');
  write('raceSkinPalettes.js',text);
}

// main.js keeps speculative loads deferred until the manager says they may start.
{
  let text=read('main.js');
  text=replaceMust(text,/function load\(asset\) \{\n    if \(_loadedKeys\.has\(asset\.key\)\) return Promise\.resolve\(\);\n    _loadedKeys\.add\(asset\.key\);\n    return new Promise\(\(resolve\) => \{[\s\S]*?\n    \}\);\n\}/,
`function load(asset) {
    if (_loadedKeys.has(asset.key)) return Promise.resolve();
    _loadedKeys.add(asset.key);
    const img = window.assetManager.request(asset.src);
    window.gameVisuals[asset.key] = img;
    return window.assetManager.wait(asset.src).catch((error) => {
        console.warn('Failed:', asset.src, error);
    });
}`,'main speculative preload');
  text=replaceMust(text,/function loadAppearancePreviewImage\(src\) \{[\s\S]*?\n\}/,
`function loadAppearancePreviewImage(src) {
    let img = _appearancePreviewImages[src];
    if (!img) {
        img = window.assetManager.request(src);
        window.assetManager.whenReady(src).then(() => window.updateAppearancePreview()).catch(() => {});
        _appearancePreviewImages[src] = img;
    }
    return img;
}`,'appearance preview loader');
  write('main.js',text);
}

// False positive: discussion of the old implementation, not executable code.
{
  let text=read('dialogue.js');
  text=replaceMust(text,'detached `new Image()` objects','detached image-loader objects','dialogue audit comment');
  write('dialogue.js',text);
}

// Final hard guard: no runtime file except AssetManager may construct Image directly.
const skipDirs = new Set(['.git','node_modules','tests','tests-unit','test-results','playwright-report','appstore']);
const offenders=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()) { if(!skipDirs.has(entry.name)) walk(path.join(dir,entry.name)); continue; }
    if(!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const rel=path.relative(root,path.join(dir,entry.name)).replaceAll('\\','/');
    if(rel==='assetLoadScheduler.js') continue;
    fs.readFileSync(path.join(dir,entry.name),'utf8').split(/\r?\n/).forEach((line,i)=>{
      if(/\bnew\s+Image\s*\(/.test(line)) offenders.push(`${rel}:${i+1}: ${line.trim()}`);
    });
  }
}
walk(root);
if(offenders.length) throw new Error(`Unmanaged image construction remains:\n${offenders.join('\n')}`);

console.log('Asset-manager migration complete; unmanaged Image constructors: 0');
