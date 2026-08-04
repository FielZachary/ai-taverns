# S7 Wizard: Character (Build, Class, Species, Stats) — Spec

Mockup: `screens/07-wizard-character.html`. Character sub-steps inside the wizard stack. Sub-step counter format "Class · 2 of 7". Web source: `new-adventure-form.tsx` (`quickCharacterCreationSteps`, `customCharacterCreationSteps`, `classOptions`, `speciesOptions`, `speciesAbilityBonuses`).

## Sub-step orders (binding, from web)

```text
Quick:  Build, Class, Stats, Species, Spells, Equipment, Identity
Custom: Build, Class, Class Choices, Stats, Species, Spells,
        Proficiencies, Background, Skills, Equipment, Identity
```

Spells step is skipped for non-casters (web behavior); counter adjusts.

## 07a Build

Two cards: Quick build (bolt icon, default) vs Custom build (hammer icon). Card copy per mockup. Selection sets the sub-step array.

## 07b Class

2-column grid of art cards: h200, r10, art `scaledToFill` anchored top-center, bottom gradient scrim, class name Cinzel 15 centered. 15 classes, alphabetical as in web imports: Artificer, Barbarian, Bard, Blood Hunter, Cleric, Druid, Fighter, Monk, Paladin, Psion, Ranger, Rogue, Sorcerer, Warlock, Wizard. Art: `assets/classes art/<slug>.png`. Selected: 2 pt gold border + slight scale (1.02). Scroll indicator caption "15 classes".

Selection footer (pinned above Continue): card with class one-liner (`ink` name + `muted` blurb from web class descriptions) and a subclass inline menu (options = web `subclassOptions` per class, e.g. Fighter: Champion / Battle Master / Eldritch Knight). Custom build: a Class Choices sub-step follows for fighting styles and class-specific options; quick build uses defaults.

## 07c Species

Identical grammar to Class. Species from web: Human, Elf, Dwarf, Halfling, Gnome, Half-Elf, Half-Orc, Tiefling, Dragonborn. Art `assets/races art/<slug>.png`. Footer shows species ability bonuses in `goldBright` (e.g. "+2 DEX") sourced from `speciesAbilityBonuses`.

## 07d Stats

Method segmented control: Roll dice (4d6 drop lowest, six results, reroll allowed unlimited in v1) or Point buy (27 points, steppers on each tile, remaining-points caption). Six stat tiles in 3x2 grid: value SF Rounded 20/700 `goldBright`, label caption `muted`. Assignment: tap tile A then tile B swaps their scores (primary interaction); drag-swap optional. Species bonus rendered as `moss` "+2" chip inside the affected tile, applied automatically, not swappable. Hint line suggests the selected class's primary abilities. Continue blocked until all six rolled scores are assigned or points are spent to a legal spread.

## Validation and persistence

Every sub-step writes into a local `CharacterDraft`; back navigation preserves choices; leaving the wizard entirely prompts discard (draft kept in memory for the session). Payload shape matches the existing web character creation payload.
