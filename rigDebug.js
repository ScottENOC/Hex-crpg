// rigDebug.js
// Optional visual diagnostics for directional character rigging, plus the
// first-tranche human-female reference-rig calibration. Loaded before
// characterRig.js so the low-level drawImage observer can see the strip draws
// that characterRig captures as its native renderer.
(() => {
    const KEY_ANCHORS = 'rpg_show_rig_anchors';
    const KEY_ARMOUR = 'rpg_show_armour_width_debug';

    window.showRigAnchors = localStorage.getItem(KEY_ANCHORS) === 'true';
    window.showArmourWidthDebug = localStorage.getItem(KEY_ARMOUR) === 'true';
    window.charDebugMode = false;

    // Anchor semantics matter. Centre anchors identify where an attachment is
    // held/connected; extent anchors identify the visible edge of the body that
    // a fitted sprite edge is supposed to meet. Do not use foot centres as the
    // bottom edge of full-body armour, or shoulder centres as its top edge.
    const HUMAN_FEMALE_ANATOMY = {
        front: {
            scalpCenter:{x:0.500,y:0.105}, hairAnchor:{x:0.500,y:0.125}, helmetAnchor:{x:0.500,y:0.030},
            torsoShoulderLeft:{x:0.215,y:0.250}, torsoShoulderRight:{x:0.785,y:0.250},
            armourShoulderTopLeft:{x:0.215,y:0.225}, armourShoulderTopRight:{x:0.785,y:0.225},
            torsoWaistLeft:{x:0.320,y:0.405}, torsoWaistRight:{x:0.680,y:0.405},
            torsoHipLeft:{x:0.285,y:0.530}, torsoHipRight:{x:0.715,y:0.530},
            leftHand:{x:0.080,y:0.545}, rightHand:{x:0.920,y:0.545},
            mainHandGrip:{x:0.080,y:0.545}, offHandGrip:{x:0.920,y:0.545},
            offForearm:{x:0.873,y:0.442}, backAnchor:{x:0.500,y:0.330},
            waistCenter:{x:0.500,y:0.405},
            leftFoot:{x:0.305,y:0.965}, rightFoot:{x:0.695,y:0.965},
            leftFootSole:{x:0.305,y:0.995}, rightFootSole:{x:0.695,y:0.995},
        },
        side: {
            scalpCenter:{x:0.525,y:0.105}, hairAnchor:{x:0.525,y:0.130}, helmetAnchor:{x:0.525,y:0.030},
            torsoShoulderLeft:{x:0.460,y:0.250}, torsoShoulderRight:{x:0.560,y:0.250},
            armourShoulderTopLeft:{x:0.460,y:0.225}, armourShoulderTopRight:{x:0.560,y:0.225},
            torsoWaistLeft:{x:0.475,y:0.405}, torsoWaistRight:{x:0.545,y:0.405},
            torsoHipLeft:{x:0.465,y:0.530}, torsoHipRight:{x:0.555,y:0.530},
            leftHand:{x:0.490,y:0.520}, rightHand:{x:0.530,y:0.545},
            mainHandGrip:{x:0.530,y:0.545}, offHandGrip:{x:0.490,y:0.520},
            offForearm:{x:0.500,y:0.440}, backAnchor:{x:0.430,y:0.330},
            waistCenter:{x:0.505,y:0.405},
            leftFoot:{x:0.485,y:0.965}, rightFoot:{x:0.535,y:0.965},
            leftFootSole:{x:0.485,y:0.995}, rightFootSole:{x:0.535,y:0.995},
        },
        back: {
            scalpCenter:{x:0.500,y:0.105}, hairAnchor:{x:0.500,y:0.125}, helmetAnchor:{x:0.500,y:0.030},
            torsoShoulderLeft:{x:0.215,y:0.250}, torsoShoulderRight:{x:0.785,y:0.250},
            armourShoulderTopLeft:{x:0.215,y:0.225}, armourShoulderTopRight:{x:0.785,y:0.225},
            torsoWaistLeft:{x:0.320,y:0.405}, torsoWaistRight:{x:0.680,y:0.405},
            torsoHipLeft:{x:0.285,y:0.530}, torsoHipRight:{x:0.715,y:0.530},
            leftHand:{x:0.920,y:0.545}, rightHand:{x:0.080,y:0.545},
            mainHandGrip:{x:0.920,y:0.545}, offHandGrip:{x:0.080,y:0.545},
            offForearm:{x:0.127,y:0.442}, backAnchor:{x:0.500,y:0.300},
            waistCenter:{x:0.500,y:0.405},
            leftFoot:{x:0.695,y:0.965}, rightFoot:{x:0.305,y:0.965},
            leftFootSole:{x:0.695,y:0.995}, rightFootSole:{x:0.305,y:0.995},
        },
    };

    const ARMOUR_LANDMARK_CLEARANCE = 0.10;
    function copyPoint(p) { return p ? {x:p.x,y:p.y} : null; }
    function applyCanonicalAnatomy() {
        const refs = window.HUMAN_FEMALE_REFERENCE_RIGS;
        if (!refs) return false;
        for (const view of ['front','side','back']) {
            if (!refs[view]?.anchors) return false;
            Object.assign(refs[view].anchors, HUMAN_FEMALE_ANATOMY[view]);
        }
        window.HUMAN_FEMALE_ANATOMY = HUMAN_FEMALE_ANATOMY;
        return true;
    }

    function syncCharacterRigAttachments() {
        const target = window.DIRECTIONAL_ATTACHMENT_RIGS?.human_female;
        if (!target) return false;
        for (const view of ['front','side','back']) {
            const a = HUMAN_FEMALE_ANATOMY[view];
            Object.assign(target[view], {
                headTop:copyPoint(a.helmetAnchor),
                headCentre:copyPoint(a.scalpCenter),
                shoulderLeft:copyPoint(a.torsoShoulderLeft),
                shoulderRight:copyPoint(a.torsoShoulderRight),
                back:copyPoint(a.backAnchor),
                mainHand:copyPoint(a.mainHandGrip),
                offHand:copyPoint(a.offHandGrip),
                forearm:copyPoint(a.offForearm),
            });
        }
        return true;
    }

    function span(left, right) {
        return {
            left:Math.max(0, Math.min(left.x,right.x)-ARMOUR_LANDMARK_CLEARANCE),
            right:Math.min(1, Math.max(left.x,right.x)+ARMOUR_LANDMARK_CLEARANCE),
        };
    }
    function armourFromAnatomy(view) {
        const a = HUMAN_FEMALE_ANATOMY[view];
        const shoulders=span(a.torsoShoulderLeft,a.torsoShoulderRight);
        const waist=span(a.torsoWaistLeft,a.torsoWaistRight);
        const hips=span(a.torsoHipLeft,a.torsoHipRight);
        return {
            shoulderL:shoulders.left, shoulderR:shoulders.right,
            waistL:waist.left, waistR:waist.right,
            hemL:hips.left, hemR:hips.right,
            waistY:(a.torsoWaistLeft.y+a.torsoWaistRight.y)/2,
            source:'calibrated-body-landmarks',
        };
    }
    function syncArmourLandmarks() {
        if (!window.__directionalEquipmentFitTuningApplied) return false;
        const views=window.DIRECTIONAL_ARMOUR_RIGS?.human_female;
        if (!views) return false;
        for (const view of ['front','side','back']) Object.assign(views[view],armourFromAnatomy(view));
        if (window.ARMOUR_RIGS?.human_female) Object.assign(window.ARMOUR_RIGS.human_female,armourFromAnatomy('front'));
        const cfg=window.CHAR_CONFIG?.human_female;
        if (cfg?.armour) cfg.armour.mesh={...armourFromAnatomy('front')};
        if (window.HUMAN_FEMALE_EQUIPMENT_FIT) {
            window.HUMAN_FEMALE_EQUIPMENT_FIT.armourViews=Object.fromEntries(['front','side','back'].map(v=>[v,{...armourFromAnatomy(v)}]));
            window.HUMAN_FEMALE_EQUIPMENT_FIT.armourClearanceX=ARMOUR_LANDMARK_CLEARANCE;
            window.HUMAN_FEMALE_EQUIPMENT_FIT.armourSource='calibrated-body-landmarks';
        }
        return true;
    }

    let calibrationAttempts=0;
    const calibrationTimer=setInterval(()=>{
        calibrationAttempts++;
        const refs=applyCanonicalAnatomy();
        const attachments=syncCharacterRigAttachments();
        const armour=syncArmourLandmarks();
        if ((refs&&attachments&&armour)||calibrationAttempts>200) {
            if (refs&&attachments) window.__humanFemaleReferenceRigCalibrated=true;
            clearInterval(calibrationTimer);
        }
    },25);
    applyCanonicalAnatomy();

    function setShowRigAnchors(enabled) {
        window.showRigAnchors = !!enabled;
        window.charDebugMode = false;
        localStorage.setItem(KEY_ANCHORS, enabled ? 'true' : 'false');
        syncUI();
    }
    function setShowArmourWidthDebug(enabled) {
        window.showArmourWidthDebug = !!enabled;
        localStorage.setItem(KEY_ARMOUR, enabled ? 'true' : 'false');
        syncUI();
        updateDiagnosticPanel();
    }
    window.setShowRigAnchors = setShowRigAnchors;
    window.setShowArmourWidthDebug = setShowArmourWidthDebug;

    function syncUI() {
        const anchors = document.getElementById('graphics-show-rig-anchors');
        if (anchors) anchors.checked = !!window.showRigAnchors;
        const armour = document.getElementById('graphics-show-armour-width-debug');
        if (armour) armour.checked = !!window.showArmourWidthDebug;
    }

    function installSettingsControls() {
        if (document.getElementById('graphics-show-rig-anchors')) {
            syncUI();
            return true;
        }
        const foliage = document.getElementById('graphics-foliage-detail');
        const foliageGroup = foliage?.closest('.form-group');
        if (!foliageGroup?.parentElement) return false;
        const heading = document.createElement('h3');
        heading.textContent = 'Rig Debug';
        heading.dataset.rigDebugSettings = 'true';
        const anchorGroup = document.createElement('div');
        anchorGroup.className = 'form-group';
        anchorGroup.innerHTML = '<label><input type="checkbox" id="graphics-show-rig-anchors"> Show character anchor points</label><small style="display:block;color:#aaa;margin-top:3px;">Shows both attachment centres and armour/silhouette extent anchors.</small>';
        anchorGroup.querySelector('input').addEventListener('change', e => setShowRigAnchors(e.target.checked));
        const armourGroup = document.createElement('div');
        armourGroup.className = 'form-group';
        armourGroup.innerHTML = '<label><input type="checkbox" id="graphics-show-armour-width-debug"> Show armour width diagnostic</label><small style="display:block;color:#aaa;margin-top:3px;">Displays measured source width, fitted width and final strip compression.</small>';
        armourGroup.querySelector('input').addEventListener('change', e => setShowArmourWidthDebug(e.target.checked));
        foliageGroup.after(heading, anchorGroup, armourGroup);
        syncUI();
        return true;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSettingsControls, { once:true });
    else installSettingsControls();
    let settingsAttempts = 0;
    const settingsTimer = setInterval(() => { if (installSettingsControls() || ++settingsAttempts > 40) clearInterval(settingsTimer); }, 250);

    function sourcePath(img) {
        const source = img?.__recolorBaseSource || img;
        return String(source?.src || '').split('?')[0].toLowerCase();
    }
    function isHumanArmour(img) {
        const path = sourcePath(img);
        if (/human(?:light|medium|heavy)armour\.png$/.test(path)) return true;
        const v = window.gameVisuals || {};
        return img === v.humanLight || img === v.humanMedium || img === v.humanHeavy;
    }
    function femaleBodyView(img) {
        const path = sourcePath(img);
        const match = path.match(/\/human_female\/body_(?:broad_)?(front|side|back)\.png$/);
        return match?.[1] || null;
    }
    function destinationRect(args) {
        if (args.length === 4) return { x:+args[0], y:+args[1], width:+args[2], height:+args[3] };
        if (args.length === 8) return { x:+args[4], y:+args[5], width:+args[6], height:+args[7] };
        return null;
    }

    const anchorRecords = [];
    let anchorFlushQueued = false;
    function transformPoint(matrix, x, y) { return { x: matrix.a*x + matrix.c*y + matrix.e, y: matrix.b*x + matrix.d*y + matrix.f }; }
    function queueCanonicalAnchorOverlay(ctx, img, args) {
        if (!window.showRigAnchors || ctx !== window.mapCtx) return;
        const view = femaleBodyView(img);
        const rect = view && destinationRect(args);
        const rig = view && window.HUMAN_FEMALE_REFERENCE_RIGS?.[view];
        if (!rect || !rig?.anchors) return;
        const matrix = typeof ctx.getTransform === 'function' ? ctx.getTransform() : {a:1,b:0,c:0,d:1,e:0,f:0};
        const anchors = Object.entries(rig.anchors).map(([name,p]) => {
            const raw = transformPoint(matrix, rect.x + p.x*rect.width, rect.y + p.y*rect.height);
            return { name, x:raw.x, y:raw.y };
        });
        anchorRecords.push({ ctx, anchors });
        if (anchorFlushQueued) return;
        anchorFlushQueued = true;
        queueMicrotask(() => {
            anchorFlushQueued = false;
            for (const record of anchorRecords.splice(0)) drawCanonicalAnchors(record.ctx, record.anchors);
        });
    }
    function anchorColour(name) {
        if (/sole|armourShoulderTop/i.test(name)) return '#ff5252';
        if (name.startsWith('torso')) return '#00e5ff';
        if (/hand|grip|forearm/i.test(name)) return '#ffab40';
        if (/foot/i.test(name)) return '#76ff03';
        if (/scalp|hair|helmet/i.test(name)) return '#e040fb';
        return '#ffeb3b';
    }
    function drawCanonicalAnchors(ctx, anchors) {
        if (!window.showRigAnchors || !ctx || !anchors?.length) return;
        ctx.save();
        if (typeof ctx.setTransform === 'function') ctx.setTransform(1,0,0,1,0,0);
        ctx.font = '10px monospace'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 2;
        for (const p of anchors) {
            ctx.beginPath(); ctx.arc(p.x,p.y,3.5,0,Math.PI*2);
            ctx.fillStyle = anchorColour(p.name); ctx.fill(); ctx.strokeStyle='#000'; ctx.stroke();
            ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
            ctx.strokeText(p.name,p.x+5,p.y-3); ctx.fillText(p.name,p.x+5,p.y-3);
        }
        ctx.restore();
    }

    let activeArmourDiagnostic = null;
    const originalPrototypeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    if (!originalPrototypeDrawImage.__rigDebugObserved) {
        const observedDrawImage = function(img, ...args) {
            queueCanonicalAnchorOverlay(this, img, args);
            if (window.showArmourWidthDebug && activeArmourDiagnostic && this === window.mapCtx && img === activeArmourDiagnostic.image && args.length === 8) {
                const rect = destinationRect(args);
                if (rect && rect.width > 0 && rect.height > 0) activeArmourDiagnostic.strips.push(rect);
            }
            return originalPrototypeDrawImage.call(this, img, ...args);
        };
        observedDrawImage.__rigDebugObserved = true;
        observedDrawImage.__rigDebugOriginal = originalPrototypeDrawImage;
        CanvasRenderingContext2D.prototype.drawImage = observedDrawImage;
    }

    function summariseDiagnostic(diag, fit) {
        const strips=diag.strips||[]; const widths=strips.map(s=>s.width).filter(Number.isFinite);
        const maxWidth=widths.length?Math.max(...widths):0, minWidth=widths.length?Math.min(...widths):0;
        const unionLeft=strips.length?Math.min(...strips.map(s=>s.x)):0, unionRight=strips.length?Math.max(...strips.map(s=>s.x+s.width)):0;
        const hsZ=(window.hexSize||1)*(window.cameraZoom||1);
        const fittedOuterWidthPx=fit?.outerWidth?fit.outerWidth*hsZ:0; const trim=fit?.trim||null;
        const sourceVisibleWidthPx=trim?.trimWidth||0, sourceCanvasWidthPx=trim?.originalWidth||diag.image?.naturalWidth||diag.image?.width||0;
        const undeformedVisibleWidthPx=fittedOuterWidthPx&&sourceCanvasWidthPx?fittedOuterWidthPx*sourceVisibleWidthPx/sourceCanvasWidthPx:0;
        const result={view:fit?.view||diag.view||'unknown',sourceVisibleWidthPx,sourceCanvasWidthPx,sourceVisibleHeightPx:trim?.trimHeight||0,
            fittedOuterWidthPx,fittedOuterWidthHex:fit?.outerWidth||0,fittedOuterHeightHex:fit?.outerHeight||0,undeformedVisibleWidthPx,
            stripCount:strips.length,stripMinWidthPx:minWidth,stripMaxWidthPx:maxWidth,stripUnionWidthPx:Math.max(0,unionRight-unionLeft),
            stripCompressionRatio:fittedOuterWidthPx?maxWidth/fittedOuterWidthPx:0,stripWidthsPx:widths,timestamp:Date.now()};
        window.__lastArmourWidthDebug=result; updateDiagnosticPanel(); return result;
    }
    function ensureDiagnosticPanel() {
        let panel=document.getElementById('armour-width-debug-panel'); if(panel)return panel;
        panel=document.createElement('div'); panel.id='armour-width-debug-panel';
        Object.assign(panel.style,{position:'fixed',right:'6px',top:'calc(env(safe-area-inset-top, 0px) + 6px)',zIndex:'100000',maxWidth:'300px',padding:'7px 9px',border:'1px solid #00e5ff',borderRadius:'5px',background:'rgba(0,0,0,.82)',color:'#d7ffff',font:'11px/1.25 monospace',whiteSpace:'pre-wrap',pointerEvents:'none',display:'none'});
        document.body.appendChild(panel); return panel;
    }
    function updateDiagnosticPanel() {
        if(typeof document==='undefined')return; const panel=ensureDiagnosticPanel();
        if(!window.showArmourWidthDebug){panel.style.display='none';return;} panel.style.display='block';
        const d=window.__lastArmourWidthDebug; if(!d){panel.textContent='Armour width diagnostic\nWaiting for armour draw…';return;}
        panel.textContent=[`Armour width — ${d.view}`,`source visible: ${d.sourceVisibleWidthPx}/${d.sourceCanvasWidthPx}px`,`fitted box: ${d.fittedOuterWidthPx.toFixed(1)}px (${d.fittedOuterWidthHex.toFixed(3)} hex)`,`visible before strips: ${d.undeformedVisibleWidthPx.toFixed(1)}px`,`strips: ${d.stripCount}  min/max ${d.stripMinWidthPx.toFixed(1)}/${d.stripMaxWidthPx.toFixed(1)}px`,`strip union: ${d.stripUnionWidthPx.toFixed(1)}px`,`box retained: ${(d.stripCompressionRatio*100).toFixed(1)}%`].join('\n');
    }
    function installOuterDiagnosticWrapper() {
        const ctx=window.mapCtx; if(!ctx||ctx.drawImage?.__rigDebugOuter)return!!ctx;
        if(!window.__characterRigInstalled||!window.__directionalEquipmentFitTuningApplied)return false;
        const previous=ctx.drawImage.bind(ctx);
        const wrapper=function(img,...args){
            if(!window.showArmourWidthDebug||!isHumanArmour(img)||args.length!==4)return previous(img,...args);
            const beforeFit=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour; const diag={image:img,strips:[],view:null};
            const saved=activeArmourDiagnostic; activeArmourDiagnostic=diag;
            try{return previous(img,...args);}finally{activeArmourDiagnostic=saved;const fit=window.HUMAN_FEMALE_EQUIPMENT_FIT?.lastMeasuredArmour;if(fit&&fit!==beforeFit)summariseDiagnostic(diag,fit);}
        };
        wrapper.__rigDebugOuter=true; wrapper.__rigDebugPrevious=previous; ctx.drawImage=wrapper; return true;
    }
    let attempts=0; const timer=setInterval(()=>{attempts++;if(installOuterDiagnosticWrapper()||attempts>100)clearInterval(timer);},100);
    if(document.readyState==='complete')installOuterDiagnosticWrapper(); else window.addEventListener('load',()=>setTimeout(installOuterDiagnosticWrapper,0),{once:true});

    window.updateArmourWidthDiagnosticPanel=updateDiagnosticPanel;
    window.__rigDebugLoaded=true;
})();