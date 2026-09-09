# Silverhart Saga — Presentation & Visual Identity Roadmap

This roadmap is deliberately biased toward making the systems already in the game *feel visible, alive and readable* before adding another large layer of mechanics. Existing behaviour wins over generic roadmap examples: e.g. doors already open/close, so when we reach environmental animation we improve the transition/feedback rather than re-implementing the mechanic.

## Principles

1. **Do not trade iPhone playability for decoration.** Every visual system needs a cheap LOD/fallback.
2. **Data-driven character art.** Race/body differences belong in rigs/anchors, not scattered one-off pixel offsets.
3. **Readability before fidelity.** At tactical zoom, silhouettes/roles matter more than tiny detail.
4. **Reuse systems before adding content.** Make combat, equipment, NPCs, factions and world state more legible before inventing more systems.
5. **Test visually and mechanically.** Campaign 4 already exists as a sprite-overlay test scene; extend it as the visual regression playground.

---

## V1. Character rig foundation — NOW

### V1.1 Deformable armour mesh
Replace the current single-rectangle armour stretch with body anchors. First mesh uses six points:
- shoulder left/right
- waist left/right
- hem left/right

Each armour image maps its source rectangle through two vertical strips (four affine triangles). This allows short/wide dwarves, tall/narrow elves, broad orcs, etc. to reuse the same armour art while being squeezed/stretched non-uniformly.

**Performance:** below 0.55 zoom, use the original one-draw rectangle because the deformation is not readable at that scale.

**Debug:** backtick anchor overlay shows the mesh points in addition to hand anchors.

### V1.2 Extend the rig beyond armour
Once armour is visually tuned in Campaign 4:
- helmet/head anchor
- main/off-hand grip anchors
- back/cloak anchor
- belt/waist anchor
- feet/ground anchor
- optional shoulder anchors for pauldrons/quivers

Move existing `mainHand`, `offHand`, `helm`, `shieldOffset`, etc. toward the same canonical rig vocabulary rather than keeping parallel systems indefinitely.

### V1.3 Asset authoring metadata
Give equipment art optional source-anchor metadata so future art is not assumed to fill the entire image rectangle. This matters for transparent padding, asymmetric weapons and armour with unusual silhouettes.

---

## V2. Facing and directional sprites

Start with **4 logical facings using 3 art directions**:
- up
- down
- side (mirror for left/right)

Track facing on movement and attacks. Do not require 8-direction art initially.

Rig anchors become facing-aware (`front`, `back`, `side`) so shield/weapon/hair layering can change correctly. Existing nondirectional sprites remain valid as a fallback.

**Deliverable:** player, ordinary humanoid NPCs and equipment overlays face the direction of travel/attack without requiring every monster to be redrawn at once.

---

## V3. Minimal animation / game feel

### Characters
- subtle idle/breath motion
- 2–4 frame walk where art exists; procedural bob/lean fallback where it does not
- attack lunge/swing
- hit recoil/flash
- knockdown/death transition

### Environment
Improve existing reactive objects rather than duplicating mechanics:
- smoother door transition/feedback (doors already function)
- fire/torch flicker refinement
- water shimmer
- foliage motion where affordable
- spell/light pulses

### Combat feedback
- clearer impact flashes
- block/parry sparks
- directional recoil
- projectile trails where readable
- strong-hit micro-pause/screenshake, honouring Reduce Motion

---

## V4. NPC visual identity

Procedural variation for ordinary humanoids:
- skin tone
- hair colour/style as assets become available
- clothing palette
- beard/accessory layer where available
- equipment silhouette
- small deterministic scale/build variation if it does not break collision/readability

Named NPCs get authored overrides so important people remain instantly recognisable.

Goal: a town should look like a population, not clones wearing different labels.

---

## V5. Depth without moving to 3D

Use 2D depth cues rather than replacing the engine:
- contact shadows under entities
- tall-object overlap/depth ordering
- front lips/shadows on walls/platforms
- canopy/roof layers that can partially occlude characters
- stronger height cues for walls, bridges, stairs and ramparts
- lighting that visibly affects nearby sprites/props

This should preserve the current hex/canvas engine and its mobile performance characteristics.

---

## V6. Zoom-dependent presentation

### Close zoom
- full equipment layers
- animation
- shadows
- particles/effects
- detailed combat feedback

### Tactical zoom
- simpler silhouettes
- reduce/disable tiny particles
- simpler armour deformation if necessary
- role/faction markers over unreadable micro-detail
- preserve stable frame time

This is both a graphics improvement and a performance feature.

---

## V7. iPhone performance guardrails

Continue real-device testing on iPhone 17. Optimise measured bottlenecks, not hypothetical ones.

Track:
- render frame ms
- visible entities
- active effects/particles
- visible hex count
- entity update/pathfinding cost

Likely next optimisations if needed:
- entity render culling outside viewport
- fog/water layer caching
- offscreen NPC update throttling
- bounded/evictable recoloured sprite cache
- cap ambient effects on mobile

Target graceful degradation before removing features.

---

## V8. Features after presentation foundation

Do not stop feature development indefinitely. Once the visual foundation is stable, prioritise features that make existing systems easier to use:
- tactical pause / command queue for mobile
- improved formation/stance orders
- named-NPC/reputation reactivity
- equipment presentation/cosmetic progression
- companion identity/banter surfacing

Large new mechanical systems should compete against these on player value, not be added automatically because the simulation can support them.

---

## Suggested implementation order

1. Deformable armour rig + Campaign 4 tuning
2. Canonical anchors for hands/head/shield
3. Facing state + 3-direction humanoid rendering
4. Minimal idle/walk/attack/hit animation
5. NPC variation
6. Depth/shadows/environment reaction pass
7. Zoom-dependent LOD refinement and iPhone profiling
8. Tactical/mobile interaction features
