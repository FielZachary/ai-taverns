# S13 Map, Portrait Viewer, Settings — Spec

Mockup: `screens/13-overlays.html`.

## 13a Map

FullScreenCover from the Play map icon or the Lore map row. Content: `apps/web/public/maps/eldermere-map.png` (evaluate rendering `eldermere-map.svg` natively for sharp zoom; png fallback). Pinch-zoom 1x-6x, pan, double-tap zoom-in, "Done" dismisses (swipe-down also). Current-location pill (`gold`, pin icon + region name) bottom-left when the campaign has a known region (from room snapshot scene metadata); tap centers/zooms to that region using the region coordinates table ported from `eldermere-map.ts`. Non-Eldermere campaigns: map icon hidden everywhere.

## 13b Portrait viewer

FullScreenCover, black background. Portrait image `scaledToFit`, pinch-zoom, swipe-down dismiss, long-press -> iOS share sheet (save/share). Caption below: name Cinzel 18, class/species/background 13 `muted`. Entry points: Resources summary portrait, wizard review portrait, player avatars in multiplayer logs. Loading: `panel` placeholder + spinner; failure: glyph placeholder.

## 13c Settings

`.sheet`, large-ish detent (560 pt content). Three grouped cards:

1. DUNGEON MASTER MODEL: option rows from the API's model list with descriptive captions, gold check on current, tap to switch (applies to the current campaign; PATCH campaign). This replaces the web composer's model settings popover.
2. THIS CAMPAIGN (only when opened from Play with an active campaign): Campaign name (rename alert -> PATCH), Invite players (multiplayer host only: shows code, opens share sheet + invite management: list/disable via invite endpoints), Restart campaign… in `ember`-tinted text -> destructive alert "Restart this campaign? All progress is erased. Your character is kept." -> POST `/api/campaigns/:id/restart` with the edited/reused backstory payload -> dismiss, S3 reloads with the restarted campaign's fresh opening. This replaces the web composer's restart control. Regenerate response remains a separate message action using `/api/campaigns/:id/regenerate`.
3. ACCOUNT: email row (static), Sign out (`ember` text; clears Keychain session + POST signout, return to S1).

Footer caption: app version. The Settings tab root (Tab 4) shows the same view minus THIS CAMPAIGN, plus DM model as account default.
