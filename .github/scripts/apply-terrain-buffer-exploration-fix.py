from pathlib import Path

p = Path('hexMap.js')
text = p.read_text()
original = text

replacements = [
    (
        "let _terrainBufferExploredCount = -1;\nlet _terrainBufferFloor = 0;",
        "// Hexes actually baked into the current terrain buffer. Newly explored\n// on-screen hexes that are not in this set are drawn live until the camera's\n// next natural buffer rebuild, instead of rebuilding the whole oversized\n// buffer every time exploredHexes grows by one.\nlet _terrainBufferHexKeys = new Set();\nlet _terrainBufferFloor = 0;"
    ),
    (
        "// when the camera has drifted near the edge of its slack, zoom changed, or\n  // new terrain became explored; otherwise just blitted at an offset.\n  const exploredCount = window.exploredHexes ? window.exploredHexes.size : 0;",
        "// when the camera has drifted near the edge of its slack, zoom changed, or\n  // the viewed floor changes; otherwise just blitted at an offset. Newly\n  // explored on-screen hexes are filled live below without invalidating the\n  // whole buffer."
    ),
    (
        "      _terrainBufferZoom !== window.cameraZoom ||\n      _terrainBufferExploredCount !== exploredCount ||\n      _terrainBufferFloor !== viewerFloor ||",
        "      _terrainBufferZoom !== window.cameraZoom ||\n      _terrainBufferFloor !== viewerFloor ||"
    ),
    (
        "      _terrainBufferZoom = window.cameraZoom;\n      _terrainBufferExploredCount = exploredCount;\n      _terrainBufferFloor = viewerFloor;",
        "      _terrainBufferZoom = window.cameraZoom;\n      _terrainBufferFloor = viewerFloor;"
    ),
    (
        "      renderTerrainPass(bufVisibleAndExplored, imgOk, viewerFloor);\n      mapCtx = savedMapCtx;",
        "      renderTerrainPass(bufVisibleAndExplored, imgOk, viewerFloor);\n      _terrainBufferHexKeys = new Set(bufVisibleAndExplored.map(({q,r}) => `${q},${r}`));\n      mapCtx = savedMapCtx;"
    ),
    (
        "  mapCtx.drawImage(_terrainBuffer,\n      window.cameraX - _terrainBufferOriginX - TERRAIN_BUFFER_MARGIN,\n      window.cameraY - _terrainBufferOriginY - TERRAIN_BUFFER_MARGIN);\n\n  // 2b. Fog-of-war dim",
        "  mapCtx.drawImage(_terrainBuffer,\n      window.cameraX - _terrainBufferOriginX - TERRAIN_BUFFER_MARGIN,\n      window.cameraY - _terrainBufferOriginY - TERRAIN_BUFFER_MARGIN);\n\n  // Exploration used to invalidate the entire oversized terrain buffer for\n  // every newly discovered hex. Draw only the newly revealed on-screen tiles\n  // live; once the camera naturally crosses the buffer slack boundary they are\n  // folded into the next full buffer build. This preserves immediate reveal\n  // without a several-hundred-millisecond rebuild while walking.\n  const unbufferedTerrain = visibleAndExplored.filter(({q,r}) => !_terrainBufferHexKeys.has(`${q},${r}`));\n  if (unbufferedTerrain.length) renderTerrainPass(unbufferedTerrain, imgOk, viewerFloor);\n\n  // 2b. Fog-of-war dim"
    ),
]

for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'Expected terrain-buffer block not found:\n{old[:160]}')
    text = text.replace(old, new, 1)

if text != original:
    p.write_text(text)
    print('Applied terrain-buffer exploration fix')
else:
    print('Terrain-buffer exploration fix already applied')
