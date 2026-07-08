# Hex-CRPG Campaign 2 Wiki

A quick-reference index of Campaign 2's world: NPCs, quests, locations, and factions.
Kept intentionally brief — see the code (`campaign2Content.js`, `campaign2World.js`,
`campaign2Dialogue.js`, `factions.js`) for exact numbers/dialogue text. Quest/NPC ids
below match `id`/`dialogueId` fields in code, so you can grep for them directly.

---

## Locations

Roads run out from the Hollowmere crossroads in four directions; distances are in
"world-hexes" (~130 local hexes each).

| Location | Where | What's there |
|---|---|---|
| **Hollowmere** | Start (crossroads) | Tavern, general store, chapel, house, player's buildable cottage plot. Home village. |
| **Old Mac's Farmstead** | South road, past the border | Farmhouse + pasture, sheep, broken fence → hidden wolf den further out. |
| **Skarn-tooth Goblin Camp** | West road, 1st world-hex | Chief's hut + 4 huts, campfire, scout note, captive paladin. |
| **Emberlode** | West road, 2nd world-hex (past camp) | Mining village: foreman's hall, bunkhouse, mine w/ ledger. |
| **Emberwood Grove** | Hidden, off-road past Emberlode | Druid clearing, spring, herb patches. Elder Nessa Wren. |
| **Vampire Grave** | Hidden, off-road near Emberlode | Journal-only lead (ashen fang) for the vampire quest. |
| **Abandoned House** | North road, partway to Millbrook | 3 dormant skeletons, necromancer journal, phylactery-shard altar. |
| **The Vessel-Seeker's Crypt** | Hidden, off-road past the abandoned house | 3-room dungeon (entrance/ossuary/ritual chamber): skeletons, zombies, wraiths, culminating in the boss Malachar. |
| **Millbrook** | North road, 3rd world-hex | One building; villager + the Border War quest-hook NPC. |
| **Silverhart** | North road, 4th world-hex (past Millbrook) | Capital: palace (throne/barracks/council/wizard tower/queen's chambers), Diplomatic Quarter (4 embassies + plaza + cathedral + Ironbond office), abandoned manor, merchant district. |
| **Reddale** | East road, 1st world-hex | Guardhouse, reeve's house, inn, Ironbond guildhouse, Baron's manor. |
| **Northwatch Fort** | Border road, 2nd world-hex + spur north | Star fort + keep, actively under siege (Border War). |
| **Ridgehold Fort** | Border road, 3rd world-hex (end) | Mirrored star fort, garrisoned reserve front, not besieged. |

---

## Factions

| Faction | id | Race | Ranking members |
|---|---|---|---|
| The Silverhart Kingdom | `silverhart_kingdom` | human | Queen Seraphine Corrin · Baron Corwin Aldervale · Chancellor Merric Vane · Court Wizard Thessaly · Captain Ilsa Rennick (Reddale) · Commander Ysolde Hart (Northwatch) · Reeve Aldous Finch (Reddale) · Elder Marta Wynfield (Hollowmere) |
| The Ironbond Company | `ironbond_company` | human (merchant co.) | Sergeant Dray Coltayne (Hollowmere) · Guildmaster Petra Voss (Reddale) · Factor Willem Drass (Silverhart) · Investigator Renn Ashby |
| The Skarn-tooth Tribe | `goblin_tribe` | goblin | Chief Skarnub · Lieutenant Nix Sharpear · Shaman Gralk the Bonecaster |
| The Vessel-Seeker | `necromancer_cult` | undead | Mirella Thorn (disciple, cover identity as Reddale herbalist) · Malachar (the crypt boss — a lieutenant/vessel candidate, not the necromancer itself, which stays unnamed/off-screen) |
| The Borderland Raiders | `orc_raiders` | orc | No named leadership — wilderness/siege faction behind the Border War |

Note: two espionage quests (`spy_on_guild`, `spy_on_baron`) can end in a "double-cross"
reveal — if triggered, the betrayed faction's standing floors at **-40**
(`FACTION_DOUBLE_CROSS_STANDING`).

---

## NPCs by location

**Hollowmere**
- **Garrick Holt** — Tavern Keeper (`silverhart_kingdom`) — runs paid rest; gives *Loose Ends* if the shakedown turns lethal.
- **Mira Ashbrook**, **Oskar Vinn** — tavern patrons; Oskar gives *Oskar's Wager*.
- **Wick Hallow** — Storekeeper; quest target for Ironbond's *Good for Business*.
- **Dray Coltayne** (+ enforcers Tomlin Brask, Hask Greel) — Ironbond Sergeant; runs the tavern shakedown, later gives *The Missing Courier*.
- **Yvette Marlow**, **Hendra Wells** — flavor/breadcrumb NPCs; Hendra gives *The Missing Boy*.
- **Renn Ashby** — Ironbond Investigator; arrives weeks later re: *Loose Ends*.
- **Old Mac** — Farmer (Farmstead) — gives *Wolves at the Farm*.
- **Elder Marta Wynfield** — Village Elder — gives *A Missing Locket* and *The Skarn-tooth Tribe*.
- **Tomas Wren** — Builder — handles cottage construction.

**Emberlode**
- **Corran Vale** — Foreman — gives *The Buried Road*, *Ore Road Reopened*.
- **Bettina Marrow** — Miner — flavor only.

**Reddale**
- **Captain Ilsa Rennick** — incorruptible Captain of the Watch — gives *The Missing Watch*, *Eyes on the Border*; handles the necromancer-disciple report.
- **Watchman Bram Oswick** — bribable guard.
- **Reeve Aldous Finch** — gives *Reddale's Cut*.
- **Nella Brook** — Innkeeper — gives *A Stone for Nella*.
- **Mirella Thorn** — Herbalist, secretly `necromancer_cult` — reportable or bribable.
- **Guildmaster Petra Voss** — Ironbond Factor — gives *A Look at the Ledgers*.
- **Steward Halvard Greer** — Baron's Steward — bribable.

**Silverhart (capital)**
- **Queen Seraphine Corrin** — major recurring NPC, reacts to most threads; grants a manor at high standing.
- **Chancellor Merric Vane** — flavor.
- **Court Wizard Thessaly** — owns the tome that hints at the druid grove + a corruption ledger.
- **Lady Miriel Corstane** — gives *A Noble's Grudge*.
- Shopkeepers: Ossian Fell (stablehand/horses), Mirelle Sondhe (clothier), Corvin Ashe (magic dealer), a mercenary recruiter.
- **Diplomatic Quarter**: Ambassador Elarion (elf, *A Gift of Green*), Ambassador Brokk Stonehammer (dwarf, *Coin for the Deepholds*), Ambassador Cassia Wren (*A Quiet Word*), Ambassador Toren Aldwyn (*Eyes on the Border* — Corvane variant), Factor Willem Drass (*Good for Business*), High Cleric Adelram (*Whispers of the Crimson Court*).

**Goblin Camp**
- **Chief Skarnub** — central quest NPC for *The Skarn-tooth Tribe* and its branches; later gives *A Favor for the Tribe*, *A Hand on the Inside*.
- **Nix Sharpear** — Lieutenant, brokers peace if the chief is assassinated.
- **Ser Aldric Thorne** — captive Paladin, rescuable in every resolution path; joins as a real companion.

**Millbrook**
- **Petra Hollis** — flavor.
- **Quartermaster Rurik Voss** — hooks *The Northwatch Line*.

**Northwatch / Ridgehold**
- **Commander Ysolde Hart** — gives the sally-out objective and post-siege war missions.
- Named fort soldiers (patrol/gate duty, no quests).

**Emberwood Grove**
- **Elder Nessa Wren** — gives *The Old Faith* (unicorn unlock).

---

## Quests

Each entry: **id** — title — giver — prereq/trigger — outcome(s).

### Hollowmere village
- **missing_child** — *The Missing Boy* — Hendra Wells — no prereq — find Tam Wells; resolves `wolves` (alive, better reward) or `corpse` (worse) depending on timing.
- **farm_wolves** — *Wolves at the Farm* — Old Mac — no prereq — clear the pasture wolves.
- **elder_locket** — *A Missing Locket* — Elder Marta — find the locket near the old chapel.
- **oskars_wager** — *Oskar's Wager* — Oskar Vinn — friendly non-lethal duel.
- **hidden_bodies** — *Loose Ends* — Garrick Holt — only if the shakedown fight killed the 3 Ironbond men — hide or leave the bodies (gates a later investigator visit).
- **ironbond_missing_courier** — *The Missing Courier* — Dray Coltayne — offered after a peaceful shakedown — find the courier/satchel.

### The Skarn-tooth Tribe arc (central questline)
- **goblin_threat** — *The Skarn-tooth Tribe* — Elder Marta — offered after ≥2 of [elder_locket, oskars_wager, farm_wolves, missing_child] completed. **Five resolutions**, each rescues the captive paladin:
  - `goblin_diplomacy` — goblin reputation ≥40, chief lets you broker peace.
  - `goblin_alliance` — gift the chief 60 gold, let the tribe stay (opens the greenskin-side content below).
  - `assault` — kill the chief in open combat.
  - `stealth_succession` — assassinate the chief; Nix Sharpear brokers the peace instead.
  - `betrayal` — help the tribe raid Hollowmere itself. **Point of no return** — tanks kingdom rep hard, the paladin leaves.
- **goblin_mine_raid** — *A Favor for the Tribe* — Chief Skarnub — after `goblin_alliance` — raid Emberlode's mine (hurts Emberlode badly).
- **greenskin_spy** — *A Hand on the Inside* — Chief Skarnub — after `goblin_alliance` + scout note read + mine raid done — join the greenskin assault on Northwatch. Feeds into the post-siege war-mission loop on the greenskin side.
- **buried_road** / **ore_road_reopened** — Corran Vale — resolve once `goblin_threat` is settled — reopen the west road (an ambush fires unless the resolution was peaceful diplomacy).

### Reddale arc
- **reddale_missing_watch** — Captain Ilsa Rennick — no prereq — clear 2 goblins east of town.
- **disciple_exposed** — Captain Ilsa Rennick — requires evidence found in Reddale — expose or bribe-silence Mirella Thorn (the hidden necromancer disciple).
- **necromancer_hunt** — *The Vessel-Seeker's Crypt* — Captain Ilsa Rennick — gated on `disciple_exposed` being completed — find the hidden crypt past the abandoned house and clear it: an entrance chamber (skeletons), an ossuary (zombies + a wraith), and a ritual chamber where **Malachar** (a revenant-tier named boss) waits. Defeating him resolves the quest.
  - **Outcome**: -40 `necromancer_cult` standing, +10 Hollowmere security, +100 gold, +500 exp, sets `necromancerDefeated`.
- **necromancer_lichdom** — *The Barrow of Corvin Ashgrave* — Captain Ilsa Rennick — offered 3+ in-game days after `necromancer_hunt` completes (Malachar was only ever a lieutenant; word reaches Reddale that the real necromancer, Corvin Ashgrave, finished the ritual anyway) — clear the barrow past the crypt: a guarded antechamber holding his phylactery core, then his sanctum. Killing Ashgrave before dealing with the core doesn't stick — he needs the core destroyed or bound first.
  - **Destroy the core** (`resolution: 'destroyed'`): -50 necromancer_cult standing, +15 Hollowmere security, +200 gold, +900 exp.
  - **Bind the core to yourself** (`resolution: 'claimed'`): same rewards, plus ranks in `lich_grave_chill`/`lich_withering_touch` and a further Silverhart/Ironbond standing hit — the seed of a future villain playthrough.
  - **Parley with Ashgrave mid-fight and ally instead** (`resolution: 'allied'`): skips killing him — grants `lich_deathless_flesh`, tanks Silverhart/Ironbond standing, raises necromancer_cult standing, sets `necromancerAllied`.
- **eyes_on_border** — Captain Ilsa Rennick — gated on the goblin scout note read, or `goblin_threat` resolving `assault`/`betrayal`, and after the missing watch — investigate an orc scout (can be buried by bribing a guard).
- **reddale_cut** — Reeve Aldous Finch — gated on Ironbond merchant influence ≥40 — decide how Reddale answers Ironbond's pressure.
- **a_stone_for_nella** — Nella Brook — bring a blue gem.
- **spy_on_guild** / **spy_on_baron** — Baron Aldervale / Guildmaster Voss — gated on Ironbond influence ≥40 — mirrored stealth-espionage missions; each can end in a **double-cross reveal** (see Factions).

### Silverhart / capital arc
- **wizard_vendetta** — *A Noble's Grudge* — Lady Corstane — find corruption evidence — three resolutions: side with the **noble**, the **wizard**, or report to the **queen**.
- **elven_gift**, **dwarven_toll**, **aldenreach_message**, **corvane_watch** — the four embassy fetch/deliver quests (small rep/gold/xp each).
- **ironbond_pitch** — *Good for Business* — Factor Willem Drass — get Wick Hallow to carry Ironbond stock.
- **crimson_court** — *Whispers of the Crimson Court* — High Cleric Adelram — bring the ashen fang (vampire grave lead).
- **baron_tribute** — Baron Aldervale — bring a red gem.

### Border War (Northwatch/Ridgehold)
- **border_war** — *The Northwatch Line* — Quartermaster Voss (hook) → Commander Hart (objective) — gated on the scout note read — destroy the siege engine, then the abstracted siege simulation (`siegeState`) resolves the fort's fate over time.
  - **Outcome**: whichever side you end up committed to (human or greenskin — forced by whether you attacked either side, or whoever won if you never fought) grants a companion "win or lose": a **human monk** or a **goblin rogue** (see `grantStarFortCompanion`). Also starts the post-siege **war-pressure mission loop** (`warState`) — ongoing scout/raid/hit-and-run missions offered by Commander Hart or Chief Skarnub depending on your side.

### The Old Faith (druid grove) / The Silver Trail (unicorn tracking)
- **druid_grove** — *The Old Faith* — Elder Nessa Wren — clear the feral wolf den fouling the grove's spring.
  - **Outcome**: the druids' trust, and a hint — she does **not** hand over the unicorn. Starts **unicorn_tracking**.
- **unicorn_tracking** — *The Silver Trail* — Elder Nessa Wren (hook) — the unicorn wanders a fixed loop in the wilderness southwest of the grove (`campaign2UnicornPatrolPath`). Finding it means reading its tracks: fixed `unicorn_track` tile objects along the loop, whose visibility and click-detail (direction, then direction+age) scale with **Knowledge: Nature rank** (now ranks 1-3, not a flat yes/no — rank 1 reveals only ~5% of tracks with no detail, rank 3 reveals ~70% with full direction+age). Reaching and approaching the actual unicorn (`wild_unicorn` dialogue) completes the quest.
  - **Outcome**: grants `learn_unicorn_summon` — a skill (never purchasable with skill points) letting a **unicorn** answer as your one permanent Nature animal companion. Not a party member/mount — purely a Nature-summon unlock.

---

*Generated as a project reference — brief and not exhaustive. When in doubt, grep the
quest/NPC id in `campaign2Dialogue.js` for the exact current behavior.*
