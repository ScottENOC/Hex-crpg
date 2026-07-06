# Backlog

Scoped-but-deferred work. Not urgent at current scale — pick these up when
their trigger condition below is actually hit, not before.

## 1. Spatial index for entity-at-hex lookups

**Trigger:** noticeable slowdown in combat/AI turns (not movement — that's
already fixed) as entity counts grow, or once we're routinely running fights
with dozens+ combatants.

**Problem:** `getEntityAtHex` (gameEngine.js) and the LOS viewer lookup in
`hasLineOfSight` (hexMap.js) both do a linear `window.entities.find(...)`
scan. Same shape of bug as the two `findPath` scans already fixed this
session (occupant check, path-array copy) and the pathfinding queue sort
(also fixed — now a binary heap). This one's `getEntityAtHex` alone has
43+ call sites across combat, movement, AI, and door/item logic.

**Why it's deferred, not just fixed:** a naive drop-in cache goes stale
mid-combat (movement lerps, deaths, spawns all change entity positions
between rebuilds) in ways that are easy to get subtly wrong and hard to
test exhaustively across 43 call sites. Needs a real "when does the index
get invalidated" design, not a quick patch.

**Shape of the fix:** a `Map` from hex-key to entity, rebuilt once per tick
(or incrementally updated on move/death/spawn — pick based on how hot the
rebuild-per-tick cost turns out to be), with `getEntityAtHex` reading from
it. Same pattern as the `occupantsByHex` map already built once per
`findPath` call.

## 2. Chunk-streaming for terrain/world state

**Trigger:** the world map actually grows much larger than today's, or
sessions routinely run long enough that `exploredHexes` pruning (already
in place) isn't enough on its own.

**Problem:** `window.overrideTerrain`/`tileObjects` are already sparse
diffs against deterministic world-gen (only real changes get an entry, so
they scale with "how much has changed," not map size or distance
traveled) — that part's fine as-is. What doesn't exist is any
load/unload tier for terrain *rendering and collision* data itself:
`getTerrainAt` computes procedurally on every call with no chunking, so a
much bigger map means more total procedural-generation cost as the player
roams, even though the diff dict stays small.

**Why it's deferred:** this touches world-gen, rendering, and save/load
simultaneously — a real architecture change, not an optimization pass.
Doing it now, before knowing how much bigger the map needs to be, risks
building the wrong granularity (chunk size, eviction radius) and having to
redo it.

**Shape of the fix (once triggered):** partition the world into fixed-size
hex blocks; keep only blocks within some radius of the player "live"; the
existing diff dict already tells you what to reapply when a block streams
back in (its baseline is deterministic from world-gen, same idea as the
existing save-diff mechanism). Same load/unload hysteresis-radius pattern
as the corpse/explored-hex pruning already shipped, applied to terrain
blocks instead of entities.
