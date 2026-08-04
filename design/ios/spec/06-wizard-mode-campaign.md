# S6 Wizard: Mode & Campaign — Spec

Mockup: `screens/06-wizard-mode-campaign.html`. FullScreenCover with its own NavigationStack; tab bar hidden throughout. Web source: `new-adventure-form.tsx` (step arrays lines ~241–267).

## Flow branches (from web, binding)

```text
Solo:                     Mode -> Campaign -> Character -> Review
Solo custom world:        Mode -> Campaign -> Custom World -> Character -> Review
Multiplayer create:       Mode -> Multiplayer -> Campaign -> Character -> Review
Multiplayer create custom:Mode -> Multiplayer -> Campaign -> Custom World -> Character -> Review
Join:                     Mode -> Multiplayer -> Game Code -> Character -> Review
```

"Character" expands into sub-steps (spec 07/08). Step counter shows top-level steps only ("Step 2 of 4"); character sub-steps get their own counter ("Class · 2 of 7").

## Chrome (all wizard screens)

Nav: close ✕ (first screen; confirm-discard dialog if any input) or back ‹; centered "New Adventure" Cinzel 17 over "Step N of M" caption 12 `muted`. Content: 16 margins, question title Cinzel 20. Bottom: full-width primary gold button pinned above home indicator, disabled until the step is valid. Progress state persists if the app backgrounds mid-wizard.

## 06a Mode

Two banner cards (h150, r10): Single Player (`singleplayer-banner.webp`), Multiplayer (`multiplayer-banner.webp`), bottom gradient scrim, Cinzel 17 label + 13 `muted` subtitle. Selected = 2 pt gold border. Continue enabled on selection.

## 06b Multiplayer intent

Two plain cards: "Create a new table" / "Join with a game code". Selecting Join reveals a code field: h50, centered, auto-uppercase, `.asciiCapable`, paste-friendly; Continue validates against the invite/join API before push (spinner in button; invalid -> inline `ember` "That code isn't valid or the table is full"). Join flow: code success -> Character (host's campaign settings are shown read-only on Review).

## 06c Campaign

World cards: Eldermere (`eldermere-banner.jpg`, flagship, default selected) and Custom World (`custom-world-banner.jpg`). Custom selection inserts the Custom World step: genre preset grid (from `campaignGenres` in the web form) + world description text area with "Open full editor" for long text. Below world cards: optional "Tone & details" multi-line field (r12, grows to 4 lines then offers full-screen editor). All values map to the existing campaign creation payload of `POST /api/campaigns`.

## Multiplayer extras (create path)

After campaign creation on Review (spec 08), host gets the game code + share sheet; invites use the existing invite create/disable/list endpoints. No separate wizard screen for invites in v1.
