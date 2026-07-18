# Silverhart Saga — Living World & Mobile Roadmap

Prioritized, implementation-ready tasks. Each entry says **what**, **where**,
**how**, and **how to verify**, so any model/contributor can pick one up cold.
Written after the world-pulse engine (worldPulse.js), adaptive FPS cap, and
terrain buffer landed — those are the foundations these build on.

Conventions this codebase already follows (keep to them):
- No build step for the web game: plain script tags in `index.html`, globals on
  `window`. New systems get their own root-level `.js` file + a script tag
  (order matters — after its dependencies, before `gameEngine.js`).
- Every feature ships with Playwright tests in `tests/` using the direct-state
  style (drive `window.*` from `page.evaluate`), plus a full-suite run.
  3 known pre-existing failures are unrelated: greenskin-spy x2, road-graph x1.
- Persistence: add fields to the save object AND the load branch in
  `persistence.js` (search for `regions:` to find both spots).
- World-clock hooks go in `worldTime.js`'s tick block (search `tickRegions`).

---

## A. Living world (highest priority — the "no dead cleared zones" goal)

### A1. Physical caravans on the roads
**What:** When worldPulse fires `caravan_arrived`, if the player is outdoors in
the campaign-2 overworld, actually spawn a small caravan (2 merchants + 1 guard,
`side: 'neutral'`) at the far end of the nearest road, walking the road past the
village and despawning at the opposite edge. The world event already exists;
this adds its physical body.
**Where:** worldPulse.js (`caravan_arrived.apply`), reuse `createMonster`/
`buildNPC` + `behaviorType`/`destination` movement (see how Hollowmere soldiers
walk in via `destination` in campaign2World.js). Road hexes are terrain name
`'Path'` — pick waypoints from the painted road columns (see `paintPath` calls).
**Guard rails:** Tag spawns `isRandomEncounter = true` so corpse pruning covers
them; hard-cap one live caravan at a time (`window._liveCaravan` flag).
**Verify:** test that firing the event with the player outdoors creates ≤1
caravan whose members sit on Path hexes; that a second fire while one is live
spawns nothing.

### A2. Bandit camps that seed themselves at low security
**What:** If `aldervale.security < 30` for 3+ consecutive in-game days, spawn a
small bandit camp (3-4 bandits, a campfire tileObject) at a fixed candidate
site well off the roads (pick 2-3 candidate hex clusters manually, away from
quest content). Clearing it: +8 aldervale security via `cascadeRegionStat`.
If security later collapses again, a camp may re-seed at a *different*
candidate site — this is the repopulation loop, the direct answer to "cleared
areas stay empty."
**Where:** New section in worldPulse.js (a `checkBanditCampSeeding(delta)`
helper called from `tickWorldPulse`); camp construction mirrors the goblin camp
build in campaign2World.js but far smaller.
**Verify:** tests for the 3-day timer, the security reward on clearing (drive
`checkCombatEnd`-adjacent state directly), and re-seed at a different site.

### A3. Daily schedules for the rest of Hollowmere
**What:** Old Mac already has a day schedule (`updateNpcSchedules`,
gameEngine.js). Extend the same pattern to Mira, Oskar, Wick Hallow, and Elder
Marta: home at night, workplace/tavern by day. The tavern should feel busier at
evening (Mira+Oskar there 18:00-24:00), the store staffed 8:00-18:00.
**Where:** `updateNpcSchedules` in gameEngine.js; home positions already exist
(`'Oskar Vinn': { q: 3, r: -2 }` block in campaign2World.js ~line 3006).
**Guard rails:** Never reschedule an NPC who is in combat, has an active quest
beat pinning them (check the existing Old Mac guards), or is dead.
**Verify:** set `window.worldSeconds` to 03:00/12:00/20:00, run the scheduler,
assert each NPC's `destination` targets the right building interior.

