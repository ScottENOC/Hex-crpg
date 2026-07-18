# Adaptive Music Stems — Recording Spec

These files feed `musicDirector.js`, the layered "living world" music system.
All stems in a palette play **simultaneously in sync**, and the game mixes
their volumes live based on world state (combat, time of day, faction
dominance, danger). You never hear one file at a time — you hear a blend.

Drop finished files into this folder (`audio/music/`) with the exact names
below. A missing file is silently skipped, so you can add them one at a
time and hear the mix grow.

## Hard technical rules (per palette — these make or break the system)

1. **Same tempo** for every stem in a palette.
2. **Same key** for every stem in a palette.
3. **Exactly the same duration**, to the sample. Easiest method: write all
   layers in one DAW project, then export each track/group separately with
   identical start and end markers. (If durations differ even slightly, the
   loops drift apart within a minute.)
4. **Loop cleanly** — the end must flow back into the beginning with no
   click or obvious seam. Avoid long reverb tails ringing past the loop
   point (or bake the tail into the start of the loop).
5. Format: `.wav`, 44.1 kHz, 16-bit is fine. Aim for 1-2 minutes per loop
   (long enough not to feel repetitive, short enough to keep downloads sane).
6. **Mix for stacking.** Each stem should sound *incomplete* alone. Leave
   space: if every layer is full-spectrum, three layers at once turns to mud.
   Rough guide: base = rhythm/harmony bed, color layers = one register each.

Suggested palette settings (change if you like — just keep each palette
internally consistent): **Wilderness: ~90 BPM, D major/B minor.**
**Village: ~105 BPM, G major/E minor.**

## Wilderness palette (Zelda-esque orchestral, open country)

| File | What it should sound like |
|---|---|
| `wilderness_base.wav` | The always-on bed: soft strings, light harp/celesta movement. Calm, spacious, wonder-tinged. Works alone (this is what plays when nothing else is happening). |
| `wilderness_day.wav` | Bright color on top: flutes/oboes carrying a hopeful melody, occasional horn swells. Sunlit-adventure feeling. |
| `wilderness_night.wav` | Nocturnal color: sparse, high tremolo strings, distant solo cello, a little eerie but beautiful. Crossfades in as the sun sets (replaces the day layer). |
| `wilderness_threat.wav` | Low unease: sustained low-string drone, sub pulse, no melody. Fades in when the region's ambient danger rises (wolf resurgences, low security). Should be ignorable at low volume, oppressive at full. |
| `wilderness_danger.wav` | "Something's watching": taiko/percussion pattern + short string stabs. Kicks in when an enemy is visible but combat hasn't started. |
| `wilderness_combat.wav` | Full battle layer: driving percussion, brass hits, aggressive string ostinato. The pastoral layers duck automatically when this is up — this rides on top of the base bed. |
| `wilderness_stealth.wav` | Held-breath layer: very sparse — muted pizzicato, soft ticking percussion. Plays while sneaking. |

## Village palette (upbeat/funky settlement, faction-flavored)

| File | What it should sound like |
|---|---|
| `town_base.wav` | The groove bed: relaxed funky rhythm section — muted guitar/clav-ish comping, warm bass, brushed drums. Medieval-funk fusion is the vibe; works alone. |
| `town_day.wav` | Market bustle color: bright melodic hook (fiddle? recorder over the funk?), handclaps. Cheerful commerce. |
| `town_night.wav` | Tavern-hour color: smokier — walking bass fills, soft Rhodes-y pads, lazier melody. Replaces the day layer after dark. |
| `town_crown.wav` | The Queen's layer: regal brass fanfare fragments, snare flourishes — courtly confidence over the groove. Strongest near the seat of power and while the Crown dominates. |
| `town_guild.wav` | Ironbond merchants' layer: coin-counting mercantile groove — hammered dulcimer/marimba arpeggios, a slightly smug horn line. |
| `town_church.wav` | Church layer: choral pads, distant bell, organ swells. Solemn warmth. |
| `town_greenskin.wav` | Greenskin layer: tribal drums, low chant fragments, bone-rattle percussion. Takes over the low end as the tribe's influence spreads. |
| `town_necro.wav` | Necromancer layer: detuned music-box, reversed swells, cold high strings. When this dominates the town, something has gone very wrong. |
| `town_unrest.wav` | Frayed-edges layer: the base groove's rhythm but played tense — staccato low strings, irregular percussion accents. Fades in as village security collapses. |
| `town_combat.wav` | Battle-in-the-streets layer: the funk bed's tempo but weaponized — heavy drums, brass stabs. |

## How the mixing works (for context while writing)

- `base` is always at full volume in its scene.
- `day`/`night` crossfade against each other with the actual in-game sun.
- Faction layers each get a 0-1 weight from world state (story outcomes,
  reputation) plus proximity — standing near a faction's building leans the
  mix its way, so walking across town audibly shifts the sound.
- Combat snaps its layer in fast (~0.6s) and ducks the decorative layers to
  25%; everything else breathes in and out over ~2.5s.
- Start by writing the two `base` beds + `day` + `combat` for each palette —
  that alone gives location + time + battle reactivity. Add faction layers
  whenever; each one enriches the mix the moment its file exists.
