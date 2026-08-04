# S9 Resources Root & Character Sheet — Spec

Mockup: `screens/09-resources-root-sheet.html`. Web source: `CharacterSheetOverlay.tsx` (7 tabs: character_sheet, cheat_sheet, inventory, weapons_spells, backstory, npc_cards, eldermere_lore). On iOS the tab strip becomes a drill-in list.

## Presentation contexts

1. Tab 3 root (NavigationStack, large title "Resources").
2. From Play (backpack icon): identical content in a `.sheet` with `.presentationDetents([.large])`, grabber, trailing "Done". Play scroll position and draft are preserved beneath.

## 09a Root

Character summary card: 56 pt portrait circle (async remote portrait; placeholder glyph), name Cinzel 17, class/subclass/level/species caption, live pills HP (moss; ember below 25%) and AC. Tap -> 09b. Section rows (card, 12 pt padding, icon + 15/600 label + chevron): Combat Cheat Sheet, Inventory, Weapons & Spells, Backstory, NPC Cards (trailing count pill), Eldermere Lore (only for Eldermere campaigns). Order fixed, matching web tab order minus character sheet (promoted to the summary card).

Empty context: if no active campaign, show the S2c-style empty state pointing at Adventures.

## 09b Character Sheet

Header card: 64 pt portrait, name, class/level, species/background. Stat grids: core 4-up (HP live, AC, initiative, speed), abilities 3x2 with modifier in caption ("STR +2"). Values SF Rounded 20/700 `goldBright`, captions 11 `muted`.

Below, a grouped drill list replacing web tables: Skills & Saves -> searchable grouped list (skills grouped by ability, proficiency dot in gold, save bonuses at top); Features & Traits -> expandable rows (name + source caption, expands to description prose); Attacks -> stacked rows "Longsword · +5 to hit · 1d8+3 slashing" with inline preview of the primary weapon on the drill row itself.

Data: character sheet payload from room/campaign endpoints (same parsed structure the web overlay uses). HP updates live from combat/room state. Read-only in v1 (no editing character stats on iOS).
