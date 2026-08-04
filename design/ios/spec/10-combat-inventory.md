# S10 Combat Cheat Sheet & Inventory — Spec

Mockup: `screens/10-resources-combat-inventory.html`. Canonical behavior: Pageden `ai-taverns/03-implementation/player-combat-cheat-sheet.md`.

## 10a Cheat Sheet

Nav: back, "Cheat Sheet", trailing regenerate (↻, 34 pt). Meta line: "Generated <date> · for <name>, <class> <level>" caption 12. Content: the stored `## Cheat Sheet` markdown, one card per entry (bold-prefixed paragraph). Card: `panel`, r10, 14 padding; body 14/1.6 `ink`; markdown bold renders `goldBright` semibold (feature names and all numbers, matching content rules: damage dice, bonuses, DCs, AC, uses).

Behavior (binding, from Pageden doc): reuse stored sheet when source hash matches; if none exists show 10b and generate on demand; regenerate only on explicit user tap with confirm dialog; never silently replace. During regeneration keep the old cards visible under a subtle overlay + progress caption. Cache last sheet locally for offline read.

This surface is reachable in one tap from the 04c combat strip; it must render instantly from cache.

## 10b Missing state

Centered: crossed-swords glyph, "No cheat sheet yet" Cinzel 18, pitch line 14 `muted`, gold "Generate cheat sheet". Progress: button becomes inline progress "Studying your sheet…". Failure: `ember` retry card; existing cache untouched.

## 10c Inventory

Grouped sections with 12 pt uppercase `muted` captions: EQUIPPED (weapons/armor rows with damage/AC trailing caption), PACK (item rows, quantity as "×N", quest items get gold "· quest" tag), COIN (pills: gp gold, sp/cp muted). Rows 44 pt min, hairline separators inside one card per section. Read-only in v1; state comes from the character/room payload and updates when the DM runtime patches inventory. Empty pack: single muted row "Nothing but lint."
