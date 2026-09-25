// spriteRigPreview.js
(() => {
    'use strict';

    const views = ['front','side','back'];
    const modes = ['base','hair','helmet','gear'];
    const labels = {
        base: 'Base body',
        hair: 'Body + selected hair',
        helmet: 'Body + helmet',
        gear: 'Body + weapon / shield',
    };
    const imageCache = new Map();

    function loadImage(src) {
        if (imageCache.has(src)) return imageCache.get(src);
        const p = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
        });
        imageCache.set(src, p);
        return p;
    }

    function drawAnchor(ctx, p, name) {
        ctx.save();
        ctx.fillStyle = '#00e5ff';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText(name, p.x + 6, p.y - 4);
        ctx.restore();
    }

    function drawSquareLayer(ctx, img, anchor, size, grip, mirror=false) {
        const x = anchor.x - grip.x * size;
        const y = anchor.y - grip.y * size;
        ctx.save();
        if (mirror) {
            ctx.translate(x + size, y);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, size, size);
        } else {
            ctx.drawImage(img, x, y, size, size);
        }
        ctx.restore();
    }

    async function drawCell(canvas, view, mode) {
        const ctx = canvas.getContext('2d');
        const rig = window.getSpriteReferenceRig('human_female', view);
        const body = await loadImage(rig.sprite.path);
        const bounds = { x:70, y:16, width:144, height:300 };

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#181818'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#555'; ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        window.drawTrimAwareSprite(ctx, body, rig.sprite, bounds.x, bounds.y, bounds.width, bounds.height);

        if (mode === 'hair') {
            const hair = await loadImage(window.HUMAN_FEMALE_PREVIEW_LAYERS.hair[view]);
            // Hair assets are still physically untrimmed. Use the same logical
            // body rectangle now; the anchor overlay makes tuning errors clear.
            window.drawTrimAwareSprite(ctx, hair, {
                originalWidth:null, originalHeight:null,
                trimLeft:0, trimTop:0, trimWidth:null, trimHeight:null,
            }, bounds.x, bounds.y, bounds.width, bounds.height);
        } else if (mode === 'helmet') {
            const helmet = await loadImage(window.HUMAN_FEMALE_PREVIEW_LAYERS.helmet);
            const anchor = window.getSpriteRigAnchor('human_female', view, 'helmetAnchor', bounds);
            drawSquareLayer(ctx, helmet, anchor, 58, {x:0.5,y:0.0});
        } else if (mode === 'gear') {
            const [weapon, shield] = await Promise.all([
                loadImage(window.HUMAN_FEMALE_PREVIEW_LAYERS.weapon),
                loadImage(window.HUMAN_FEMALE_PREVIEW_LAYERS.shield),
            ]);
            const main = window.getSpriteRigAnchor('human_female', view, 'mainHandGrip', bounds);
            const off = window.getSpriteRigAnchor('human_female', view, 'offHandGrip', bounds);
            drawSquareLayer(ctx, weapon, main, 72, {x:0.5,y:0.92});
            drawSquareLayer(ctx, shield, off, 66, {x:0.5,y:0.5});
        }

        for (const name of ['scalpCenter','hairAnchor','helmetAnchor','mainHandGrip','offHandGrip','waistCenter','leftFoot','rightFoot']) {
            drawAnchor(ctx, window.getSpriteRigAnchor('human_female', view, name, bounds), name);
        }
    }

    async function render() {
        const host = document.getElementById('preview-grid');
        for (const mode of modes) {
            const heading = document.createElement('h2');
            heading.textContent = labels[mode];
            heading.className = 'row-heading';
            host.appendChild(heading);
            for (const view of views) {
                const card = document.createElement('section');
                card.className = 'preview-card';
                const title = document.createElement('h3'); title.textContent = view;
                const canvas = document.createElement('canvas');
                canvas.width = 290; canvas.height = 340;
                canvas.dataset.mode = mode; canvas.dataset.view = view;
                card.append(title, canvas); host.appendChild(card);
                await drawCell(canvas, view, mode);
            }
        }
        document.body.dataset.previewReady = 'true';
    }

    render().catch(err => {
        document.getElementById('status').textContent = err.stack || String(err);
        document.body.dataset.previewReady = 'error';
    });
})();
