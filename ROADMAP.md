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

## E. Adaptive music (engine shipped; these are the follow-ons)

The layered-stem music director is implemented (`musicDirector.js` — read
its header comment first) with two palettes (wilderness, village), faction
dominance, day/night, combat, threat, stealth, and unrest inputs, all
covered by `tests/music-director.spec.js`. The audio *files* are being
produced by the project owner per `audio/music/MUSIC_ASSETS.md` — do not
generate or commit placeholder audio. Remaining code tasks:

### E1. Register faction POIs as the world provides them
**What:** `window.musicPOIs` maps faction keys (`crown`, `guild`, `church`,
`greenskin`, `necro`) to a hex; proximity leans the town mix toward that
faction. Register the ones that exist: the chapel (search campaign2World.js
for the chapel build; key `church`), the goblin camp center once allied
(`greenskin` -> `window.campaign2GoblinCampCenter`), Silverhart palace/manor
when in Silverhart (`crown`), the Ironbond-relevant tavern (`guild`).
**Where:** at each build site in campaign2World.js, one line:
`window.musicPOIs.church = { ...chapelCenter };`
**Verify:** extend tests/music-director.spec.js: after scene setup, the POI
keys exist and `computeFactionDominance` at that hex exceeds the baseline.

### E2. Menu music for Campaign 2
**What:** `updateMusicState` (ui.js) plays the arena `title` track for every
menu. Keep that for campaign 1; for campaign 2, opening a full-screen menu
should just duck the director's master gain (add a
`window.setMusicDirectorDucked(true/false)` that ramps `_masterGain` to 30%)
instead of switching to the arena title theme — the world's music
continuing quietly under a menu feels alive; a hard swap doesn't.
**Where:** musicDirector.js (small exported setter), ui.js's
updateMusicState campaign-2 branch.
**Verify:** test that the setter changes the internal target without error.

### E3. Interior filtering
**What:** Inside a building (`findInteriorRegion` truthy), the outdoor mix
should sound muffled: route `_masterGain` through a BiquadFilterNode
(lowpass, ~800Hz when indoors, bypassed/22kHz outdoors), ramped like every
other transition. One node, inserted once at context creation.
**Where:** musicDirector.js `_ensureContext` + `_tickMusicDirectorInner`.
**Verify:** test that the filter frequency target differs indoors vs out
(expose a `window._getMusicFilterHz()` debug getter).

### E4. Combat stingers
**What:** On combat start in campaign 2, fire a one-shot brass hit
(`audio/music/combat_start_sting.wav`, listed for the owner to record) via
the existing `playSting` pattern, layered over the director's combat ramp.
**Where:** wherever `isInCombat` flips true (search gameEngine.js for the
combat-start message), guarded by campaign === '2'.
**Verify:** spy on playSting in a test; assert one call per combat start.

## F. Fix the Silverhart palace complex's wall/floor integrity (tracked bug)

`tests/building-integrity-audit.spec.js` is a general audit that walks every
`window.interiorRegions` entry in the whole game checking for a complete
wall ring, an intact floor, and a real door (with a structural exception for
a keep legitimately nested inside its own fort's courtyard, e.g. Northwatch/
Ridgehold). Three of its four checks are currently marked `test.fail()` —
**remove those three annotations once this section is done; the assertions
underneath already encode the real requirement (`expect(result).toEqual([])`)
and don't need to change.**

**Status: mostly fixed.** This started as ~230 breach cells across ~12
regions; two structural fixes closed nearly all of it:
1. `sealRoom` (campaign2World.js) now updates a region's own
   `wallHexes`/`floorHexes` bookkeeping whenever an `extraDoorHexes` entry
   turns out to be one of that region's own wall-ring cells (the
   "door sits on the floor's edge, the wall ring is one hex further out"
   pattern used by the tower and the Queen's bedroom) — fixed via a new
   `openWallGap(region, hex, floorType)` helper, also applied directly to
   `bedroomWallGap`.
2. `reconcileRegionWallBookkeeping()` (campaign2World.js), called once
   right after `connectAllRoadNetworks()` in `setupVillageScene`: any
   region's wall hex whose actual terrain is now `Path` (a street
   legitimately overwriting a building's front wall — "the street always
   wins over a wall it fronts", an intentional convention already used
   elsewhere) gets reclassified as floor instead of flagged as broken.

