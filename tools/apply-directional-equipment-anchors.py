from pathlib import Path

path = Path('characterRig.js')
text = path.read_text()

old = """            side: {\n                headTop:{x:0.50,y:0.03}, headCentre:{x:0.53,y:0.15},\n                shoulderLeft:{x:0.46,y:0.25}, shoulderRight:{x:0.56,y:0.25},\n                back:{x:0.43,y:0.34}, mainHand:{x:0.53,y:0.62},\n                offHand:{x:0.49,y:0.58}, forearm:{x:0.50,y:0.47},\n            },\n"""
new = """            side: {\n                headTop:{x:0.50,y:0.03}, headCentre:{x:0.53,y:0.15},\n                shoulderLeft:{x:0.46,y:0.25}, shoulderRight:{x:0.56,y:0.25},\n                back:{x:0.43,y:0.34}, mainHand:{x:0.62,y:0.62},\n                offHand:{x:0.52,y:0.58}, forearm:{x:0.56,y:0.47},\n            },\n            right: {\n                headTop:{x:0.50,y:0.03}, headCentre:{x:0.53,y:0.15},\n                shoulderLeft:{x:0.46,y:0.25}, shoulderRight:{x:0.56,y:0.25},\n                back:{x:0.43,y:0.34}, mainHand:{x:0.62,y:0.62},\n                offHand:{x:0.52,y:0.58}, forearm:{x:0.56,y:0.47},\n            },\n            left: {\n                headTop:{x:0.50,y:0.03}, headCentre:{x:0.47,y:0.15},\n                shoulderLeft:{x:0.44,y:0.25}, shoulderRight:{x:0.54,y:0.25},\n                back:{x:0.57,y:0.34}, mainHand:{x:0.38,y:0.62},\n                offHand:{x:0.48,y:0.58}, forearm:{x:0.44,y:0.47},\n            },\n"""
if old not in text:
    raise SystemExit('side attachment rig anchor not found')
text = text.replace(old, new, 1)

old = """        const view = facingToView(facing);\n        const raw = views[view]?.[name];\n        if (!raw) return null;\n        return facing === 'left' ? { x:1-raw.x, y:raw.y } : raw;\n"""
new = """        const view = facingToView(facing);\n        const raw = views[facing]?.[name] || views[view]?.[name];\n        if (!raw) return null;\n        if (views[facing]) return raw;\n        return facing === 'left' ? { x:1-raw.x, y:raw.y } : raw;\n"""
if old not in text:
    raise SystemExit('directional attachment lookup anchor not found')
text = text.replace(old, new, 1)

insert_after = """    function positionSquareByGrip(anchor, size, grip) {\n        return {\n            x: anchor.x - grip.x * size,\n            y: anchor.y - grip.y * size,\n            size,\n        };\n    }\n"""
addition = """\n    function attachmentIsBehindBody(key, anchorName) {\n        if (!DIRECTIONAL_ATTACHMENT_RIGS[key]) return false;\n        const facing = window.__activeCharacterFacing;\n        if (facing === 'right') return anchorName === 'mainHand';\n        if (facing === 'left') return anchorName === 'offHand' || anchorName === 'forearm';\n        return false;\n    }\n\n    function drawRigidAttachment(ctx, nativeDrawImage, img, pos, key, anchorName) {\n        const facing = window.__activeCharacterFacing;\n        const mirror = facing === 'left' && !!DIRECTIONAL_ATTACHMENT_RIGS[key];\n        const behind = attachmentIsBehindBody(key, anchorName) && activeBody;\n        ctx.save();\n        try {\n            if (behind) {\n                const x0 = activeBody.left + activeBody.width * 0.34;\n                const y0 = activeBody.top + activeBody.height * 0.18;\n                const w = activeBody.width * 0.32;\n                const h = activeBody.height * 0.72;\n                ctx.beginPath();\n                ctx.rect(-100000, -100000, 200000, 200000);\n                ctx.rect(x0, y0, w, h);\n                ctx.clip('evenodd');\n            }\n            if (mirror) {\n                const cx = pos.x + pos.size / 2;\n                ctx.translate(cx, 0);\n                ctx.scale(-1, 1);\n                ctx.translate(-cx, 0);\n            }\n            nativeDrawImage(img, pos.x, pos.y, pos.size, pos.size);\n        } finally {\n            ctx.restore();\n        }\n    }\n"""
if addition not in text:
    if insert_after not in text:
        raise SystemExit('positionSquareByGrip anchor not found')
    text = text.replace(insert_after, insert_after + addition, 1)

old = """                        const pos=positionSquareByGrip(anchor,size,grip);\n                        nativeDrawImage(img,pos.x,pos.y,pos.size,pos.size); drawAttachmentDebug(ctx); return;\n"""
new = """                        const pos=positionSquareByGrip(anchor,size,grip);\n                        drawRigidAttachment(ctx,nativeDrawImage,img,pos,key,anchorName); drawAttachmentDebug(ctx); return;\n"""
if old not in text:
    raise SystemExit('rigid attachment draw anchor not found')
text = text.replace(old, new, 1)

path.write_text(text)
