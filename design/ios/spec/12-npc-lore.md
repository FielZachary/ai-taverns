# S12 NPC Cards & Eldermere Lore — Spec

Mockup: `screens/12-npc-lore.html`.

## 12a NPC list

Data: NPC card list endpoint (`CampaignNpcCard`: name, location, disposition, lastSeen, notes, portrait?). Rows: 44 pt portrait circle (glyph fallback), name 15/600, "location · last seen X" caption, disposition pill (Friendly `moss`, Wary/Hostile `combat`, Neutral/Unknown `muted`). Sort by lastSeen desc. Empty: "No one worth remembering yet — the DM adds cards as you meet people."

## 12b NPC detail (edit)

Nav: Cancel (gold text) | name Cinzel 17 | Save (gold bold, disabled until dirty). Sections as cards: DISPOSITION (4-option segment), LOCATION (single-line field), NOTES (multi-line editor, grows). Explicit save model, binding: no autosave; Cancel with dirty state prompts "Discard changes?". Save -> PATCH NPC card with optimistic UI.

Sync state line, always visible bottom-center: `moss` "● Synced with campaign memory", `gold` "● Saving…", `ember` "● Couldn't save — tap to retry". Rationale: these edits feed DM-visible campaign context (see runtime architecture doc), so the player must know whether the DM will see them.

## 12c Eldermere Lore

Only for Eldermere campaigns. Top card: THE AGE YOU LIVE IN, 3-sentence serif summary (Graywake, Hush, Kindling in `goldBright`), content sourced from the same lore constants the web overlay uses (`eldermereCommonLore` in `CharacterSheetOverlay.tsx`). REGIONS: drill rows (glyph, name, one-line hook) -> region detail page: serif reading view (11c grammar) with the region's lore text. Final gold-bordered row "Open the map of Eldermere" -> S13a. Static bundled content; no network.
