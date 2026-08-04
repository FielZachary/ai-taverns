# S3 Play Screen — Spec

Mockup: `screens/03-play-screen.html`. Tab 1 root. Web sources: `GameShell.tsx`, `MessageLog.tsx`, `PlayerInput.tsx`, `game-shell-state.ts`.

## Structure

```text
NavigationBar (52)   title + mode pill | map · resources · settings icon buttons (34pt, r10)
MessageLog (flex)    inverted-friendly ScrollView, 16 side padding, 14 gap
Composer (>=104)     mode segment + dice row, input row; bottom safe-area padded
TabBar               hidden when keyboard visible
```

## Nav bar

Title Cinzel 17, single line, truncate tail; beneath it a 2 pt-padded mode pill (Solo/Multiplayer; Combat pill replaces it during combat, see S4). Tap title -> Adventures tab. Icon buttons: map -> S13a sheet; resources (backpack) -> S9 as `.sheet` with `.presentationDetents([.large])` so play context is never lost; gear -> S13c.

## Message rendering

Message model: role `player | dm | system`, kind `normal | ask_dm_question | ask_dm_answer`, author, locationTag, content (markdown subset: bold, italics).

| Type | Treatment |
|---|---|
| DM | full-width block. Header: 28 pt circular avatar (`apps/web/public/avatars/dungeon-master.jpg`), name "Dungeon Master" Cinzel-tone gold 12, "· location" `muted`. Body: serif 17/26 `ink`; markdown bold renders `goldBright` semibold (numbers, dice, names) |
| Player | right-aligned bubble, max width 78%, `panelStrong` fill, `line` border, r16 with 4 pt tail corner, SF 15/1.45 |
| System | centered capsule, caption 12 `muted`, `panel` fill (chapter markers, joins, restarts) |
| Ask-DM question | player bubble geometry but dashed `line` border, `muted` text, "Ask DM:" prefix |
| Ask-DM answer | DM block but 2 pt gold left rule, serif 15 `muted`, header tag "· aside" |

Long DM responses render as one block; no card chrome. Paragraph gap 6 pt.

## Scrolling rules

Keep scroll position stable when messages prepend (history pagination: load older on pull-down). Auto-scroll to bottom on new message or stream token only if the user is within 120 pt of bottom; otherwise show floating "↓ New response" gold pill above the composer (tap = scroll to bottom, dismiss). Preserve position across Resources/map/settings sheet presentation and app background/foreground.

## Streaming

WS events: `dm_stream_started` creates a DM block with "· writing…" header; `dm_stream_delta` appends into the serif body with a `goldBright` caret (8x16); `dm_stream_done` finalizes (caret removed, header shows location); `dm_stream_failed` replaces the block with a system-style error capsule "The DM lost the thread. Try again." + retry button. While streaming: composer disabled (field placeholder "The DM is narrating…", send `off` state, dice/segment at 50% opacity).

## Composer

Two rows, `rgba(38,29,23,0.92)` background, top hairline, bottom safe-area padding:

1. Segment `Turn | Ask DM` (150 pt wide) left; spacer; dice icon button right. `Skip` appears between spacer and dice only when skipping is legal (multiplayer, not ask mode, not locked, no pending roll) as a small 36 pt text button.
2. Text field (min 44, r22, `panelStrong`, placeholder "What do you do?" / ask variant) + 44 pt circular send. Field grows to 5 lines then scrolls internally. Send gold when text non-empty, else `off`.

Mode is per-campaign local state; ask mode restyles the field dashed and disables dice. Draft text persists per campaign across backgrounding (S10 phase: local only, never auto-submits).

Submit: POST turn or ask-dm endpoint with idempotency key; optimistic player bubble at 60% opacity until snapshot confirms (then full opacity) or fails (bubble gets `ember` "Tap to retry" footnote). Haptic: `.success` notification on accepted turn submit.

## Data

Initial paint from cached `RoomSnapshot`; then `GET /api/room?campaignId=`; live via WS `/api/room/live?roomId&sessionId` handling `room_snapshot`, `room_updated`, `dm_stream_*`, heartbeat, error. Fallback: 25 s REST poll when WS is down (see S4d reconnecting bar).

## Empty state (no active campaign)

Mirror of S2c: "No adventure underway", button "Choose an adventure" -> Adventures tab.
