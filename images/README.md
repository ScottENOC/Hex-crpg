# Image asset layout

This directory is organised by what an image represents rather than by the code that happens to load it.

## Canonical folders

- `characters/` — player/NPC bodies, hair, named NPC art, monsters and animals.
  - Directional compositor art remains under species/gender folders such as `characters/human_female/`.
  - `characters/legacy/` contains older single-image humanoid sprites still used by legacy rendering paths.
  - `characters/creatures/` contains monsters and animals.
  - `characters/npcs/` contains named or role-specific NPC art.
- `equipment/` — armour, clothing, helmets, shields, weapons, mount equipment and accessories.
- `terrain/bases/` — ground/floor/water/path textures used as terrain bases.
- `props/` — furniture, structures, vegetation, resources, effects and small world/item props.
- `scrap/` — archived/unused art retained for reference only; runtime code must not depend on it.

## Legacy URL migration

Physical flat-file aliases have been removed from `images/`. `assetLoadScheduler.js` translates historical `images/<file>` requests to the canonical folders before the browser starts the request. This keeps older call sites working while ensuring network traffic and new development use the organised tree.

New code and new art must use canonical paths directly. Do not add new flat files to `images/`.
