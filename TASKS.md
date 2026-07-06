# Backlog

Scoped-but-deferred work. Not urgent at current scale — pick these up when
their trigger condition below is actually hit, not before.

## 0. [DONE] Global per-tick entity loop — fixed via superposition + restless-set

**Was:** `runTickInternal` (gameEngine.js) iterated **every** entity in the
game every real-time frame for regen/poison/mana bookkeeping, and the
real-time movement loop + schedule walker did the same, regardless of
distance from the player. With Campaign 2's roster at 80+ persistent NPCs,
that was the diagnosed cause of a user-reported slowdown (worse on phones)
after Border War landed.

**Fixed, in three layers (all shipped, benchmarked, tested in
tests/tick-perf.spec.js and tests/border-war has the schedule-snap side):**
1. Empty-`activeSpells` scans hoisted out of the per-entity loop (also fixed
   a latent `tpGained`-out-of-scope crash on silencing a TP-capped entity).
2. **Superposition / active set:** neutral ambient NPCs beyond a 40-hex
   active radius (`isDormantAmbientNpc`) are skipped in both per-frame loops
   entirely, and their schedule-driven position is *snapped* to the correct
   scheduled hex (updateNpcSchedules) rather than pathfinding+walking there
   unobserved — BG1/Skyrim-style "collapse on approach."
3. **Restless set:** out of combat, the regen loop iterates only entities
   NOT at full rest (below max HP/mana, poisoned, withering, or tied to an
   active spell — `rebuildRestlessSet`), rebuilt on the ~1s refresh and at
   combat-end. A full-health capital costs ~0 per frame instead of
   re-confirming every townsperson's HP/mana. Measured: 0.068 → 0.003
   ms/tick in the "standing in a full-health city" scenario (~20x).

**Remaining (lower priority, only if a huge world needs it):** the ~1s
throttled schedule-snap still touches the small scheduled-NPC set even while
dormant; a fully-lazy version would compute an NPC's position purely on
observation (trigger = player nears any hex on its schedule/behavior path)
and never touch it otherwise. Not worth it at current scale. Also latent
(content, not perf): patrol/campRoutine NPCs — the fort wall guards, goblin
camp — currently only move *during combat* (their movement is driven
through the combat turn loop), so they stand still during exploration.
Separate fix: drive `behaviorTick` for near-player neutral NPCs out of
combat too.

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

## 3. Save-file compression + localStorage → IndexedDB migration

**Trigger:** measured save file size approaching a few MB (check via
`JSON.stringify(gameState).length` on a real save), or once the world
actually reaches "5 kingdoms + greenskins + 10x today's towns" scale.

**Problem:** persistence is 100% `localStorage` (persistence.js —
`localStorage.setItem(key, JSON.stringify(gameState))`), which is commonly
capped around 5MB per origin (Firefox/Safari; Chromium is often more
generous but not guaranteed), with no current limit on the number of named
save slots. Rough estimate at 10x scale: terrain/tileObject diffs scale
with authored content, not exploration, so ~0.5-1.5MB; NPCs (full
stat/skill/inventory serialization, ~1-3KB each) are the actual multiplier
— 500-1500 NPCs is 0.5-4.5MB; `window.exploredHexes` is a genuinely
permanent "have I ever seen this hex" bit (drives the fog-of-war render,
matching BG1's black/never-seen vs. dimmed/seen-before distinction — see
the correction in `pruneDistantExploredHexes`, campaign2Dialogue.js, which
used to incorrectly delete far-away entries from it and no longer does)
and, unlike `lastSeenTimeMap`, is NOT eligible for distance-based
forgetting — it will genuinely grow with total distinct area ever
explored, unbounded, for the life of a save. At 10x world scale with real
exploration, this could plausibly be the single largest structure in the
save file, not just a rounding error alongside NPCs.

**Why it's deferred:** not urgent until a save actually approaches that
size; premature compression work now would be guessing at a format before
knowing the real NPC-count multiplier and how much of the map players
actually explore.

**Shape of the fix (once triggered):** this is exactly BG1's own trick,
just needs the equivalent structure for a seamless (non-chunked) world:
- `exploredHexes`: replace the per-hex string-keyed Set with a **chunked
  bitset** — partition the world into fixed-size blocks (same partition
  item #2 above would use for live terrain), one packed bitset per chunk
  (one bit per hex instead of a ~10-11 byte string), stored only for
  chunks that have any explored hexes at all. This is the actual reason
  BG1 saves stay small despite "never forgetting" a tile — each area's
  explored bitmap is bounded by that area's own fixed size, and there are
  only ever as many area-records as areas actually visited. A ~10-20x cut
  per visited region, and — unlike distance-based pruning — it never loses
  information.
- The bigger lever: migrate save/load off `localStorage` onto `IndexedDB`
  (no realistic content-size ceiling, browser-quota-managed instead of a
  hard 5-10MB wall) — a real migration (async API, existing save/load call
  sites all assume synchronous `localStorage`), not a data-format tweak.

## 4. Diff scripted NPCs against their code-defined spec, like terrain already does

**Trigger:** same as #3 — bundle with the save-compression pass once
triggered, since it's the same idea applied to a different structure.

**Problem:** `saveGame` (persistence.js ~85-100) dumps every non-function
property of every entity in `window.entities` — full skills object,
equipped items, race, stats, everything — for every NPC in the game, not
just the player's own party. But every scripted world NPC (soldiers,
quest-givers, shopkeepers — anything built via `buildNPC`/`buildGoblinNPC`
from a `campaign2Content.js` spec) is exactly as deterministic as terrain
already is: same spec + same world-gen = same NPC, every time. There's
currently no NPC leveling/skill-growth system, so in the common case
100% of that per-NPC data is redundant with the code that already defines
it — this is precisely the problem `diffAgainstBaseline` (persistence.js)
already solved for `overrideTerrain`/`tileObjects` (task #127), just not
yet applied to entities.

**Why it's deferred:** unlike terrain (naturally keyed by hex, one
canonical baseline snapshot taken once after world-gen), entities are an
array without an obvious stable diffing key, and — critically — not
every entity is spec-driven: the player's own party, hired mercenaries,
summoned creatures, and anything built at runtime (siege-arena
skirmishers, etc.) have no code-defined baseline to diff against at all,
so this only ever applies to a subset of `window.entities`, not the
mechanism as a whole. That subset-vs-not distinction needs to be gotten
right, not guessed at while mid-feature.

**Shape of the fix (once triggered):** give every spec-built NPC a stable
identity key (each spec already has a unique `name`, e.g.
`campaign2FortSoldiers`'s `'Fort Soldier Halric'` — reuse that rather than
inventing a new id scheme). Take a baseline snapshot the same way
`_campaign2TerrainBaseline` already does (right after `setupVillageScene`
runs, before any player interaction) keyed by that name. On save, for any
entity whose name matches a known spec, store only the diff against that
baseline (hp, position, alive/unconscious state, inventory changes,
reputation/knowledge — the things that actually change at runtime) instead
of the full object; on load, rebuild the NPC fresh from its spec via the
normal world-build path and reapply the diff, exactly like terrain already
does. Entities with no matching spec (party, hires, summons, siege-arena
combatants) keep today's full-object serialization unchanged — this only
removes redundant data for the part of the roster that's actually
redundant.
