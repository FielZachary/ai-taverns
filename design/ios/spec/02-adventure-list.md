# S2 Adventures — Spec

Mockup: `screens/02-adventure-list.html`. Tab 2 root. Replaces web `ChatHistorySidebar.tsx`.

## Data

`GET /api/campaigns` -> `[CampaignSummary]`: id, title, mode (`single_player` | `multiplayer`), lastMessagePreview (role + text), updatedAt, archived, waiting state for multiplayer. Cache last response for instant paint; refresh on appear and pull-to-refresh. Search filters locally on title + preview.

## 02a List

| Region | Geometry | Notes |
|---|---|---|
| Nav bar | large title "Adventures" Cinzel 22 | trailing gold plus button (34 pt, opens S6 fullScreenCover) |
| Search field | 16 margins, h38, r10 | `.searchable` is acceptable; style to `panelStrong` |
| Rows | card style, 10 gap, full width | see anatomy |

Row anatomy (card r10, padding 14): title Cinzel 16 single line, truncating tail; preview 14 pt `muted`, 1 line, prefix "DM:" / "You:" and serif styling when the preview is DM prose; footer row: mode pill (Solo `muted` / Multiplayer `gold`), optional Waiting pill, relative timestamp caption right-aligned. Active campaign: `gold` border + "Active" turn-pill. Multiplayer rows waiting on others show the waiting text as the preview line.

Interactions: tap -> set active campaign, switch to Play tab (S3) loading that room. Swipe trailing -> Rename (alert + text field, PATCH title), Archive (confirmation, then archive API, row removed with animation). Long-press context menu mirrors both plus "Copy invite" on multiplayer campaigns owned by the user.

Sorting: updatedAt descending. Archived campaigns hidden in v1 (no archive browser; keep API in place).

## 02c Empty state

Centered stack: castle glyph 44, "No adventures yet" Cinzel 20, supporting 15 `muted`, full-width gold "Begin a new adventure", secondary small "Join with a game code" (wizard Mode step with Join preselected).

## Loading / errors

Initial load with no cache: 3 skeleton cards (panel fill, shimmer optional). Fetch failure with cache: show cache + unobtrusive "Couldn't refresh" toast. Failure without cache: inline retry card in `ember` tone.