### A4. Rumor surfaces beyond Garrick
**What:** `getRecentWorldRumors` is wired only into Garrick. Add the same
"heard anything?"-style option to the Reddale innkeeper and Emberlode's
tavern-equivalent NPC, each filtering rumors to their own region where the
event types allow (mine_trouble belongs in Emberlode's mouth, not Reddale's).
Add an `regionId` field to each event type's recorded rumor to support this.
**Where:** worldPulse.js (add regionId to `recordWorldEvent` calls),
campaign2Dialogue.js handlers `reddale_innkeeper` + whichever Emberlode NPC
exists (search `emberlode` in campaign2Dialogue.js).
**Verify:** extend tests/world-pulse.spec.js: a mine_trouble rumor surfaces in
Emberlode's dialogue and not Reddale's.

### A5. Region-state visible in the village itself
**What:** Make Hollowmere's prosperity/security legible without menus:
- prosperity < 25: market stall tileObject disappears, 1 beggar NPC appears
  near the crossroads.
- prosperity > 60: extra market stall + a visiting peddler NPC.
- security < 30: shutters/boarded-window flavor message when entering the
  village + Garrick's greeting line changes to a wary variant.
Recompute on scene entry, not per-tick.
**Where:** campaign2World.js scene setup + a small `applyRegionDressing()`
called after village build; greeting variant in garrick_holt handler.
**Verify:** set region stats directly, rebuild scene, assert entity/tileObject
presence.

## B. Mobile / iOS (after user's device-testing week produces a punch list)

### B1. Graphics options menu
**What:** Settings panel with: Frame rate (Auto/60/30/15), Render scale
(100/75/50%), Reduce motion (off/on), Foliage detail (Full/Simple). Persist in
localStorage (NOT the save object — device preference, not game state).
**Where:** ui.js for the panel (mirror the existing Menu dropdown pattern);
frame rate override sets the adaptive tier directly (see `_renderIntervalTier`,
gameEngine.js — expose a setter like the existing `_resetRenderPacing`);
render scale multiplies `mapCanvas.width/height` down + CSS-scales up
(see the devicePixelRatio handling in worldMap.js's renderWorldMap for the
pattern); reduce-motion gates screen shake/melee lunge/floating-text drift at
their call sites; foliage Simple skips the `getSeasonalLeafTint` recolor in
hexMap.js's renderTerrainPass.
**Verify:** each toggle's observable effect asserted in a test (e.g. reduce
motion on → `_screenShakeUntil` never set).

### B2. Safe-area insets for notched iPhones
**What:** The Capacitor WKWebView draws under the notch/home indicator. Add
`viewport-fit=cover` to the viewport meta and pad the fixed UI bars with
`env(safe-area-inset-*)` in style.css.
**Verify:** manual on-device; CSS presence test at minimum.

### B3. Save export/import
**What:** A "Copy save code" / "Paste save code" pair in the menu
(base64 of the save JSON) so players can move a save between Safari testing
and the installed app (separate localStorage origins) or between devices.
**Where:** persistence.js (serialize already exists — wrap it), ui.js menu.
**Verify:** round-trip test: export, wipe, import, assert party/quests intact.

## C. Performance (only if the device week shows it's still needed)

### C1. Entity-render culling
`renderEntities()` iterates all entities every frame. Skip entities whose hex
is outside the current `getVisibleHexes()` bounds (cheap bbox check) before
any sprite work.

### C2. drawMap water/fog pass into the buffer era
The water overlay + fog dim still run per-hex per-frame. Fog could render into
its own small offscreen layer refreshed only when `visibleHexes` actually
changes (player moved a hex, not a pixel).

## D. NPC AI polish

### D1. Wolf pack coordination
Wolves in the same spawn group should share their `knownOpponents` maps
(pack telepathy-lite: one wolf spots you, the pack converges) — the perception
memory system (gameEngine.js `knownOpponents`) already stores per-entity maps;
add a `packId` set at spawn and a merge step in the perception update.

### D2. Guards react to nearby world events
When worldPulse fires `bandit_activity`, village guards with `behaviorType:
'patrol'` extend their patrol radius for the next in-game day (temporary
`patrolRadiusMult` on the entity, decaying like wildernessThreatMult).