**What's left (~18 breach cells, 3 regions):** the stable/manor buildings
(a couple of stray cells, one of them `Water` — likely a stream corner
clipping a building footprint) and Ridgehold Fort's/the Orc Stronghold's
own inner keep, where the keep's *own* wall reads back as `Wood Floor` —
this is likely a real order-of-operations bug (the fort's own floor stamp
running after the keep's wall was carved) rather than the door-apron
pattern above, and needs its own look rather than reusing `openWallGap`.
The missing-door region and the floor-breach test have shrunk the same way;
re-run the audit to see current exact counts.

**How to keep going:** run the audit test locally
(`npx playwright test tests/building-integrity-audit.spec.js`), temporarily
comment out its three `test.fail();` lines so the real failures print with
exact `{idx, q, r, terrain}` coordinates, then check each against
`buildRidgeholdFort`/`buildOrcStronghold` (the keep-wall-vs-fort-floor
order of painting) and the stable/manor building code for the couple of
remaining stray cells. Re-run after each fix.

**Verify:** all four `building-integrity-audit.spec.js` tests pass with the
`test.fail()` annotations removed. Also do one manual browser walk of the
palace interior (enter every room via its door) since the audit checks
terrain correctness, not "is this room walkably enclosed" in a way a player
would notice a visual seam.

## G. Populate the Silverhart capital city + Thieves' Guild

The city currently has: the palace complex, a Merchant Quarter (stable,
general goods, clothier, magic shop), a Noble Quarter (Corstane manor,
Master Builder Hallis's hexagon house, a neighbor house), a curtain wall at
`CITY_WALL_RADIUS` (60 hexes from the throne), and a ring road. That's a
fraction of what a capital should feel like. This section is the big
content build the player asked for; it's scoped into independent, buildable
pieces.

### G1. Thieves' Guild + its own reputation track
**What:** A hidden-in-plain-sight guild (a "legitimate" front business at
street level — a pawnshop or a fence's stall — with a real guild hall
reachable through a back room or a password-gated door), run by a Guildmaster
NPC. A new reputation track, same shape as `factions.js`'s existing standing
system: `window.factions.thieves_guild = { standing: 0 }`, gated content at
standing thresholds (0: refused/watched; 20: accepted odd jobs; 50: full
member, access to the fence's real prices and guild quests; -20 or below:
hostile, guild enforcers sent after the player — mirrors the existing
Ironbond/goblin faction-hostility patterns).
**Where:** new building in the capital (pick a spot in the "Warrens" district
already stubbed at `warrensRow` — search campaign2World.js), a new
`window.campaign2ThievesGuildmaster` NPC in campaign2Content.js, dialogue
tree in campaign2Dialogue.js, faction entry in factions.js.
**Verify:** tests for standing thresholds gating dialogue/fence access, same
style as `tests/goblin-reactivity.spec.js`.

### G2. Guild quests (3-4, escalating trust)
1. **Initiation**: steal a specific item from a named Merchant Quarter NPC
   without being caught (reuses the stealth/detection primitives from the
   goblin-camp stealth path — search `isPlayerStealthed`/`hasLineOfSight`
   usage in the existing stealth-resolution quest code for the pattern).
2. **A Favor for the Guild**: intimidate or bribe a Noble Quarter NPC into
   silence about something (reuses `leverage.js`'s persuasion system).
3. **Blood Price**: assassinate a rival informant (mirrors the existing
   goblin-camp assassination path's structure).
4. **The Big Score**: a multi-step heist against the palace treasury or a
   noble's vault — the capstone, gated on guild standing ≥50.
Each should move `thieves_guild` standing and, for the more visible ones,
cascade a small `hollowmere`/`aldervale` security or `silverhart_kingdom`
reputation hit (getting caught helping thieves has consequences with the
Crown) — reuse `cascadeReputation`/`adjustRegionStat`, already-established
patterns.

### G3. Fill out the city to the walls
**What:** More streets, more named buildings between the existing districts
and `CITY_WALL_RADIUS` — a proper Warrens/slum district (the thieves' guild's
natural neighborhood), a temple district (the church faction musicDirector.js
already expects a POI for — see ROADMAP section E1), a docks/market square,
several unnamed flavor houses (no interior needed for all of them — a locked
door + a one-line "just a home" note is fine for background buildings).
**Guard rails:** run `tests/building-integrity-audit.spec.js` after adding
each new building — that's exactly what it's for now.
**Scattered outlying buildings:** a handful of buildings between the ring
road and the curtain wall that aren't part of a tight district grid — a
lone farmstead-style plot, a hermit's shack — reachable but not part of the
street grid, for the "doesn't feel gridded/artificial" texture the player
asked for.

### G4. Flavor NPCs, shops, taverns, and a few fights
**What:** At least one real tavern (with a barkeep, a rumor-hook option
mirroring Garrick's — see worldPulse.js's `getRecentWorldRumors` pattern,
filtered to a `silverhart` or `crown` regionId once G1's district exists),
2-3 more shops with distinct personalities (not just restocked copies of the
Merchant Quarter's existing four), and a handful of street encounters —
a pickpocket who tries to steal from the player (a light combat/skill-check
mini-scene), a City Watch patrol that reacts if the player is
`isShunnedByHumanCommerce` (see campaign2World.js) inside the walls.

### G5. Reuse checklist before building any of the above
Before adding new mechanics, check for an existing pattern to reuse — this
codebase has one for nearly everything already: faction standing
(factions.js), region security/prosperity (regions.js), world events
(worldPulse.js), stealth detection (search the goblin-camp stealth quest),
persuasion (leverage.js), NPC daily schedules (`getNpcSchedules`,
gameEngine.js), shop inventories (search `campaign2SilverhartGeneralGoods`
for the limited-stock shop pattern). Don't invent a second version of any
of these.

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
