# S8 Wizard: Spells, Equipment, Identity/Review, Preparing — Spec

Mockup: `screens/08-wizard-finish.html`.

## 08a Spells

Shown only for casting classes (web behavior; class spell lists incl. base + DLC sourced from `new-adventure-form.tsx`). Sectioned list: "Cantrips", "Level 1" (etc. by class), each with a count pill "N of M chosen" (`gold` when satisfied). Search field filters all sections. Row: 40 pt archetype thumbnail (`apps/web/public/spell-archetypes/<archetype>.webp`, mapping from the web form), name 15/600, one-line summary 12 `muted` with dice/range, trailing toggle (✓ gold when chosen, ○ muted). Tap toggle = select (disabled when section full); tap row body = spell detail sheet (S11 grammar: casting time, range, duration, school, roll/save/DC, effect). Continue enabled when every section is satisfied.

## 08b Equipment

Series of choices driven by the class's equipment choice list ("Choice N of M" caption). Each choice: 2-column art cards (h150, `options/weapons/*.jpg` or `options/tools/*.jpg`), label = item name Cinzel 13 + damage die caption. Single-select per choice, auto-advance to next choice on selection (back arrow steps back through choices). Final summary screen lists everything granted (chosen + fixed kit) as grouped rows before Continue. Custom build additionally passes Proficiencies / Background / Skills steps before Equipment, using the same list/row grammar with art thumbnails from `options/backgrounds` and `options/skills`.

## 08c Identity & Review

Top card: 64 pt portrait circle (placeholder shield glyph) + name text field (required, default suggested name) + portrait actions row: Generate (gold, async job with progress ring on the avatar; survives navigation), Upload (photo picker), Skip. Review cards: CHARACTER (class/subclass/level, species, background, six stats, key equipment) and CAMPAIGN (world, mode, tone); each card tap jumps back to that step preserving all other choices. Backstory link opens a full-screen plain editor with a Generate option. Bottom button "Start Adventure" (join flow: "Join the Table").

Submit: create campaign + character via existing endpoints (`POST /api/campaigns` etc.), then `POST /api/room/begin` as applicable; on success push 08d.

## 08d Preparing

Full-screen loader: 88 pt ring (gold arc rotating), "Preparing your table…" Cinzel 20, rotating serif italic status line every ~4 s from a fixed list ("The Dungeon Master is sketching the opening scene…", "Lighting the candles…", "Consulting the old maps…", "Waking the innkeep…"). Non-cancelable for the first 20 s, then a subtle "This is taking a while… Keep waiting / Cancel" affordance. Success: dismiss the wizard cover; S3 shows the opening scene streaming. Failure: replace status with `ember` message + Retry; draft and created campaign state preserved so retry does not duplicate (idempotency key on begin).

Multiplayer create: after the campaign exists, 08d is preceded by a "Table ready" interstitial showing the game code (large, monospaced, tap to copy) + iOS share sheet button + "Begin adventure" (host decides when to start; players who joined appear as pills as they arrive, via room snapshot polling).
