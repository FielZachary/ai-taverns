# Navigation Map

App structure, every screen, and every transition. Screen IDs (`S1`...) are referenced by the spec files.

## Top level

```text
App launch
├─ no session  -> S1 Auth (full screen, no tabs)
└─ session     -> TabView
   ├─ Tab 1: Play        (S3/S4) NavigationStack
   ├─ Tab 2: Adventures  (S2)    NavigationStack
   ├─ Tab 3: Resources   (S9-S12) NavigationStack
   └─ Tab 4: Settings    (S13c)  NavigationStack
```

Tab bar rules: hidden when keyboard is visible on Play; hidden inside the New Adventure wizard (full-screen cover); Resources tab shows the active campaign's character. If no campaign is active, Play and Resources show empty states pointing to Adventures.

## Screens

| ID | Screen | Container | Mockup / spec |
|---|---|---|---|
| S1 | Auth (Google + magic link + sent state) | full screen | 01 |
| S2 | Adventure list (+ empty state, swipe actions) | Tab 2 root | 02 |
| S3 | Play: default, streaming, ask-DM | Tab 1 root | 03 |
| S4 | Play states: waiting, roll-required, combat, submitted | Tab 1 root variants | 04 |
| S5 | Dice bottom sheet (free + required + result) | sheet over S3/S4 | 05 |
| S6 | Wizard: Mode, Campaign, Multiplayer/Join | full-screen cover, NavigationStack | 06 |
| S7 | Wizard: Build, Class, Species, Stats | wizard stack | 07 |
| S8 | Wizard: Spells, Equipment, Identity/Review, Preparing | wizard stack | 08 |
| S9 | Resources root list + Character Sheet | Tab 3 | 09 |
| S10 | Cheat Sheet + Inventory | Tab 3 push | 10 |
| S11 | Weapons & Spells (+ spell detail sheet) + Backstory | Tab 3 push | 11 |
| S12 | NPC Cards (list + detail) + Eldermere Lore | Tab 3 push | 12 |
| S13 | Map sheet (a), Portrait viewer (b), Settings (c) | sheets/fullScreenCover | 13 |

## Transitions

```text
S1 --sign in success--------------------> TabView (Play)
S1 --magic link tapped (universal link)-> TabView (Play)

S2 --tap campaign row-------------------> S3 (activates campaign, switches to Play tab)
S2 --plus button------------------------> S6 wizard (fullScreenCover)
S2 --swipe row left---------------------> Rename / Archive actions
S2 --pull to refresh--------------------> reload campaign list

S3 --nav bar Resources icon-------------> S9 presented as sheet (large detent) NOT tab switch,
                                          so play context is preserved; Resources tab remains
                                          for browsing outside play
S3 --nav bar map icon-------------------> S13a map sheet
S3 --nav bar title tap------------------> campaign switcher: switches to Adventures tab
S3 --dice icon in composer--------------> S5 dice sheet (medium detent)
S3 --roll required state----------------> S5 auto-presents (required variant, swipe-dismiss
                                          allowed; composer remains locked until rolled)
S3 --tap portrait/avatar----------------> S13b portrait viewer (fullScreenCover, zoomable)
S3 --gear icon--------------------------> S13c settings sheet

S6 -> S7 -> S8 push order (see spec 06 for branch logic: multiplayer inserts
Multiplayer intent + Game Code steps; custom world inserts Custom World step;
custom build expands character sub-steps)
S8 --Start Adventure--------------------> Preparing loader -> dismiss cover -> S3 with new campaign

S12 NPC detail --Save-------------------> PATCH then pop
S13c --Restart campaign-----------------> destructive confirm alert -> POST restart -> S3
S13c --Sign out-------------------------> S1
```

## State-driven Play variants (S3/S4)

The Play screen is one view whose composer region swaps by room state, priority order:

```text
1. pendingRollRequests non-empty  -> required-roll card (04b) + auto dice sheet
2. current player submitted OR room resolving -> submitted/waiting bar (04d)
3. combat active, not your turn   -> combat waiting pill + disabled composer (04c)
4. otherwise                      -> normal composer (03a), Turn or Ask DM mode
```

Streaming (`dm_stream_*` events) renders inside the message log regardless of composer state. WebSocket drop shows a "Reconnecting" capsule under the nav bar (04d note); send disabled until restored; 25 s REST poll fallback.
