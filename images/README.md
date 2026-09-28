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

## Compatibility aliases

The game historically loaded many assets directly from the flat `images/` root. During the migration, those old root paths remain present as compatibility aliases to the same Git blobs. New art and new code should use the canonical folders above. Once all runtime references have migrated, the flat aliases can be removed safely.

Do not add new flat files to `images/` unless they are temporary migration aliases.
