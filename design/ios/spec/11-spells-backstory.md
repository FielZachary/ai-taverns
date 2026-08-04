# S11 Weapons & Spells, Spell Detail, Backstory — Spec

Mockup: `screens/11-resources-spells-backstory.html`.

## 11a Weapons & Spells

Search field at top filters both groups. Sections: WEAPONS (rows: glyph, name 14/600, stat line 12 `muted` "+5 to hit · 1d8+3 slashing · versatile 1d10"); SPELLS grouped by level, each level header row carries a slot pill "Slots N/M" (`gold` when full, `muted` as spent; cantrips have no pill). Spell rows: 40 pt archetype thumbnail, name, one-line summary with action type and key numbers, chevron -> 11b. Row summaries should answer 80 percent of questions without opening the sheet. Weapons tap: expand in place to show properties (no sheet needed).

## 11b Spell detail sheet

`.sheet`, medium detent. Header: 52 pt archetype art (r10), name Cinzel 18, "Level N · School" caption. Fact grid 2x2, left-aligned stat cards: CASTING TIME, RANGE, DURATION, and the fourth cell is ROLL / SAVE / DC as applicable (attack roll spells show "Spell attack +X"). Effect prose 14/1.55 with all numbers `goldBright` semibold. Upcast note appended as a caption when relevant. This exact component is reused by the wizard spell picker (08a).

## 11c Backstory

Pure serif reading view: 16/1.65 `ink`, 16 margins, no cards. Scrolls. Read-only in v1. If empty: centered muted "No backstory written." with a caption noting it can be added when creating a character (editing existing backstory is a v2 item; keep the API hook in mind).
