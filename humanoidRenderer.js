// humanoidRenderer.js
// Direct humanoid compositor: one entity in, one deterministic stack out.
//
// This renderer deliberately does not intercept or replace CanvasRenderingContext2D
// methods. Body, hair/helmet, armour, shield and weapons are placed from the
// entity and its rig in one call, so equipment can never inherit stale context
// from a previously drawn character.
(() => {
    'use strict';

    const BUILD = '20261007-unified-humanoid-renderer-v9';
    const VALID_FACINGS = new Set(['up', 'down', 'left', 'right']);
    const HUMAN_RENDER_ASPECT = 0.48;
    const previousHex = new WeakMap();
    const trimCache = new WeakMap();
    const bodyClothingWidthCache = new WeakMap();

    // Measure the authored body's visible width separately in its upper and
    // lower halves. Clothing uses the body as the ruler: shirts match the upper
    // body width and pants match the lower body width. This deliberately measures
    // the whole opaque silhouette, including arms, rather than trying to infer
    // "torso" versus "sleeve" pixels.
    function bodyClothingWidthFractions(image, view, useVisibleFit, bodyTarget) {
        if (!imageReady(image)) return null;
        let byView = bodyClothingWidthCache.get(image);
        if (!byView) { byView = new Map(); bodyClothingWidthCache.set(image, byView); }
        const key = view + '|' + (useVisibleFit ? 'visible' : 'crop') + '|' +
            JSON.stringify(bodyTarget || null);
        if (byView.has(key)) return byView.get(key);

        const layout = DIRECTIONAL_LAYOUT[view];
        const trim = useVisibleFit ? alphaTrim(image) : null;
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        let sourceRegion;
        let destinationWidthFraction;
        if (useVisibleFit) {
            if (!trim?.trimWidth || !trim.trimHeight) return null;
            sourceRegion = {x:trim.trimLeft,y:trim.trimTop,w:trim.trimWidth,h:trim.trimHeight};
            destinationWidthFraction = Number(bodyTarget?.w ?? 1);
        } else {
            const crop = layout?.bodyCrop;
            const dest = layout?.bodyDest;
            if (!crop?.w || !crop.h || !dest?.w) return null;
            sourceRegion = {x:crop.x*iw,y:crop.y*ih,w:crop.w*iw,h:crop.h*ih};
            destinationWidthFraction = dest.w;
        }

        try {
            const canvas=document.createElement('canvas');
            canvas.width=iw; canvas.height=ih;
            const x=canvas.getContext('2d',{willReadFrequently:true});
            x.drawImage(image,0,0);
            const pixels=x.getImageData(0,0,iw,ih).data;
            const measure=(y0,y1)=>{
                let left=iw,right=-1;
                const top=Math.max(0,Math.floor(y0)),bottom=Math.min(ih,Math.ceil(y1));
                for(let y=top;y<bottom;y++){
                    for(let xx=Math.max(0,Math.floor(sourceRegion.x));
                        xx<Math.min(iw,Math.ceil(sourceRegion.x+sourceRegion.w));xx++){
                        if(pixels[(y*iw+xx)*4+3]<8) continue;
                        if(xx<left)left=xx;
                        if(xx>right)right=xx;
                    }
                }
                return right>=left ? (right-left+1)/sourceRegion.w : 0;
            };
            const current={
                shirt:measure(sourceRegion.y,sourceRegion.y+sourceRegion.h*.5)*destinationWidthFraction,
                pants:measure(sourceRegion.y+sourceRegion.h*.45,sourceRegion.y+sourceRegion.h*.68)*destinationWidthFraction,
            };
            let result=current;
            byView.set(key,result);
            return result;
        } catch (_) {
            return null;
        }
    }

    function clothingFitReference(image, view, bounds, useVisibleFit, bodyTarget) {
        const fractions=bodyClothingWidthFractions(image,view,useVisibleFit,bodyTarget);
        if (!fractions) return null;
        // Two authored pixels of breathing room is enough to stop a shirt/pants
        // silhouette from looking pinched. Because cached composites are rendered
        // at a higher resolution, this padding is applied after converting the
        // measured body width into the current compositor's pixel space.
        const padding=2;
        return {
            shirtWidthPx:Math.max(1,fractions.shirt*bounds.width)+padding,
            pantsWidthPx:Math.max(1,fractions.pants*bounds.width)+padding,
            boundsWidthPx:bounds.width,
        };
    }

    // Normalise the authored back silhouette against the front silhouette. This
    // fixes the body at the source rather than teaching individual garments about
    // a back-view exception.
    function bodyHorizontalNormalisation(image, view, bodyTarget, useVisibleFit) {
        if (view !== 'back' || !imageReady(image)) return 1;
        const source = image.src || '';
        const frontSrc = source.replace(/_(?:back|side)(\\.[^./]+)$/,'_front$1');
        if (!frontSrc || frontSrc === source) return 1;
        const frontImage = loadImage(frontSrc);
        if (!imageReady(frontImage)) return 1;
        const measure = (candidate, candidateView) => {
            const iw=candidate.naturalWidth || candidate.width || 1;
            const ih=candidate.naturalHeight || candidate.height || 1;
            const layout=DIRECTIONAL_LAYOUT[candidateView];
            let region, destW;
            if (useVisibleFit) {
                const trim=alphaTrim(candidate);
                if (!trim?.trimWidth || !trim.trimHeight) return 0;
                region={x:trim.trimLeft,y:trim.trimTop,w:trim.trimWidth,h:trim.trimHeight};
                destW=Number(bodyTarget?.w ?? 1);
            } else {
                const crop=layout?.bodyCrop, dest=layout?.bodyDest;
                if (!crop?.w || !dest?.w) return 0;
                region={x:crop.x*iw,y:crop.y*ih,w:crop.w*iw,h:crop.h*ih};
                destW=dest.w;
            }
            try {
                const canvas=document.createElement('canvas');
                canvas.width=iw; canvas.height=ih;
                const x=canvas.getContext('2d',{willReadFrequently:true});
                if (!x) return 0;
                x.drawImage(candidate,0,0);
                const pixels=x.getImageData(0,0,iw,ih).data;
                let left=iw,right=-1;
                const top=Math.max(0,Math.floor(region.y));
                const bottom=Math.min(ih,Math.ceil(region.y+region.h));
                for(let y=top;y<bottom;y++){
                    for(let xx=Math.max(0,Math.floor(region.x));xx<Math.min(iw,Math.ceil(region.x+region.w));xx++){
                        if(pixels[(y*iw+xx)*4+3]<8) continue;
                        if(xx<left) left=xx;
                        if(xx>right) right=xx;
                    }
                }
                return right>=left ? ((right-left+1)/region.w)*destW : 0;
            } catch (_) {
                return 0;
            }
        };
        const backWidth=measure(image,'back');
        const frontWidth=measure(frontImage,'front');
        if (!(backWidth>0) || !(frontWidth>0)) return 1;
        return Math.max(.85,Math.min(1.35,frontWidth/backWidth));
    }

    function normalisedBodyBounds(bounds, image, view, bodyTarget, useVisibleFit) {
        const scale=bodyHorizontalNormalisation(image,view,bodyTarget,useVisibleFit);
        if (scale===1) return bounds;
        const width=bounds.width*scale;
        return {
            left:bounds.left+(bounds.width-width)/2,
            top:bounds.top,
            width,
            height:bounds.height,
        };
    }
    // Several humanoid rigs intentionally share the same authored hair paths.
    // Keep one HTMLImageElement per source so a failed request/retry cannot leave
    // one race's private copy broken while another copy of the same file succeeds.
    const rendererPendingLoads = new Set();
    const mirroredHairSources = new WeakMap();
    let activeSourcePaths = null;
    // Failed composites are remembered per appearance/facing rather than
    // globally blocking every other humanoid. A broken front view must not
    // prevent a visible side/back view, or another character, from rendering.
    const pendingCompositeRequests = new Map();
    const lastRequestedFacing = new WeakMap();
    const COMPOSITE_RETRY_DELAY_MS = 1500;

    // Temporary on-device renderer diagnostics. This is intentionally kept outside
    // the performance report so we can inspect the exact facing/layer decision that
    // caused a composite to be rejected without turning every frame into log spam.
    // Keep renderer debug deliberately tiny. The panel is a troubleshooting
    // instrument, not a session log: retain only the most recent completed
    // attempts plus compact lifetime counters.
    const rendererDebugHistory = [];
    const RENDERER_DEBUG_HISTORY_LIMIT = 6;
    const humanoidFlashTrace = [];
    const HUMANOID_FLASH_TRACE_LIMIT = 80;

    function recordHumanoidFlashTrace(event, entity = null, extra = {}) {
        const trace = {
            t: performance.now(),
            time: new Date().toISOString(),
            event,
            name: entity?.name || entity?.id || '(unknown)',
            facing: entity?.facing || extra.facing || null,
            ...extra,
        };
        humanoidFlashTrace.push(trace);
        while (humanoidFlashTrace.length > HUMANOID_FLASH_TRACE_LIMIT) humanoidFlashTrace.shift();
        return trace;
    }
    const rendererDebugSummary = {
        attempts:0, painted:0, cacheHits:0, pending:0, failures:0, incomplete:0, mapBranches:0, mapCalls:0,
    };
    let rendererDebugPanel = null;

    function rendererDebugRecord(entry) {
        const snapshot = {
            time: new Date().toISOString(),
            ...entry,
            layerDiagnostics: Array.isArray(window.__humanoidRendererLastLayerDiagnostics)
                ? window.__humanoidRendererLastLayerDiagnostics.map(item => ({...item}))
                : [],
            hairDiagnostics: window.__humanoidRendererLastHairDiagnostics
                ? {...window.__humanoidRendererLastHairDiagnostics}
                : null,
        };

        // "started" is an internal trace point. Keep it out of the visible
        // history unless the attempt never produces a final result.
        if (entry.result === 'started') {
            rendererDebugSummary.attempts++;
            rendererDebugSummary.pending++;
            return;
        }

        if (entry.result === 'painted') rendererDebugSummary.painted++;
        else if (entry.result === 'cache-hit') rendererDebugSummary.cacheHits++;
        else if (entry.result === 'incomplete') rendererDebugSummary.incomplete++;
        else rendererDebugSummary.failures++;

        rendererDebugSummary.pending = Math.max(0, rendererDebugSummary.pending - 1);

        rendererDebugHistory.push(snapshot);
        while (rendererDebugHistory.length > RENDERER_DEBUG_HISTORY_LIMIT) rendererDebugHistory.shift();
        rendererDebugRefresh();
    }

    function rendererDebugText() {
        const lines = [
            'HEX RENDER',
            'build: ' + (window.__humanoidRendererBuild || '?') +
                '  clothes: ' + (window.__clothingRendererBuild || '?'),
            'summary: ' + rendererDebugSummary.attempts +
                ' attempts | drawn ' + (rendererDebugSummary.painted + rendererDebugSummary.cacheHits) +
                ' | built ' + rendererDebugSummary.painted +
                ' | cache ' + rendererDebugSummary.cacheHits +
                ' | incomplete ' + rendererDebugSummary.incomplete +
                ' | failed ' + rendererDebugSummary.failures +
                ' | map ' + rendererDebugSummary.mapBranches + '/' + rendererDebugSummary.mapCalls,
            '',
            'RECENT (last ' + RENDERER_DEBUG_HISTORY_LIMIT + ')',
        ];
        if (!rendererDebugHistory.length) {
            lines.push('No renders yet.');
            return lines.join('\\n');
        }

        const compactLayerStatus = (item) => {
            const bySlot = new Map();
            for (const d of (item.layerDiagnostics || [])) {
                const slot = d.slot || d.layerId || '?';
                const ready = !!d.imageComplete && !!d.naturalWidth && !!d.naturalHeight;
                const ok = !!d.drawn;
                bySlot.set(slot, ok ? '✓' : (ready ? '✗' : '…'));
            }
            const order = ['bra','shirt','pants','shoes','underwear'];
            return order.filter(slot => bySlot.has(slot))
                .map(slot => slot + bySlot.get(slot))
                .concat([...bySlot.entries()]
                    .filter(([slot]) => !order.includes(slot))
                    .map(([slot,status]) => slot + status))
                .join(' ');
        };

        const compactHairStatus = (item) => {
            const h = item.hairDiagnostics;
            if (!h) return '';
            const ready = !!h.imageComplete && !!h.naturalWidth && !!h.naturalHeight;
            return 'hair' + (h.drawn ? '✓' : (ready ? '✗' : '…'));
        };

        for (const [index, item] of rendererDebugHistory.entries()) {
            const face = item.facing || '?';
            const view = item.view || '?';
            const layers = compactLayerStatus(item);
            const hair = compactHairStatus(item);
            const status = item.result === 'painted' ? '✓' :
                item.result === 'cache-hit' ? 'cache✓' : '✗';
            const surface = item.surface === 'portrait' ? 'P' : 'M';
            const composite = item.compositeId ? 'C' + item.compositeId : '';
            const parts = ['#' + (index + 1), surface, face + '/' + view, status];
            if (composite) parts.push(composite);
            if (layers) parts.push(layers);
            if (hair) parts.push(hair);
            lines.push(parts.join('  '));

            if (item.result !== 'painted' && item.result !== 'cache-hit') {
                const failed = (item.layerDiagnostics || [])
                    .filter(d => d.expected && !d.drawn)
                    .map(d => d.slot + (d.reason ? ':' + d.reason : ''))
                    .slice(0, 3);
                if (failed.length) lines.push('  FAIL: ' + failed.join(', '));
                else if (item.result) lines.push('  FAIL: ' + item.result);
            }
        }
        if (humanoidFlashTrace.length) {
            lines.push('', 'TRACE (last 12)');
            for (const item of humanoidFlashTrace.slice(-12)) {
                const ms = String(Math.round(item.t)).padStart(7, ' ');
                const name = String(item.name || '?').slice(0, 12);
                const extra = item.sources ? ' ' + item.sources.slice(0, 3).join(',') : '';
                lines.push(ms + '  ' + String(item.event).padEnd(21, ' ') + ' ' + name + extra);
            }
        }
        return lines.join('\\n');
    }

    function rendererDebugRefresh() {
        if (!rendererDebugPanel) return;
        const output = rendererDebugPanel.querySelector('pre');
        if (output) output.textContent = rendererDebugText();
    }

    function installRendererDebugPanel() {
        if (rendererDebugPanel || !document.body) return;
        const wrap = document.createElement('div');
        wrap.id = 'hex-crpg-renderer-debug';
        Object.assign(wrap.style, {
            position:'fixed', right:'8px', bottom:'8px', zIndex:'2147483647',
            width:'min(94vw, 560px)', maxHeight:'70vh', display:'none',
            background:'rgba(0,0,0,.92)', color:'#fff', border:'1px solid #888',
            borderRadius:'8px', padding:'8px', font:'12px/1.35 monospace',
            boxSizing:'border-box', overflow:'hidden',
        });
        const bar=document.createElement('div');
        bar.style.cssText='display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;';
        const button=(label,fn)=>{
            const b=document.createElement('button');
            b.textContent=label; b.type='button'; b.style.cssText='padding:6px 9px;';
            b.addEventListener('click',fn); bar.appendChild(b); return b;
        };
        button('Refresh',rendererDebugRefresh);
        button('Clear',()=>{rendererDebugHistory.length=0;humanoidFlashTrace.length=0;rendererDebugRefresh();});
        button('Copy',async()=>{
            const text=rendererDebugText();
            try {
                await navigator.clipboard?.writeText(text);
            } catch (_) {
                const area=document.createElement('textarea');
                area.value=text; area.style.position='fixed'; area.style.opacity='0';
                document.body.appendChild(area); area.select();
                try { document.execCommand('copy'); } catch (_) {}
                area.remove();
            }
        });
        const close=button('Close',()=>{wrap.style.display='none';});
        close.style.marginLeft='auto';
        const pre=document.createElement('pre');
        pre.style.cssText='margin:0;white-space:pre-wrap;overflow:auto;max-height:calc(70vh - 50px);';
        wrap.append(bar,pre);
        document.body.appendChild(wrap);
        rendererDebugPanel=wrap;

        const toggle=document.createElement('button');
        toggle.type='button'; toggle.textContent='Renderer debug';
        toggle.id='hex-crpg-renderer-debug-toggle';
        Object.assign(toggle.style,{
            position:'fixed',right:'8px',bottom:'8px',zIndex:'2147483646',
            padding:'7px 9px',font:'12px sans-serif',
        });
        toggle.addEventListener('click',()=>{wrap.style.display='block';rendererDebugRefresh();});
        document.body.appendChild(toggle);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',installRendererDebugPanel,{once:true});
    else installRendererDebugPanel();

    window.__humanoidRendererBuild = BUILD;

    // Completed map sprites are built lazily. We deliberately do not prebuild a
    // fixed set for the player: every character/facing gets a composite only when
    // the map actually asks for it. The cache is bounded so NPC-heavy fights cannot
    // turn a useful optimisation into another source of iOS canvas memory pressure.
    // Cache composites in character groups: one appearance can retain up to four
    // directional views, and map + initiative always share the same view canvas.
    // 48 total entries therefore means up to 12 character appearances resident.
    const humanoidSpriteCache = new Map();
    // Keep the last successful composite visible while a changed appearance is rebuilt.
    const humanoidLastGoodCache = new WeakMap();
    const MAX_HUMANOID_SPRITE_VIEWS = 4;
    const MAX_HUMANOID_CACHED_CHARACTERS = 12;
    let nextHumanoidCompositeId = 1;
    // Build cached composites at 3x their map display resolution. The previous
    // cache stored each sprite at its final on-map pixel size, so a small
    // character could be permanently reduced to a small bitmap and then
    // enlarged by the map renderer. Other/legacy characters did not go through
    // this cache, making the direct-compositor player look noticeably softer.
    const HUMANOID_CACHE_SCALE = 3;
    let humanoidSpriteCacheBuilds = 0;
    let humanoidSpriteCacheHits = 0;

    let legacyDrawPlayerCharacter = null;
    let installed = false;
    let creatorLegacy = null;
    let portraitObserver = null;
    let portraitQueued = false;
    let rendererAssetRedrawQueued = false;

    // Asset-ready callbacks can arrive together when a new facing requests a
    // body, hair and several clothing layers at once. Coalesce those callbacks
    // into one browser-frame redraw; otherwise each ready asset can synchronously
    // kick drawMap + renderEntities again and make a new-facing request look like
    // an iPhone freeze.
    function queueRendererAssetRedraw() {
        if (rendererAssetRedrawQueued) return;
        rendererAssetRedrawQueued = true;
        const flush = () => {
            rendererAssetRedrawQueued = false;
            // drawMap() already invokes renderEntities() in the normal map
            // pipeline, so do not call both here. This keeps one asset-ready event
            // to one map/entity pass.
            if (window.drawMap) window.drawMap();
            else window.renderEntities?.();
            queuePortraitRefresh();
            if (document.getElementById('appearance-preview-canvas')) {
                requestAnimationFrame(() => window.updateAppearancePreview?.());
            }
        };
        if (window.requestAnimationFrame) window.requestAnimationFrame(flush);
        else setTimeout(flush, 0);
    }

    // All five playable races and both body presentations are compositor-owned.
    // bodyAssetMode is diagnostic metadata: it makes temporary art fallbacks explicit
    // without sending those characters back through the legacy all-in-one renderer.
    const CHARACTER_RIGS = {
        human_female: { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16, bodyAssetMode:'directional' },
        human_male:   { bodyW:1.70, bodyH:2.06, yOff:-0.17, heightScale:2.06/2.16, bodyAssetMode:'directional' },
        elf_female:   { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16, bodyAssetMode:'directional' },
        elf_male:     { bodyW:2.00, bodyH:2.40, yOff:-0.20, heightScale:2.40/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        dwarf_female: { bodyW:1.60, bodyH:1.92, yOff:-0.07, heightScale:1.92/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        dwarf_male:   { bodyW:1.60, bodyH:1.92, yOff:-0.07, heightScale:1.92/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        goblin_female:{ bodyW:1.45, bodyH:1.70, yOff:-0.12, heightScale:1.70/2.16, bodyAssetMode:'shared-directional-fallback', bodyRender:'visible-fit' },
        goblin_male:  { bodyW:1.50, bodyH:1.75, yOff:-0.12, heightScale:1.75/2.16, bodyAssetMode:'directional', bodyRender:'visible-fit' },
        orc_female:   { bodyW:1.85, bodyH:2.05, yOff:-0.15, heightScale:2.05/2.16, bodyAssetMode:'directional', bodyRender:'visible-fit' },
        orc_male:     { bodyW:1.90, bodyH:2.10, yOff:-0.15, heightScale:2.10/2.16, bodyAssetMode:'shared-directional-fallback', bodyRender:'visible-fit' },
    };

    const CHARACTER_PATHS = {
        human_female: {
            body: {
                average: {
                    front:'images/characters/human_female/body_front.png',
                    side:'images/characters/human_female/body_side.png',
                    back:'images/characters/human_female/body_back.png',
                },
                broad: {
                    front:'images/characters/human_female/body_broad_front.png',
                    side:'images/characters/human_female/body_broad_side.png',
                    back:'images/characters/human_female/body_broad_back.png',
                },
            },
            hair: {
                brown_1: {
                    front:'images/characters/human_female/hair_brown_1_front.png',
                    side:'images/characters/human_female/hair_brown_1_side.png',
                    back:'images/characters/human_female/hair_brown_1_back.png',
                },
                braid: {
                    front:'images/characters/human_female/hair_braid_front.png',
                    side:'images/characters/human_female/hair_braid_side.png',
                    sideLeft:'images/characters/human_female/hair_braid_side_left.png',
                    back:'images/characters/human_female/hair_braid_back.png',
                    backRight:'images/characters/human_female/hair_braid_back_right.png',
                },
                curly: {
                    front:'images/characters/human_female/hair_curly_front.png',
                    side:'images/characters/human_female/hair_curly_side.png',
                    back:'images/characters/human_female/hair_curly_back.png',
                },
            },
        },
        elf_female: {
            body: {
                average: {
                    front:'images/characters/elf_female/body_front.png',
                    side:'images/characters/elf_female/body_side.png',
                    back:'images/characters/elf_female/body_back.png',
                },
            },
            // Elf body art is deliberately bald; hair remains a separate layer.
            hair:null,
        },
        human_male: {
            body: {
                average: {
                    front:'images/characters/human_male/body_front.png',
                    side:'images/characters/human_male/body_side.png',
                    back:'images/characters/human_male/body_back.png',
                },
                broad: {
                    front:'images/characters/human_male/body_broad_front.png',
                    side:'images/characters/human_male/body_broad_side.png',
                    back:'images/characters/human_male/body_broad_back.png',
                },
            },
            // Hair choices are shared between genders; the body rig supplies placement.
            hair:null,
        },
        elf_male: {
            body: { average: {
                // No directional elf-male body has been authored yet. All three
                // facings deliberately use the surviving flat body until that art lands.
                front:'images/characters/elf_male/body.png',
                side:'images/characters/elf_male/body.png',
                back:'images/characters/elf_male/body.png',
            } },
            hair:null,
        },
        dwarf_female: {
            body: { average: {
                front:'images/characters/dwarf_female/body.png',
                side:'images/characters/dwarf_female/body.png',
                back:'images/characters/dwarf_female/body.png',
            } },
            hair:null,
        },
        dwarf_male: {
            body: { average: {
                front:'images/characters/dwarf_male/body.png',
                side:'images/characters/dwarf_male/body.png',
                back:'images/characters/dwarf_male/body.png',
            } },
            hair:null,
        },
        goblin_female: {
            body: { average: {
                front:'images/characters/goblin_female/body_front.png',
                side:'images/characters/goblin_female/body_side.png',
                back:'images/characters/goblin_female/body_back.png',
            } },
            hair:null,
        },
        goblin_male: {
            body: { average: {
                front:'images/characters/goblin_male/body_front.png',
                side:'images/characters/goblin_male/body_side.png',
                back:'images/characters/goblin_male/body_back.png',
            } },
            hair:null,
        },
        orc_female: {
            body: { average: {
                front:'images/characters/orc_female/body_front.png',
                side:'images/characters/orc_female/body_side.png',
                back:'images/characters/orc_female/body_back.png',
            } },
            hair:null,
        },
        orc_male: {
            body: { average: {
                front:'images/characters/orc_male/body_front.png',
                side:'images/characters/orc_male/body_side.png',
                back:'images/characters/orc_male/body_back.png',
            } },
            hair:null,
        },
    };

    // Hair is an appearance layer, never a race/gender permission. Every direct
    // playable humanoid can select every registered hairstyle; NPC generation
    // remains free to weight those styles differently.
    for (const paths of Object.values(CHARACTER_PATHS)) {
        if (!paths.hair) paths.hair = CHARACTER_PATHS.human_female.hair;
    }

    // Elf-female source art has different transparent framing from the human body sheets.
    const BODY_VISIBLE_TARGETS = {
        elf_female: {
            front:{x:.14,y:.01,w:.72,h:.98},
            side: {x:.30,y:.01,w:.40,h:.98},
            back: {x:.125,y:.005,w:.75,h:.99},
        },
    };

    const DIRECTIONAL_LAYOUT = {
        front: {
            bodyCrop:{x:0.350,y:0.088,w:0.297,h:0.823}, bodyDest:{x:0,y:0,w:1,h:1},
            hairCrop:{x:0.312,y:0.221,w:0.382,h:0.387}, hairDest:{x:0.220,y:-0.015,w:0.560,h:0.370},
        },
        side: {
            bodyCrop:{x:0.431,y:0.092,w:0.148,h:0.822}, bodyDest:{x:0.250,y:0,w:0.500,h:1},
            hairCrop:{x:0.303,y:0.250,w:0.403,h:0.431}, hairDest:{x:0.305,y:-0.010,w:0.390,h:0.405},
        },
        back: {
            bodyCrop:{x:0.350,y:0.085,w:0.299,h:0.826}, bodyDest:{x:0,y:0,w:1,h:1},
            hairCrop:{x:0.338,y:0.203,w:0.323,h:0.344}, hairDest:{x:0.220,y:-0.005,w:0.560,h:0.375},
        },
    };

    // Fallback anchors for rigs that do not yet have measured reference metadata.
    // Direct humans reuse the approved human-female reference geometry when available.
    const FALLBACK_ANCHORS = {
        front:{helmetAnchor:{x:.50,y:.03},mainHandGrip:{x:.10,y:.55},offHandGrip:{x:.90,y:.55},offForearm:{x:.84,y:.44},backAnchor:{x:.50,y:.33}},
        side: {helmetAnchor:{x:.53,y:.03},mainHandGrip:{x:.56,y:.55},offHandGrip:{x:.47,y:.52},offForearm:{x:.50,y:.44},backAnchor:{x:.43,y:.33}},
        back: {helmetAnchor:{x:.50,y:.03},mainHandGrip:{x:.90,y:.55},offHandGrip:{x:.10,y:.55},offForearm:{x:.16,y:.44},backAnchor:{x:.50,y:.30}},
    };

    // Small compositor-only tuning offsets. The canonical reference rig stays a
    // measured description of the body art; these offsets describe how equipment
    // should sit on that body. Female-average is the approved baseline, and the
    // same normalised geometry is reused by female-broad and male body art.
    const HUMAN_FEMALE_EQUIPMENT_TUNING = {
        front:{
            mainHandGrip:{x:0,y:.075},
            offHandGrip:{x:0,y:.075},
            helmetAnchor:{x:0,y:-.025},
            armourY:-.010,
            heldItems:{
                // sword.png alpha>=8 trim: r=407/1024=.3974609375.
                // Deltas were calculated in pixel space, then normalised per axis.
                axe:{inward:.075,y:.061336564429012},
                sword:{inward:.098243545511295,y:.096336564429012},
                dagger:{inward:.076946127306777,y:.050334141107253},
                bow:{inward:.162968123740783,y:-.045},
            },
        },
        side:{helmetAnchor:{x:0,y:-.025},armourY:-.010},
        back:{
            helmetAnchor:{x:0,y:-.025},
            armourY:-.010,
            // Front sword is lowered by .075 at the grip plus .096336564429012
            // at the held-item layer. Match that total in back view without
            // moving the measured attachment anchor or changing other weapons.
            heldItems:{sword:{inward:0,y:.171336564429012}},
        },
    };

    const ARMOUR_TARGETS = {
        // Slightly taller than the old .225-.995 envelope: cover collarbones
        // and toes without changing the approved widths or body-shape profile.
        front:{x:.03,y:.205,w:.94,h:.810},
        side: {x:.18,y:.205,w:.64,h:.810},
        // Rear-specific art should occupy the same visible envelope as front art.
        back: {x:.03,y:.205,w:.94,h:.810},
    };

    // Optional local width shaping. Values are multipliers relative to the
    // existing rigid armour fit; vertical placement, anchors and total height
    // remain unchanged. Side view stays rigid to avoid inventing depth.
    const ARMOUR_BODY_SHAPE_PROFILES = {
        human_female:{average:{shoulders:1.00,waist:1.02,hips:1.10},broad:{shoulders:1.04,waist:1.06,hips:1.14}},
        elf_female:  {average:{shoulders:.98,waist:1.00,hips:1.05}},
        human_male:  {average:{shoulders:1.08,waist:1.00,hips:.98},broad:{shoulders:1.12,waist:1.05,hips:1.00}},
    };
    window.ARMOUR_BODY_SHAPE_PROFILES = ARMOUR_BODY_SHAPE_PROFILES;

    // Human-female nasal helm sits halfway between the pre-reduction and current
    // reduced fit. Male rendering deliberately keeps the existing target.
    const HELMET_TARGETS = {
        human_female:{x:-.1873125,y:-.015,w:.374625,h:.2183},
        elf_female:{x:-.1873125,y:-.015,w:.374625,h:.2183},
        default:{x:-.172125,y:-.015,w:.34425,h:.2006},
    };
    const SHIELD_OPAQUE_HEIGHT_DROP = .10;

    const SHIELD_PATHS = {
        round:{front:'images/equipment/shields/round.png',back:'images/equipment/shields/round_back.svg'},
        kite:{front:'images/equipment/shields/kite.png',back:'images/equipment/shields/kite_back.png'},
    };

    // Armour is renderer-owned directional art, just like shields. Front and
    // side share the canonical high-quality front PNG; back uses the matching
    // rear WebP from the same organised equipment folder.
    const ARMOUR_PATHS = {
        light:{front:'images/equipment/armour/human/light.png',back:'images/equipment/armour/human/light_back.webp'},
        medium:{front:'images/equipment/armour/human/medium.png',back:'images/equipment/armour/human/medium_back.webp'},
        heavy:{front:'images/equipment/armour/human/heavy.png',back:'images/equipment/armour/human/heavy_back.webp'},
    };

    const REAR_EQUIPMENT_PATHS = {
        helmet:'images/equipment/helmets/nasal_helm_back.svg',
    };

    const ITEM_GRIPS = {
        sword:{x:.50,y:.92}, axe:{x:.50,y:.82}, spear:{x:.50,y:.88},
        club:{x:.50,y:.84}, bow:{x:.50,y:.50}, shield:{x:.50,y:.50},
        helmet:{x:.50,y:.00},
    };

    function keyFor(entity) {
        return entity?.race && entity?.gender ? `${entity.race}_${entity.gender}` : '';
    }

    function equipmentSlotVisible(entity, slot) {
        return window.equipmentAppearanceSystem?.isSlotVisible?.(entity, slot) !== false;
    }

    function usesApprovedHumanEquipmentBaseline(entity) {
        const key = keyFor(entity);
        return key === 'human_female' || key === 'human_male' || key === 'elf_female';
    }

    function canDirectRender(entity) {
        return !!CHARACTER_RIGS[keyFor(entity)] && !entity?.customImage;
    }

    function recordMapHumanoidBoundary(entity) {
        rendererDebugSummary.mapBranches++;
        recordHumanoidFlashTrace('map-boundary', entity, {
            canDirectRender: canDirectRender(entity),
            customImage: !!entity?.customImage,
        });
        const canRender = canDirectRender(entity);
        if (canRender) rendererDebugSummary.mapCalls++;
        window.__humanoidRendererLastMapBoundary = {
            entityName: entity?.name || entity?.id || null,
            race: entity?.race || null,
            gender: entity?.gender || null,
            customImage: !!entity?.customImage,
            facing: VALID_FACINGS.has(entity?.facing) ? entity.facing : 'down',
            view: facingToView(VALID_FACINGS.has(entity?.facing) ? entity.facing : 'down'),
            canDirectRender: canRender,
            timestamp: Date.now(),
        };
        return canRender;
    }

    function facingToView(facing) {
        if (facing === 'up') return 'back';
        if (facing === 'left' || facing === 'right') return 'side';
        return 'front';
    }

    function imageReady(image) {
        return !!image && ((image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
            || (image.width > 0 && image.height > 0));
    }

    function loadImage(src) {
        if (!src) return null;
        // Directional presentation extensions may temporarily supply an already
        // prepared Image/Canvas (for example the asymmetric left braid). These
        // are drawable sources, not asset-manager paths. Never stringify them
        // into a bogus request such as "[object HTMLImageElement]".
        if (typeof src !== 'string') {
            return src;
        }
        const canonical = window.assetManager?.canonicalPathFor?.(src) || src;
        if (activeSourcePaths) activeSourcePaths.add(canonical);
        const image = window.assetManager.request(canonical);
        if (!rendererPendingLoads.has(canonical) && !imageReady(image)) {
            rendererPendingLoads.add(canonical);
            window.assetManager.whenReady(canonical).then(() => {
                rendererPendingLoads.delete(canonical);
                queueRendererAssetRedraw();
            }).catch((error) => {
                rendererPendingLoads.delete(canonical);
                console.warn('Humanoid renderer art failed to load:', canonical, error);
            });
        }
        return image;
    }

    // These structures contain source paths, not retained Image objects.
    function loadSet(paths) {
        return {
            body:Object.fromEntries(Object.entries(paths.body).map(([bodyType, views]) => [
                bodyType,
                Object.fromEntries(Object.entries(views).map(([view, src]) => [view, src])),
            ])),
            hair:Object.fromEntries(Object.entries(paths.hair || {}).map(([style, views]) => [
                style,
                Object.fromEntries(Object.entries(views).map(([view, src]) => [view, src])),
            ])),
        };
    }

    const CHARACTER_ASSETS = Object.fromEntries(Object.entries(CHARACTER_PATHS)
        .map(([key, paths]) => [key, loadSet(paths)]));
    const SHIELD_ASSETS = Object.fromEntries(Object.entries(SHIELD_PATHS)
        .map(([visual, paths]) => [visual, {front:paths.front, back:paths.back}]));
    const ARMOUR_ASSETS = Object.fromEntries(Object.entries(ARMOUR_PATHS)
        .map(([tier, paths]) => [tier, {front:paths.front, back:paths.back}]));
    const REAR_EQUIPMENT_ASSETS = {
        shield:SHIELD_ASSETS.round.back,
        helmet:REAR_EQUIPMENT_PATHS.helmet,
        armour:Object.fromEntries(Object.entries(ARMOUR_ASSETS)
            .map(([tier, views]) => [tier, views.back])),
    };

    function facingFromHexDelta(dq, dr) {
        if (!dq && !dr) return null;
        const dx = 1.5 * dq;
        const dy = Math.sqrt(3) * (dr + dq / 2);
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    function setEntityFacing(entity, facing) {
        if (!entity || !VALID_FACINGS.has(facing)) return false;
        if (entity.facing === facing) return false;
        entity.facing = facing;
        if (entity.riding && entity.riding.facing !== facing) entity.riding.facing = facing;
        if (entity.rider && entity.rider.facing !== facing) entity.rider.facing = facing;
        return true;
    }

    function updateFacingFromMovement() {
        for (const entity of window.entities || []) {
            if (!entity?.hex) continue;
            const old = previousHex.get(entity);
            if (!old) {
                previousHex.set(entity, {q:entity.hex.q,r:entity.hex.r});
                if (!VALID_FACINGS.has(entity.facing)) entity.facing = 'down';
                continue;
            }
            const dq = entity.hex.q - old.q;
            const dr = entity.hex.r - old.r;
            if (dq || dr) {
                const facing = facingFromHexDelta(dq, dr);
                if (facing) setEntityFacing(entity, facing);
                old.q = entity.hex.q;
                old.r = entity.hex.r;
            }
        }
    }

    function drawCropped(ctx, image, crop, dest, bounds) {
        if (!imageReady(image)) return false;
        const iw = image.naturalWidth || image.width;
        const ih = image.naturalHeight || image.height;
        const sx = crop.x * iw, sy = crop.y * ih, sw = crop.w * iw, sh = crop.h * ih;
        const dx = bounds.left + dest.x * bounds.width;
        const dy = bounds.top + dest.y * bounds.height;
        const dw = dest.w * bounds.width;
        const dh = dest.h * bounds.height;
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        return true;
    }

    function ensureAppearance(entity) {
        if (entity.skinHue === undefined) {
            const tone = window.pickNaturalSkinTone?.(`${entity.name || 'x'}_skin`);
            entity.skinHue = tone?.hue ?? 20;
            entity.skinSaturation = tone?.saturation;
            entity.skinLightness = tone?.lightness;
        }
        if (entity.hairHue === undefined) entity.hairHue = 25;
    }

    function resolvedBodyImage(entity, source) {
        ensureAppearance(entity);
        return window.getRecoloredSkinSprite
            ? window.getRecoloredSkinSprite(source, {hue:entity.skinHue,saturation:entity.skinSaturation,lightness:entity.skinLightness})
            : source;
    }

    function resolvedHairImage(entity, source) {
        if (!source) return null;
        return entity.hairHue !== undefined && window.getRecoloredCharacterHairSprite
            ? window.getRecoloredCharacterHairSprite(source, entity.hairHue, entity.hairLightMult || 1, entity.hairSatMult || 1)
            : source;
    }

    // Asymmetry is an input to the normal compositor, not a second renderer.
    function mirroredHairSource(image) {
        if (!imageReady(image)) return null;
        if (mirroredHairSources.has(image)) return mirroredHairSources.get(image);
        const w = image.naturalWidth || image.width;
        const h = image.naturalHeight || image.height;
        if (!w || !h) return null;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const mirrorCtx = canvas.getContext('2d');
        if (!mirrorCtx) return null;
        mirrorCtx.translate(w, 0);
        mirrorCtx.scale(-1, 1);
        mirrorCtx.drawImage(image, 0, 0);
        mirroredHairSources.set(image, canvas);
        return canvas;
    }

    function resolveDirectionalHair(entity, hairSet, view, facing) {
        const asymmetricPath = view === 'side' && facing === 'left'
            ? hairSet?.sideLeft
            : view === 'back'
                ? hairSet?.back
                : hairSet?.[view];
        const path = asymmetricPath || hairSet?.[view] || hairSet?.front;
        const source = path ? loadImage(path) : null;
        const recoloured = resolvedHairImage(entity, source);
        const needsMirror = view === 'side' && facing === 'left' && !!hairSet?.sideLeft;
        return {
            path: path || null,
            source,
            image: needsMirror ? mirroredHairSource(recoloured) : recoloured,
            asymmetric: needsMirror || (view === 'back' && !!hairSet?.backRight),
        };
    }

    function alphaTrim(image) {
        if (!image) return null;
        if (trimCache.has(image)) return trimCache.get(image);
        let trim = null;
        try { trim = window.suggestSpriteAlphaTrim?.(image, 8) || null; } catch (_) {}
        if (!trim) {
            const w = image.naturalWidth || image.width || 1;
            const h = image.naturalHeight || image.height || 1;
            trim = {originalWidth:w,originalHeight:h,trimLeft:0,trimTop:0,trimWidth:w,trimHeight:h};
        }
        trimCache.set(image, trim);
        return trim;
    }

    function frontHairOpaqueWidthFraction(frontImage) {
        const layout = DIRECTIONAL_LAYOUT.front;
        if (!layout || !imageReady(frontImage)) return layout?.hairDest?.w || .56;
        const trim = alphaTrim(frontImage);
        const iw = frontImage.naturalWidth || frontImage.width || 1;
        const cropLeft = layout.hairCrop.x * iw;
        const cropRight = (layout.hairCrop.x + layout.hairCrop.w) * iw;
        const trimLeft = trim.trimLeft;
        const trimRight = trim.trimLeft + trim.trimWidth;
        const visibleOpaque = Math.max(0, Math.min(trimRight, cropRight) - Math.max(trimLeft, cropLeft));
        const cropWidth = Math.max(1, layout.hairCrop.w * iw);
        return visibleOpaque ? layout.hairDest.w * (visibleOpaque / cropWidth) : layout.hairDest.w;
    }

    function tightDirectionalHairDestination(image, view, frontImage) {
        if (!imageReady(image)) return null;
        const trim = alphaTrim(image);
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        const opaqueFraction = Math.max(.01, trim.trimWidth / iw);
        const wantedOpaqueWidth = frontHairOpaqueWidthFraction(frontImage);
        const w = wantedOpaqueWidth / opaqueFraction;
        const sourceAspect = iw / ih;
        const h = w * HUMAN_RENDER_ASPECT / Math.max(.01, sourceAspect);
        return {x:.5-w/2,y:view === 'back' ? -.005 : -.010,w,h};
    }

    function drawVisibleFit(ctx, image, bounds, target) {
        if (!imageReady(image)) return false;
        const trim = alphaTrim(image);
        if (!trim?.trimWidth || !trim?.trimHeight) return false;
        const targetLeft = bounds.left + target.x * bounds.width;
        const targetTop = bounds.top + target.y * bounds.height;
        const targetWidth = target.w * bounds.width;
        const targetHeight = target.h * bounds.height;
        const sx = targetWidth / trim.trimWidth;
        const sy = targetHeight / trim.trimHeight;
        const outerW = trim.originalWidth * sx;
        const outerH = trim.originalHeight * sy;
        const dx = targetLeft - trim.trimLeft * sx;
        const dy = targetTop - trim.trimTop * sy;
        ctx.drawImage(image, dx, dy, outerW, outerH);
        return {dx,dy,width:outerW,height:outerH,target:{left:targetLeft,top:targetTop,width:targetWidth,height:targetHeight}};
    }

    function rearPreferred(view, rearImage, fallback) {
        return view === 'back' && imageReady(rearImage) ? rearImage : fallback;
    }

    function armourImage(entity, view) {
        const id = entity.equipped?.armor;
        if (!id) return null;
        const item = window.items?.[id];
        const reduction = Number(item?.reduction || 0);
        const tier = reduction >= 3 ? 'heavy' : reduction >= 2 ? 'medium' : 'light';
        const authoredPath = view === 'back' ? ARMOUR_ASSETS[tier]?.back : ARMOUR_ASSETS[tier]?.front;
        const image = authoredPath ? loadImage(authoredPath) : null;
        // The organised directional armour assets are authoritative. There is
        // deliberately no legacy fallback: asking for armour should only ever
        // initialise the armour asset actually being rendered.
        if (entity.goldGear && window.getGoldTintedSprite) image = window.getGoldTintedSprite(image) || image;
        return image;
    }

    function helmetImage(entity, view) {
        if (!entity.equipped?.helmet) return null;
        const helmetSource = REAR_EQUIPMENT_ASSETS.helmet ? loadImage(REAR_EQUIPMENT_ASSETS.helmet) : null;
        let image = rearPreferred(view, helmetSource, window.gameVisuals?.nasal_helm || null);
        if (image && entity.goldGear && window.getGoldTintedSprite) image = window.getGoldTintedSprite(image) || image;
        return image;
    }

    function weaponSpec(id) {
        if (!id || window.items?.[id]?.type !== 'weapon') return null;
        const visuals = window.gameVisuals || {};
        const lower = String(id).toLowerCase();
        if (lower.includes('bow')) return {image:visuals.bow,kind:'bow',scale:1.05};
        if (lower.includes('spear')) return {image:visuals.spear,kind:'spear',scale:1.08};
        if (lower.includes('axe') || lower.includes('pickaxe')) return {image:visuals.axe,kind:'axe',scale:1};
        if (lower.includes('club') || lower.includes('chair')) return {image:visuals.club,kind:'club',scale:1};
        if (lower.includes('dagger')) return {image:visuals.swordIcon,kind:'dagger',scale:.75};
        if (lower.includes('sword')) return {image:visuals.swordIcon,kind:'sword',scale:1};
        return null;
    }

    function slotSpec(entity, slot, view) {
        const id = slot === 'main' ? entity.equipped?.weapon : entity.equipped?.offhand;
        if (!id) return null;
        const item = window.items?.[id];
        if (item?.type === 'shield') {
            const shieldSet = SHIELD_ASSETS[item.shieldVisual] || SHIELD_ASSETS.round;
            const frontSource = shieldSet?.front ? loadImage(shieldSet.front) : null;
            const backSource = shieldSet?.back ? loadImage(shieldSet.back) : null;
            const front = imageReady(frontSource) ? frontSource : window.gameVisuals?.shield;
            return {image:rearPreferred(view, backSource, front),kind:'shield',scale:.73,itemId:id};
        }
        const spec = weaponSpec(id);
        return spec ? {...spec,itemId:id} : null;
    }

    function anchorsFor(entity, view) {
        if (usesApprovedHumanEquipmentBaseline(entity)) {
            const measured = window.HUMAN_FEMALE_REFERENCE_RIGS?.[view]?.anchors;
            if (measured) return measured;
        }
        return FALLBACK_ANCHORS[view];
    }

    function tunedAnchor(entity, view, anchorName) {
        const anchors = anchorsFor(entity, view);
        const base = anchors?.[anchorName] || FALLBACK_ANCHORS[view][anchorName];
        if (!base) return null;
        if (!usesApprovedHumanEquipmentBaseline(entity)) return base;
        const delta = HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.[anchorName];
        if (!delta) return base;
        return {x:base.x + (delta.x || 0), y:base.y + (delta.y || 0)};
    }

    function tunedHeldItemAnchor(entity, view, anchorName, slot, kind) {
        const base = tunedAnchor(entity, view, anchorName);
        if (!base || !usesApprovedHumanEquipmentBaseline(entity)) return base;
        const tuning = HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.heldItems?.[kind];
        if (!tuning) return base;
        const side = slot === 'off' ? -1 : 1;
        return {
            x:base.x + side * (tuning.inward || 0),
            y:base.y + (tuning.y || 0),
        };
    }

    function point(bounds, p) {
        return {x:bounds.left+p.x*bounds.width,y:bounds.top+p.y*bounds.height};
    }

    function traceWeaponRender(detail) {
        const trace = window.__weaponRenderTrace || (window.__weaponRenderTrace = []);
        trace.push({...detail, timestamp:Date.now()});
        if (trace.length > 120) trace.splice(0, trace.length - 120);
    }

    function drawHeldItem(ctx, entity, view, visualBounds, slot, expectedLayer='any') {
        const equipmentSlot = slot === 'main' ? 'weapon' : 'offhand';
        if (!equipmentSlotVisible(entity, equipmentSlot)) return false;
        const spec = slotSpec(entity, slot, view);
        if (!spec) return false;
        const image = spec.kind === 'shield' ? spec.image : (window.equipmentAppearanceSystem?.resolveWeaponImage?.(entity, spec.itemId, spec.image, spec.kind) || spec.image);
        if (!imageReady(image)) return false;
        if (expectedLayer === 'shield' && spec.kind !== 'shield') return false;
        if (expectedLayer === 'weapon' && spec.kind === 'shield') return false;
        const anchorName = spec.kind === 'shield' ? 'offForearm' : (slot === 'main' ? 'mainHandGrip' : 'offHandGrip');
        const anchorPoint = spec.kind === 'shield'
            ? tunedAnchor(entity, view, anchorName)
            : tunedHeldItemAnchor(entity, view, anchorName, slot, spec.kind);
        if (!anchorPoint) return false;
        const anchor = point(bounds, anchorPoint);
        const grip = ITEM_GRIPS[spec.kind] || ITEM_GRIPS.sword;
        let drawWidth, drawHeight;
        if (spec.kind === 'shield') {
            // Shield art is not required to live on a square canvas. Treat the
            // configured scale as its displayed height and preserve the authored
            // aspect ratio so tightly cropped kite/tower shields stay narrow.
            drawHeight = bounds.width * spec.scale;
            const imageWidth = image.naturalWidth || image.width || 1;
            const imageHeight = image.naturalHeight || image.height || 1;
            drawWidth = drawHeight * imageWidth / imageHeight;
        } else {
            // Derive held-item size from the compositor bounds rather than the
            // world camera. World rendering is unchanged because those bounds
            // are themselves built from hexSize*z, while 100px initiative
            // portraits now scale weapons down with the character.
            const rig = CHARACTER_RIGS[keyFor(entity)];
            const bodyHeightUnits = rig?.bodyH || 1;
            const basePixel = bounds.height / bodyHeightUnits;
            drawHeight = basePixel * (rig?.heightScale || 1) * spec.scale;
            drawWidth = drawHeight;
        }

        let itemY = anchor.y - grip.y*drawHeight;
        if (spec.kind === 'shield') {
            const trim = alphaTrim(image);
            const opaqueHeight = trim?.trimHeight && trim?.originalHeight
                ? drawHeight * trim.trimHeight / trim.originalHeight
                : drawHeight;
            itemY += opaqueHeight * SHIELD_OPAQUE_HEIGHT_DROP;
        }

        const mirrorOffhandWeapon = slot === 'off' && spec.kind !== 'shield';
        if (mirrorOffhandWeapon) {
            // Mirror around the grip itself: the hilt stays on the off-hand anchor
            // while the weapon points the opposite way to the main-hand copy.
            ctx.save();
            ctx.translate(anchor.x, anchor.y);
            ctx.scale(-1, 1);
            ctx.drawImage(image, -grip.x*drawWidth, -grip.y*drawHeight, drawWidth, drawHeight);
            ctx.restore();
        } else {
            ctx.drawImage(image, anchor.x - grip.x*drawWidth, itemY, drawWidth, drawHeight);
        }
        if (spec.kind !== 'shield') traceWeaponRender({source:'humanoid-held',kind:spec.kind,itemId:spec.itemId,slot,view,boundsHeight:bounds.height,drawWidth,drawHeight,bodyRatio:drawHeight/Math.max(1,bounds.height),imageWidth:image.naturalWidth||image.width||0,imageHeight:image.naturalHeight||image.height||0});
        return true;
    }

    function drawHelmet(ctx, entity, view, visualBounds) {
        const image = helmetImage(entity, view);
        if (!imageReady(image)) return false;
        const anchorPoint = tunedAnchor(entity, view, 'helmetAnchor');
        if (!anchorPoint) return false;
        const anchor = point(bounds, anchorPoint);
        const helmetTarget = HELMET_TARGETS[keyFor(entity)] || HELMET_TARGETS.default;
        const target = {
            x:(anchor.x-bounds.left)/bounds.width + helmetTarget.x,
            y:(anchor.y-bounds.top)/bounds.height + helmetTarget.y,
            w:helmetTarget.w,
            h:helmetTarget.h,
        };
        return !!drawVisibleFit(ctx, image, bounds, target);
    }

    function armourWidthAt(profile, t) {
        const shoulderY=.18, waistY=.53, hipY=.84;
        const lerp=(a,b,u)=>a+(b-a)*Math.max(0,Math.min(1,u));
        if(t<=waistY) return lerp(profile.shoulders,profile.waist,(t-shoulderY)/(waistY-shoulderY));
        return lerp(profile.waist,profile.hips,(t-waistY)/(hipY-waistY));
    }

    function armourShapeProfile(entity, view) {
        if(view==='side') return null;
        const byBody=ARMOUR_BODY_SHAPE_PROFILES[keyFor(entity)];
        if(!byBody) return null;
        return entity.armourBodyShape || byBody[entity.bodyType || 'average'] || byBody.average || null;
    }

    function drawShapedArmourFit(ctx, image, bounds, target, profile) {
        if(!profile) return drawVisibleFit(ctx,image,bounds,target);
        const trim=alphaTrim(image);
        if(!trim?.trimWidth || !trim?.trimHeight) return false;
        const iw=image.naturalWidth||image.width, ih=image.naturalHeight||image.height;
        const targetLeft=bounds.left+target.x*bounds.width;
        const targetTop=bounds.top+target.y*bounds.height;
        const targetWidth=target.w*bounds.width;
        const targetHeight=target.h*bounds.height;
        const scaleX=targetWidth/trim.trimWidth, scaleY=targetHeight/trim.trimHeight;
        const outerW=iw*scaleX, outerH=ih*scaleY;
        const dx=targetLeft-trim.trimLeft*scaleX, dy=targetTop-trim.trimTop*scaleY;
        const cx=dx+outerW/2;
        const strips=32;
        for(let i=0;i<strips;i++){
            const sy=Math.floor(i*ih/strips), sy2=Math.ceil((i+1)*ih/strips), sh=Math.max(1,sy2-sy);
            const sourceMid=sy+sh/2;
            const t=Math.max(0,Math.min(1,(sourceMid-trim.trimTop)/trim.trimHeight));
            const widthScale=armourWidthAt(profile,t);
            const dw=outerW*widthScale;
            const destY=dy+(sy/ih)*outerH;
            const destH=(sh/ih)*outerH+.35;
            ctx.drawImage(image,0,sy,iw,sh,cx-dw/2,destY,dw,destH);
        }
        return {dx,dy,width:outerW,height:outerH,target:{left:targetLeft,top:targetTop,width:targetWidth,height:targetHeight},shapeProfile:{...profile}};
    }

    function drawArmour(ctx, entity, view, visualBounds) {
        const image = armourImage(entity, view);
        if (!imageReady(image)) return false;
        const baseTarget = ARMOUR_TARGETS[view] || ARMOUR_TARGETS.front;
        const armourY = usesApprovedHumanEquipmentBaseline(entity)
            ? (HUMAN_FEMALE_EQUIPMENT_TUNING[view]?.armourY || 0)
            : 0;
        const target = armourY ? {...baseTarget,y:baseTarget.y+armourY} : baseTarget;
        const profile=armourShapeProfile(entity,view);
        const placement = drawShapedArmourFit(ctx, image, bounds, target, profile);
        if (placement) {
            window.__humanoidRendererLastArmour = {
                entity, view, ...placement,
                compositionSource:profile?'direct-horizontal-strip-width-profile':'direct-axis-aligned-scale-translate',
                rotation:0, shear:false,
            };
        }
        return !!placement;
    }

    function drawDirectionalHumanoidInBounds(ctx, entity, bounds, facing='down') {
        if (!ctx || !entity || !bounds || !canDirectRender(entity)) return false;
        let compositionComplete = true;
        const key = keyFor(entity);
        const view = facingToView(facing);
        const set = CHARACTER_ASSETS[key];
        const bodyType = entity.bodyType || 'average';
        // Establish the deterministic outfit, then let drawSlot request only
        // the layers actually needed for this visible character/facing.
        window.clothingSystem?.ensureDefaultOutfit?.(entity,{player:entity.side==='player'});
        if (activeSourcePaths) {
            for (const path of window.clothingSystem?.resolveOutfitAssetPaths?.(entity,[view]) || []) {
                const canonical = window.assetManager?.canonicalPathFor?.(path) || path;
                activeSourcePaths.add(canonical);
                // Register every required clothing layer with the asset manager
                // before attempting the body. The old path-only bookkeeping meant
                // that an unavailable body could return early before drawSlot()
                // ever requested the clothing assets, leaving the composite with
                // a catalogued-but-never-started outfit stack.
                loadImage(canonical);
            }
        }
        const sourceBodyPath = (set?.body?.[bodyType] || set?.body?.average)?.[view];
        const sourceBody = sourceBodyPath ? loadImage(sourceBodyPath) : null;
        // A direct body image can be temporarily unavailable or permanently broken.
        // Do not claim an empty frame: decline it so the established renderer can
        // draw the character while the direct asset loads or recovers.
        if (!imageReady(sourceBody)) return false;

        const layout = DIRECTIONAL_LAYOUT[view];
        const hairStyle = entity.hairStyle || 'brown_1';
        const hairSet = set?.hair?.[hairStyle] || set?.hair?.brown_1;
        const hairSelection = resolveDirectionalHair(entity, hairSet || {}, view, facing);
        const sourceHairPath = hairSelection.path;
        const sourceHair = hairSelection.source;
        const bodyImage = resolvedBodyImage(entity, sourceBody);
        const hairImage = hairSelection.image;
        const hasHelmet = !!entity.equipped?.helmet && equipmentSlotVisible(entity,'helmet');
        window.clothingSystem?.migrateLegacyEquipment?.(entity);
        const mirror = facing === 'left';
        const cx = bounds.left + bounds.width/2;
        const layerOrder = [];
        const layerDiagnostics = [];

        const drawShieldLayer = () => {
            let shieldDrawn = false;
            shieldDrawn = drawHeldItem(ctx, entity, view, bounds, 'off', 'shield') || shieldDrawn;
            shieldDrawn = drawHeldItem(ctx, entity, view, bounds, 'main', 'shield') || shieldDrawn;
            if (shieldDrawn) layerOrder.push('shield');
        };

        const drawWeaponLayer = () => {
            let weaponDrawn = false;
            weaponDrawn = drawHeldItem(ctx, entity, view, bounds, 'main', 'weapon') || weaponDrawn;
            weaponDrawn = drawHeldItem(ctx, entity, view, bounds, 'off', 'weapon') || weaponDrawn;
            if (weaponDrawn) layerOrder.push('weapons');
        };

        ctx.save();
        if (mirror) {
            ctx.translate(cx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-cx, 0);
        }
        try {
            // Shield depth depends on the actual facing, not just the authored
            // front/side/back sprite view. Front + left expose the shield arm;
            // back + right put the shield behind the body/armour. Weapons retain
            // the existing rear-behind / front-and-side-foreground behaviour.
            const shieldBehindBody = view === 'back' || facing === 'right';
            if (shieldBehindBody) drawShieldLayer();
            if (view === 'back') drawWeaponLayer();

            const bodySource = imageReady(bodyImage) ? bodyImage : sourceBody;
            const bodyTarget = BODY_VISIBLE_TARGETS[key]?.[view];
            const useVisibleBodyFit = !!bodyTarget || CHARACTER_RIGS[key]?.bodyRender === 'visible-fit';
            const visualBounds = normalisedBodyBounds(
                bounds, bodySource, view, bodyTarget || {x:0,y:0,w:1,h:1}, useVisibleBodyFit
            );
            // Human directional sheets retain their measured crop. Rigs whose
            // source framing differs (and temporary one-view fallbacks) alpha-trim
            // then fit the visible body to the compositor bounds instead of forcing
            // them through human-specific crop coordinates.
            const bodyDrawn = useVisibleBodyFit
                ? !!drawVisibleFit(ctx, bodySource, visualBounds, bodyTarget || {x:0,y:0,w:1,h:1})
                : drawCropped(ctx, bodySource, layout.bodyCrop, layout.bodyDest, visualBounds);
            const clothingFit = clothingFitReference(
                bodySource, view, visualBounds, useVisibleBodyFit,
                bodyTarget || {x:0,y:0,w:1,h:1}
            );
            if (bodyDrawn) layerOrder.push('body');
            for (const slot of ['underwear','bra','pants','shirt','shoes']) {
                const expected = entity.displayClothes !== false
                    && !!entity.equipped?.[slot]
                    && equipmentSlotVisible(entity, slot);
                const drawn = window.clothingSystem?.drawSlot?.(ctx, entity, slot, view, visualBounds, clothingFit) || false;
                const slotDiagnostics = Array.isArray(window.__clothingRendererLastDrawDiagnostics)
                    ? window.__clothingRendererLastDrawDiagnostics.map(item => ({...item, expected}))
                    : [{slot,view,itemId:entity.equipped?.[slot]||null,expected,drawn,reason:'no-slot-diagnostics'}];
                layerDiagnostics.push(...slotDiagnostics);
                if (drawn) layerOrder.push(slot);
                if (expected && !drawn) compositionComplete = false;
            }
            const armourExpected = entity.displayArmour !== false
                && equipmentSlotVisible(entity,'armor')
                && !!entity.equipped?.armor;
            const armourDrawn = armourExpected ? drawArmour(ctx, entity, view, bounds) : false;
            if (armourDrawn) layerOrder.push('armour');
            if (armourExpected && !armourDrawn) compositionComplete = false;
            if (typeof window.drawFacialHairLayer === 'function' && window.drawFacialHairLayer(ctx,entity,view,visualBounds)) layerOrder.push('facialHair');
            if (!hasHelmet && (!hairImage || !imageReady(hairImage))) compositionComplete = false;
            if (!hasHelmet && imageReady(hairImage)) {
                const tightDirectional = !!hairSelection.asymmetric && view !== 'front';
                const tightDest = tightDirectional
                    ? tightDirectionalHairDestination(sourceHair, view, hairSet?.front)
                    : null;
                const hairCrop = tightDest ? {x:0,y:0,w:1,h:1} : layout.hairCrop;
                const baseHairDest = tightDest || layout.hairDest;
                // Reduce all rendered hair assets uniformly by 15%, keeping the
                // destination centred so front, side and back views stay aligned.
                const hairDest = {
                    x:baseHairDest.x + baseHairDest.w * 0.075,
                    y:baseHairDest.y + baseHairDest.h * 0.075,
                    w:baseHairDest.w * 0.85,
                    h:baseHairDest.h * 0.85,
                };
                const hairDrawn = tightDest
                    ? drawCropped(ctx, hairImage, hairCrop, hairDest, visualBounds)
                    : drawVisibleFit(ctx, hairImage, visualBounds, {
                        x:hairDest.x,
                        y:-0.015 + 0.47 * 0.075,
                        w:hairDest.w,
                        h:0.47 * 0.85,
                    });
                if (hairDrawn) layerOrder.push('hair');
                if (!hairDrawn) compositionComplete = false;
                window.__humanoidRendererLastHair = {
                    style:hairStyle,
                    view,
                    tightDirectional:!!tightDest,
                    crop:{...hairCrop},
                    dest:{...hairDest},
                    sourceWidth:sourceHair?.naturalWidth || sourceHair?.width || 0,
                    sourceHeight:sourceHair?.naturalHeight || sourceHair?.height || 0,
                    drew:!!hairDrawn,
                };
            } else if (hasHelmet) {
                const helmetDrawn = drawHelmet(ctx, entity, view, bounds);
                if (helmetDrawn) layerOrder.push('helmet');
                if (!helmetDrawn) compositionComplete = false;
            }

            if (!shieldBehindBody) drawShieldLayer();
            if (view !== 'back') drawWeaponLayer();

            // A selected/visible weapon or shield is part of the requested
            // character appearance. If neither held-item pass managed to draw it,
            // keep this frame out of the composite cache so a transient asset load
            // can recover on the next render instead of becoming permanent.
            for (const slot of ['main','off']) {
                const equipmentSlot = slot === 'main' ? 'weapon' : 'offhand';
                const id = slot === 'main' ? entity.equipped?.weapon : entity.equipped?.offhand;
                if (!id || !equipmentSlotVisible(entity, equipmentSlot)) continue;
                const spec = slotSpec(entity, slot, view);
                if (!spec) continue;
                const expectedLayer = spec.kind === 'shield' ? 'shield' : 'weapons';
                if (!layerOrder.includes(expectedLayer)) compositionComplete = false;
            }
        } finally {
            ctx.restore();
        }

        const hairDiagnostics = {
            style:hairStyle,
            view,
            source:sourceHairPath||null,
            status:sourceHairPath?(window.assetManager?.status?.(sourceHairPath)||'unrequested'):'missing-source',
            imageComplete:!!hairImage?.complete,
            naturalWidth:sourceHair?.naturalWidth||0,
            naturalHeight:sourceHair?.naturalHeight||0,
            drawn:layerOrder.includes('hair'),
            expected:!hasHelmet,
        };
        window.__humanoidRendererLastLayerOrder = layerOrder;
        window.__humanoidRendererLastLayerDiagnostics = layerDiagnostics;
        window.__humanoidRendererLastHairDiagnostics = hairDiagnostics;
        window.__humanoidRendererLastComplete = compositionComplete;
        window.__humanoidRendererLastDraw = {entity,key,view,facing,bounds:{...bounds},timestamp:Date.now()};
        window.__humanoidRendererDrawCount = (window.__humanoidRendererDrawCount || 0) + 1;
        return true;
    }

    function safeAppearanceKey(entity) {
        try {
            return JSON.stringify({
                race:entity.race, gender:entity.gender, bodyType:entity.bodyType,
                hairStyle:entity.hairStyle, hairHue:entity.hairHue,
                hairLightMult:entity.hairLightMult, hairSatMult:entity.hairSatMult,
                skinHue:entity.skinHue, skinSaturation:entity.skinSaturation, skinLightness:entity.skinLightness,
                equipped:entity.equipped, equippedInstances:entity.equippedInstances, clothingColors:entity.clothingColors,
                displayArmour:entity.displayArmour, displayClothes:entity.displayClothes,
                goldGear:entity.goldGear, equipmentAppearance:entity.equipmentAppearance,
            });
        } catch (_) {
            return String(entity?.name || 'humanoid');
        }
    }

    function appearanceCacheKey(entity) {
        return safeAppearanceKey(entity);
    }

    function spriteCacheKey(entity, facing) {
        // The composite identity is appearance + facing. The actual cache is
        // grouped by appearance so all four views of a character stay together.
        return [appearanceCacheKey(entity), facing].join('::');
    }

    function cacheGet(appearanceKey, facing) {
        const group = humanoidSpriteCache.get(appearanceKey);
        const value = group?.get(facing);
        if (!value) return null;
        // Touch the character group and the individual view. Map and portrait
        // deliberately receive the exact same cached canvas object.
        humanoidSpriteCache.delete(appearanceKey);
        humanoidSpriteCache.set(appearanceKey, group);
        group.delete(facing);
        group.set(facing, value);
        humanoidSpriteCacheHits++;
        return value;
    }

    function cachePut(appearanceKey, facing, canvas) {
        let group = humanoidSpriteCache.get(appearanceKey);
        if (!group) group = new Map();
        group.delete(facing);
        const entry = {canvas, compositeId: nextHumanoidCompositeId++};
        group.set(facing, entry);
        humanoidSpriteCache.delete(appearanceKey);
        humanoidSpriteCache.set(appearanceKey, group);
        while (humanoidSpriteCache.size > MAX_HUMANOID_CACHED_CHARACTERS) {
            humanoidSpriteCache.delete(humanoidSpriteCache.keys().next().value);
        }
        return entry;
    }

    function clearHumanoidSpriteCache() {
        humanoidSpriteCache.clear();
        pendingCompositeRequests.clear();
        lastRequestedFacing.clear?.();
    }

    function abandonStaleCompositeRequests(entity, facing, currentKey) {
        const previousFacing = lastRequestedFacing.get(entity);
        lastRequestedFacing.set(entity, facing);
        if (!previousFacing || previousFacing === facing) return;

        // The character has turned. Any failed request for its old facing is no
        // longer useful; in particular, do not keep hammering a failed front
        // composite after the character has turned sideways/backwards.
        for (const [key, request] of pendingCompositeRequests) {
            if (request.entity === entity && key !== currentKey) {
                pendingCompositeRequests.delete(key);
            }
        }
    }

    function drawHumanoidCharacter(ctx, entity, x, y, z=1, flyOff=0, explicitBounds=null, explicitFacing=null, renderSurface='map') {
        if (!canDirectRender(entity)) return false;
        const physicalEntity = entity;
        entity = window.disguiseSelfSystem?.getRenderEntity?.(entity) || entity;
        const rig = CHARACTER_RIGS[keyFor(entity)];
        const hs = window.hexSize || 1;
        const legacyW = rig.bodyW * hs * z;
        const legacyH = rig.bodyH * hs * z;
        const legacyTop = y - legacyW/2 + rig.yOff*hs*z + (flyOff || 0);
        const visualW = legacyH * HUMAN_RENDER_ASPECT;
        const bounds = explicitBounds || {left:x-visualW/2,top:legacyTop,width:visualW,height:legacyH};
        const facing = explicitFacing || (VALID_FACINGS.has(entity.facing) ? entity.facing : 'down');
        const appearanceKey = appearanceCacheKey(entity);
        const key = spriteCacheKey(entity, facing);
        rendererDebugRecord({
            entityName:entity.name || entity.id || null,
            race:entity.race || null,
            gender:entity.gender || null,
            surface:renderSurface,
            requestedFacing:explicitFacing || null,
            entityFacing:entity.facing || null,
            facing,
            view:facingToView(facing),
            key,
            result:'started',
        });
        abandonStaleCompositeRequests(entity, facing, key);

        recordHumanoidFlashTrace('render-start', entity, { appearanceKey, key, facing, surface: renderSurface });
        const cached = cacheGet(appearanceKey, facing);
        if (cached) {
            pendingCompositeRequests.delete(key);
            window.__humanoidRendererLastComplete = true;
            window.__humanoidRendererLastDraw = {entity,key,view:facingToView(facing),facing,bounds:{...bounds},timestamp:Date.now(),fromCache:true};
            ctx.drawImage(cached.canvas, bounds.left, bounds.top, bounds.width, bounds.height);
            rendererDebugRecord({
                entityName:entity.name || entity.id || null, race:entity.race || null, gender:entity.gender || null,
                surface:renderSurface,
                requestedFacing:explicitFacing || null, entityFacing:entity.facing || null,
                facing, view:facingToView(facing), key, compositeId:cached.compositeId, result:'cache-hit',
            });
            recordHumanoidFlashTrace('cache-hit', entity, { appearanceKey, key, facing, compositeId:cached.compositeId, surface:renderSurface });
            return true;
        }

        // A failed composite is not allowed to monopolise the renderer. Other
        // characters/facings proceed immediately, while this exact request gets
        // a short cooldown before it may be attempted again.
        const pending = pendingCompositeRequests.get(key);
        if (pending) {
            const stillWanted = facing === pending.facing;
            if (!stillWanted) {
                pendingCompositeRequests.delete(key);
            } else {
                const previous = humanoidLastGoodCache.get(entity)?.get(facing);
                const stillWaiting = pending.sources.some(src =>
                    window.assetManager?.status?.(src) !== 'ready'
                );
                if (stillWaiting && previous) {
                    recordHumanoidFlashTrace('pending-last-good', entity, { appearanceKey, key, facing, surface:renderSurface, sources:pending.sources.map(src => src + '=' + String(window.assetManager?.status?.(src) || 'unavailable')) });
                    ctx.drawImage(previous.canvas, bounds.left, bounds.top, bounds.width, bounds.height);
                    return true;
                }
                if (stillWaiting) {
                    recordHumanoidFlashTrace('pending-no-last-good', entity, { appearanceKey, key, facing, surface:renderSurface, sources:pending.sources.map(src => src + '=' + String(window.assetManager?.status?.(src) || 'unavailable')) });
                    return false;
                }
                pendingCompositeRequests.delete(key);
            }
        }

        // Build off-screen once. The compositor writes a completion flag only
        // when every required layer is ready. Incomplete frames are never drawn
        // and never retained in the cache.
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(bounds.width * HUMANOID_CACHE_SCALE));
        canvas.height = Math.max(1, Math.ceil(bounds.height * HUMANOID_CACHE_SCALE));
        const offscreenBounds = {left:0, top:0, width:canvas.width, height:canvas.height};
        const offscreenCtx = canvas.getContext('2d');
        if (!offscreenCtx) return false;
        humanoidSpriteCacheBuilds++;
        const previousSources = activeSourcePaths;
        const sources = new Set();
        activeSourcePaths = sources;
        let rendered = false;
        // Never inherit completion state from the previous character.
        window.__humanoidRendererLastComplete = false;
        window.performanceAssetTraceApi?.compositeStart?.(key, entity, facing, sources);
        try {
            rendered = drawDirectionalHumanoidInBounds(offscreenCtx, entity, offscreenBounds, facing);
        } finally {
            activeSourcePaths = previousSources;
            // Source records are released only after a complete composite has
            // been produced. Releasing them during an incomplete attempt causes
            // the same character to start over on every redraw.
            if (window.__humanoidRendererLastComplete) {
                window.performanceAssetTraceApi?.compositeEnd?.(key, true, 'painted', {requestedSources:[...sources],layerOrder:window.__humanoidRendererLastLayerOrder || []});
                window.assetManager?.release?.([...sources]);
                window.clothingSystem?.releaseRenderSources?.();
                window.releaseRecoloredSpriteCache?.();
            }
        }
        if (!rendered) {
            recordHumanoidFlashTrace('renderer-false', entity, { appearanceKey, key, facing, surface:renderSurface, sources:[...sources].map(src => src + '=' + String(window.assetManager?.status?.(src) || 'unavailable')), lastComplete:!!window.__humanoidRendererLastComplete });
            rendererDebugRecord({
                entityName:entity.name || entity.id || null, race:entity.race || null, gender:entity.gender || null,
                surface:renderSurface,
                requestedFacing:explicitFacing || null, entityFacing:entity.facing || null,
                facing, view:facingToView(facing), key, result:'renderer-returned-false',
            });
            const failureSources = [...sources];
            const retryAfter = performance.now() + COMPOSITE_RETRY_DELAY_MS;
            window.performanceAssetTraceApi?.compositeEnd?.(key, false, 'renderer returned false', {requestedSources:failureSources,failureSource:failureSources.map(src => src+'='+String(window.assetManager?.status?.(src) || 'unavailable')),retryAfterMs:COMPOSITE_RETRY_DELAY_MS});
            pendingCompositeRequests.set(key, {entity, facing, sources:failureSources, retryAfter});
            const previous = humanoidLastGoodCache.get(entity)?.get(facing);
            if (previous) {
                recordHumanoidFlashTrace('fallback-last-good', entity, { appearanceKey, key, facing, surface:renderSurface });
                ctx.drawImage(previous.canvas, bounds.left, bounds.top, bounds.width, bounds.height);
                return true;
            }
            recordHumanoidFlashTrace('return-false', entity, { appearanceKey, key, facing, surface:renderSurface });
            return false;
        }

        // Character composition is atomic: never display or cache a partial
        // body/clothing/hair stack while another required layer is still loading.
        const complete = !!window.__humanoidRendererLastComplete;
        if (!complete) {
            recordHumanoidFlashTrace('incomplete', entity, { appearanceKey, key, facing, surface:renderSurface, sources:[...sources].map(src => src + '=' + String(window.assetManager?.status?.(src) || 'unavailable')), layerDiagnostics:window.__humanoidRendererLastLayerDiagnostics || [] });
            rendererDebugRecord({
                entityName:entity.name || entity.id || null, race:entity.race || null, gender:entity.gender || null,
                surface:renderSurface,
                requestedFacing:explicitFacing || null, entityFacing:entity.facing || null,
                facing, view:facingToView(facing), key, result:'incomplete',
            });
            const failureSources = [...sources];
            const retryAfter = performance.now() + COMPOSITE_RETRY_DELAY_MS;
            window.performanceAssetTraceApi?.compositeEnd?.(key, false, 'required layer not ready', {requestedSources:failureSources,failureSource:failureSources.map(src => src+'='+String(window.assetManager?.status?.(src) || 'unavailable')),layerOrder:window.__humanoidRendererLastLayerOrder || [],layerDiagnostics:window.__humanoidRendererLastLayerDiagnostics || [],hairDiagnostics:window.__humanoidRendererLastHairDiagnostics || null,complete:!!window.__humanoidRendererLastComplete,retryAfterMs:COMPOSITE_RETRY_DELAY_MS});
            pendingCompositeRequests.set(key, {entity, facing, sources:failureSources, retryAfter});
            const previous = humanoidLastGoodCache.get(entity)?.get(facing);
            if (previous) {
                recordHumanoidFlashTrace('incomplete-last-good', entity, { appearanceKey, key, facing, surface:renderSurface });
                ctx.drawImage(previous.canvas, bounds.left, bounds.top, bounds.width, bounds.height);
                return true;
            }
            recordHumanoidFlashTrace('incomplete-no-last-good', entity, { appearanceKey, key, facing, surface:renderSurface });
            return false;
        }

        pendingCompositeRequests.delete(key);
        const cachedComposite = cachePut(appearanceKey, facing, canvas);
        let previousByFacing = humanoidLastGoodCache.get(entity);
        if (!previousByFacing) {
            previousByFacing = new Map();
            humanoidLastGoodCache.set(entity, previousByFacing);
        }
        previousByFacing.set(facing, cachedComposite);
        ctx.drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height);
        rendererDebugRecord({
            entityName:entity.name || entity.id || null, race:entity.race || null, gender:entity.gender || null,
            surface:renderSurface,
            requestedFacing:explicitFacing || null, entityFacing:entity.facing || null,
            facing, view:facingToView(facing), key, compositeId:cachedComposite?.compositeId || null, result:'painted',
        });
        recordHumanoidFlashTrace('painted', entity, { appearanceKey, key, facing, compositeId:cachedComposite?.compositeId || null, surface:renderSurface });
        return true;
    }

    function installDrawOverride() {
        const current = window.drawPlayerCharacter;
        if (typeof current !== 'function') return false;
        if (current.__directHumanoidCompositor) { installed = true; return true; }
        legacyDrawPlayerCharacter = current;
        const direct = function(ctx, entity, x, y, z, flyOff) {
            if (drawHumanoidCharacter(ctx, entity, x, y, z, flyOff)) return;
            recordHumanoidFlashTrace('legacy-fallback', entity, { surface:'map', reason:'direct-render-returned-false' });
            return legacyDrawPlayerCharacter.apply(this, arguments);
        };
        direct.__directHumanoidCompositor = true;
        direct.__legacyDrawPlayerCharacter = legacyDrawPlayerCharacter;
        window.drawPlayerCharacter = direct;
        installed = true;
        window.__humanoidRendererInstalled = true;
        // Compatibility readiness flags for UI/tests that previously waited on
        // the interceptor stack. They now mean the equivalent direct features are ready.
        window.__facingRendererInstalled = true;
        window.__characterRigInstalled = true;
        return true;
    }

    function installCreatorPreview() {
        const current = window.updateAppearancePreview;
        if (typeof current !== 'function') return false;
        if (current.__directHumanoidPreview) return true;
        creatorLegacy = current;
        const wrapped = function() {
            const race = document.getElementById('race-select')?.value;
            const gender = document.getElementById('gender-select')?.value;
            const preview = {
                race, gender, equipped:{}, facing:'down',
                hairStyle:document.getElementById('hair-style-select')?.value || 'brown_1',
                bodyType:document.getElementById('body-type-select')?.value || 'average',
                hairHue:Number(document.getElementById('hair-hue-slider')?.value || 25),
            };
            const skin = window.getPlayerSkinToneFromControls?.();
            if (skin) Object.assign(preview, {skinHue:skin.hue,skinSaturation:skin.saturation,skinLightness:skin.lightness});
            preview.side='player';
            preview.displayArmour=true;
            preview.displayClothes=true;
            window.clothingSystem?.ensureDefaultOutfit?.(preview,{player:true});
            if (!canDirectRender(preview)) return creatorLegacy.apply(this, arguments);
            const canvas = document.getElementById('appearance-preview-canvas');
            if (!canvas) return creatorLegacy.apply(this, arguments);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
            const height = canvas.height*.90;
            const width = height*HUMAN_RENDER_ASPECT;
            const rendered = drawDirectionalHumanoidInBounds(ctx, preview, {left:(canvas.width-width)/2,top:(canvas.height-height)/2,width,height}, 'down');
            // Creator previews are atomic too: a body with only one half of a
            // two-tone garment, or without a required hair layer, is never
            // shown as a finished preview. Leave the canvas blank until the
            // asset-ready redraw produces a complete stack.
            if (!rendered || !window.__humanoidRendererLastComplete) {
                ctx.clearRect(0,0,canvas.width,canvas.height);
                return;
            }
        };
        wrapped.__directHumanoidPreview = true;
        wrapped.__legacyPreview = creatorLegacy;
        window.updateAppearancePreview = wrapped;
        wrapped();
        return true;
    }

    function sortedTurnEntities() {
        const list = [...(window.entities || [])].filter(e => e.alive && (e.side === 'player' || e.hasBeenSeenByPlayer) && !e.rider && !e.isNPC);
        if (window.isInCombat) list.sort((a,b) => b.timePoints-a.timePoints);
        return list;
    }

    function renderTurnPortraits() {
        portraitQueued = false;
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar) return;
        const entities = sortedTurnEntities();
        [...bar.querySelectorAll('.turn-indicator-item')].forEach((item,index) => {
            const entity = entities[index];
            if (!canDirectRender(entity)) return;
            const portrait = item.querySelector('.turn-indicator-portrait');
            if (!portrait) return;
            // Keep the existing portrait visible while the direct compositor's
            // front-facing assets are loading. Only replace legacy layers after a
            // complete canvas has actually been rendered successfully.
            let canvas = portrait.querySelector('canvas[data-direct-humanoid-canvas="true"]');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.width=100; canvas.height=100;
                canvas.dataset.directHumanoidCanvas='true';
                canvas.classList.add('portrait-layer');
                canvas.style.cssText='width:100%;height:100%;left:0;top:0;';
                portrait.insertBefore(canvas, portrait.firstChild);
            }
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,100,100);
            const height=92,width=height*HUMAN_RENDER_ASPECT;
            // Initiative portraits are deliberately always front-facing,
            // regardless of the entity's current map facing.
            const portraitFacing = 'down';
            window.__humanoidRendererLastComplete = false;
            // Initiative portraits use the exact same cached compositor as the
            // map. This prevents the portrait from briefly showing a naked body,
            // an independently-scaled hair layer, or any other intermediate stack.
            const rendered = drawHumanoidCharacter(
                ctx, entity, 0, 0, 1, 0,
                {left:(100-width)/2,top:4,width,height},
                portraitFacing,
                'portrait'
            );
            // A portrait is authoritative only when the COMPLETE compositor
            // stack was drawn. Never expose a body-only/hair-only/intermediate
            // canvas while another required layer is still loading.
            const complete = !!window.__humanoidRendererLastComplete;
            if (complete) {
                // Swap atomically: legacy images remain as a fallback until the
                // same front-view humanoid composite used by map sprites is ready.
                portrait.querySelectorAll('img.portrait-layer').forEach(img => img.remove());
            }
            portrait.classList.toggle('direct-humanoid-ready', complete);
            canvas.style.display = complete ? 'block' : 'none';
            if (complete) canvas.dataset.directHumanoid='true';
            else delete canvas.dataset.directHumanoid;
        });
    }

    function queuePortraitRefresh() {
        if (portraitQueued) return;
        portraitQueued = true;
        queueMicrotask(renderTurnPortraits);
    }

    function installPortraitObserver() {
        const bar = document.getElementById('turn-indicator-bar');
        if (!bar || portraitObserver) return !!portraitObserver;
        portraitObserver = new MutationObserver(queuePortraitRefresh);
        portraitObserver.observe(bar,{childList:true,subtree:true});
        queuePortraitRefresh();
        return true;
    }

    function installAll() {
        installDrawOverride();
        installCreatorPreview();
        installPortraitObserver();
    }

    window.FACING_DIRECTIONS = ['up','down','left','right'];
    window.HUMAN_FEMALE_RENDER_ASPECT = HUMAN_RENDER_ASPECT;
    window.DIRECTIONAL_CHARACTER_PATHS = CHARACTER_PATHS;
    window.DIRECTIONAL_CHARACTER_ASSETS = CHARACTER_ASSETS;
    window.DIRECT_HUMANOID_RIGS = CHARACTER_RIGS;
    window.DIRECT_HUMANOID_RIG_KEYS = Object.freeze(Object.keys(CHARACTER_RIGS));
    window.DIRECT_HUMANOID_BODY_STATUS = Object.freeze(Object.fromEntries(
        Object.entries(CHARACTER_RIGS).map(([key, rig]) => [key, rig.bodyAssetMode || 'directional'])
    ));
    window.DIRECTIONAL_CHARACTER_LAYOUT = DIRECTIONAL_LAYOUT;
    window.HUMAN_FEMALE_DIRECTIONAL_ASSETS = {
        body:CHARACTER_ASSETS.human_female.body.average,
        bodyTypes:CHARACTER_ASSETS.human_female.body,
        hair:CHARACTER_ASSETS.human_female.hair,
    };
    window.HUMAN_FEMALE_DIRECTIONAL_LAYOUT = DIRECTIONAL_LAYOUT;
    window.ELF_FEMALE_DIRECTIONAL_ASSETS = {
        body:CHARACTER_ASSETS.elf_female.body.average,
        bodyTypes:CHARACTER_ASSETS.elf_female.body,
        hair:CHARACTER_ASSETS.elf_female.hair,
    };
    window.REAR_HUMAN_EQUIPMENT_ASSETS = REAR_EQUIPMENT_ASSETS;
    window.SHIELD_VISUAL_ASSETS = SHIELD_ASSETS;
    window.ARMOUR_VISUAL_ASSETS = ARMOUR_ASSETS;
    window.ITEM_GRIPS = ITEM_GRIPS;
    window.facingToSpriteView = facingToView;
    window.facingFromHexDelta = facingFromHexDelta;
    window.setEntityFacing = setEntityFacing;
    window.updateFacingFromMovement = updateFacingFromMovement;
    window.drawDirectionalCharacterBase = (ctx,entity,bounds,facing='down') => drawDirectionalHumanoidInBounds(ctx,entity,bounds,facing);
    window.drawHumanFemaleDirectionalBase = window.drawDirectionalCharacterBase;
    window.drawHumanoidCharacter = drawHumanoidCharacter;
    window.__recordHumanoidMapBoundary = recordMapHumanoidBoundary;
    window.getHumanoidFlashTrace = () => humanoidFlashTrace.map(item => ({...item}));
    window.clearHumanoidFlashTrace = () => {
        humanoidFlashTrace.length = 0;
        rendererDebugRefresh();
    };
    window.clearHumanoidSpriteCache = clearHumanoidSpriteCache;
    window.humanoidSpriteCacheStats = {
        get size() { return [...humanoidSpriteCache.values()].reduce((n, group) => n + group.size, 0); },
        get builds() { return humanoidSpriteCacheBuilds; },
        get hits() { return humanoidSpriteCacheHits; },
        max: MAX_HUMANOID_CACHED_CHARACTERS * MAX_HUMANOID_SPRITE_VIEWS,
        maxCharacters: MAX_HUMANOID_CACHED_CHARACTERS,
        viewsPerCharacter: MAX_HUMANOID_SPRITE_VIEWS,
    };
    window.getHumanoidSpriteCacheDetails = () => [...humanoidSpriteCache.entries()].flatMap(([appearanceKey, group]) =>
        [...group.entries()].map(([facing, entry]) => ({
            appearanceKey,
            facing,
            compositeId:entry.compositeId,
        }))
    );
    window.drawDirectionalHumanoidInBounds = drawDirectionalHumanoidInBounds;
    window.refreshDirectionalTurnPortraits = renderTurnPortraits;
    window.__humanoidRendererReady = true;
    window.__directionalCharacterUIInstalled = true;

    setInterval(updateFacingFromMovement, 50);
    const installTimer = setInterval(() => {
        installAll();
        if (installed && typeof window.updateAppearancePreview === 'function') clearInterval(installTimer);
    }, 50);
    if (document.readyState === 'complete') installAll();
    else window.addEventListener('load', installAll, {once:true});
})();