from pathlib import Path

path = Path('clothingLayers.js')
text = path.read_text()

old_build = "const BUILD='20260929-clothing-layers-v13';"
if old_build not in text:
    raise SystemExit('expected clothing build tag not found')
text = text.replace(old_build, "const BUILD='20260929-clothing-layers-v14';", 1)

targets = """  const CLOTHING_TARGETS={
    front:{
      shirt:{x:.077,y:.205,w:.846,h:.3665},pants:{x:.077,y:.5715,w:.846,h:.4435},dress:{x:.077,y:.205,w:.846,h:.810},
      bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18},
    },
    side:{
      shirt:{x:.212,y:.205,w:.576,h:.3665},pants:{x:.212,y:.5715,w:.576,h:.4435},dress:{x:.212,y:.205,w:.576,h:.810},
      bra:{x:.34,y:.30,w:.32,h:.18},underwear:{x:.34,y:.50,w:.32,h:.18},
    },
    back:{
      shirt:{x:.077,y:.205,w:.846,h:.3665},pants:{x:.077,y:.5715,w:.846,h:.4435},dress:{x:.077,y:.205,w:.846,h:.810},
      bra:{x:.20,y:.30,w:.60,h:.18},underwear:{x:.20,y:.50,w:.60,h:.18},
    },
  };
"""

insertion = targets + """

  // The old aspect-preserving fit was height-limited, leaving shirts only
  // ~30-55% as wide as the body at the shoulders/chest. Keep authored height,
  // but give outerwear a minimum horizontal envelope. The upper-body values put
  // close clothing near the measured average-body width while leaving a small
  // gap to heavy armour; looser garments and lower-body items get progressively
  // more room. Underwear/bra deliberately keep their compact aspect-preserving fit.
  const OUTERWEAR_WIDTH_USAGE={
    top_blouse:.82,top_dress:.82,top_shirt:.82,top_tunic:.84,
    pants_baggy_wraps:.74,pants_breeches:.70,pants_hose:.62,pants_trousers:.66,
  };
  function outerwearWidthUsage(slot,itemId){
    if(slot!=='shirt'&&slot!=='pants') return null;
    return OUTERWEAR_WIDTH_USAGE[itemId] ?? (slot==='shirt'?.82:.66);
  }
"""

if targets not in text:
    raise SystemExit('CLOTHING_TARGETS anchor not found')
text = text.replace(targets, insertion, 1)

old_fit = """    const scale=Math.min(targetW/trim.w,targetH/trim.h);
    let dw=trim.w*scale,dh=trim.h*scale,dx=targetX+(targetW-dw)/2;
"""
new_fit = """    const scale=Math.min(targetW/trim.w,targetH/trim.h);
    let dw=trim.w*scale,dh=trim.h*scale;
    const widthUsage=outerwearWidthUsage(slot,itemId);
    if(widthUsage!==null) dw=Math.max(dw,Math.min(targetW,targetW*widthUsage));
    let dx=targetX+(targetW-dw)/2;
"""
if old_fit not in text:
    raise SystemExit('drawFittedGarment fit anchor not found')
text = text.replace(old_fit, new_fit, 1)

if 'OUTERWEAR_WIDTH_USAGE' not in text or 'targetW*widthUsage' not in text:
    raise SystemExit('outerwear width patch validation failed')

path.write_text(text)
