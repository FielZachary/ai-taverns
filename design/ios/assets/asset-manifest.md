# Asset Manifest

All paths are repo-root relative. These are the existing production assets; the iOS app bundles or serves them as noted. Note the literal spaces in `assets/classes art/` and `assets/races art/`; URL-encode as `%20` where needed.

## Class art (bundle in app)

`assets/classes art/<class>.png`, one per class: artificer, barbarian, bard, blood-hunter, cleric, druid, fighter, monk, paladin, psion, ranger, rogue, sorcerer, warlock, wizard.

Used: wizard Class step grid (2-column cards, art fills card top), Resources character summary background accent. Crop focus: upper third contains the figure's face in most of these; card crops should anchor top-center.

## Species art (bundle in app)

`assets/races art/<species>.png`: dragonborn, dwarf, elf, gnome, half-elf, half-orc, halfling, human, tiefling (list from imports in `new-adventure-form.tsx`; verify directory at build time).

Used: wizard Species step grid, same card treatment as class art.

## New adventure flow art (bundle)

| Path | Used for |
|---|---|
| `apps/web/public/new-adventure/singleplayer-banner.webp` | Mode step: Single Player card art |
| `apps/web/public/new-adventure/multiplayer-banner.webp` | Mode step: Multiplayer card art |
| `apps/web/public/new-adventure/eldermere-banner.jpg` | Campaign step: Eldermere world card |
| `apps/web/public/new-adventure/custom-world-banner.jpg` | Campaign step: Custom world card |
| `apps/web/public/new-adventure/flow-bg.png` | Optional wizard ambient background (behind scrim) |
| `apps/web/public/new-adventure/options/backgrounds/*.jpg` (13) | Background picker rows (custom build) |
| `apps/web/public/new-adventure/options/skills/*.jpg` (18) | Skills picker (custom build) |
| `apps/web/public/new-adventure/options/weapons/*.jpg` (37) | Equipment picker |
| `apps/web/public/new-adventure/options/tools/*.jpg` (10) | Equipment/proficiency picker |

## Spells

`apps/web/public/spell-archetypes/*.webp` (36 archetypes: acid, alchemy, beast, charm, communication, creation, curse, darkness, divination, earth, fear, fire, force, frost, gravity, healing, illusion, light, lightning, luck-time, movement, nature, necrotic, poison, psychic, radiant, shield, sleep, sound, summoning, teleport, transformation, ward, water, weapon, wind). Used as 40 pt thumbnails in spell picker rows and spell detail sheets. Mapping from spell -> archetype lives in `new-adventure-form.tsx`.

## Play surface

| Path | Used for |
|---|---|
| `apps/web/public/avatars/dungeon-master.jpg` | DM avatar (28 pt circle) in message log |
| `apps/web/public/maps/eldermere-map.png` | Map sheet raster (pinch-zoom) |
| `apps/web/public/maps/eldermere-map.svg` | Preferred map source if rendered natively |
| `apps/web/public/audio/dice-roll.mp3` | Dice roll sound |
| `apps/web/public/auth/viking-warrior-auth.png` | Auth screen hero art |

## Custom fantasy UI icons

`design/ios/assets/icons/*.svg` contains the custom monochrome fantasy icon set used by the HTML mockups instead of platform glyph placeholders. The mockups reference these files through `_frame.css` mask classes such as `fi-map`, `fi-pack`, `fi-dice`, `fi-swords`, `fi-scroll`, `fi-shield`, and `fi-castle`. In SwiftUI, port these as template-rendered symbols so each screen can tint them with `gold`, `muted`, `ember`, or `moss`.

## Explicitly NOT ported

`apps/web/public/fantasygothicui/*` (web-only ornamental button chrome; iOS uses native card/button styles), `apps/web/public/landing*` (marketing page, web-only), `apps/web/public/vendor/dice-box-threejs.umd.js` (web 3D dice; iOS v1 uses native animation, see spec 05), `closing-animation-fast.mp4` (evaluate for wizard completion in v2).

## Character portraits

Generated/uploaded per character, served by API (portrait endpoints in Phase 9 of the port plan). Not bundled. Mockups show a placeholder circle; treat as async remote image with `panel` placeholder.
