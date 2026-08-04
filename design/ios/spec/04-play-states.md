# S4 Play States — Spec

Mockup: `screens/04-play-states.html`. These are composer-region variants of S3; the message log never changes shape. State source: `RoomSnapshot` + WS events, logic mirrored from `game-shell-state.ts`.

## State machine (composer region)

Priority order, first match wins:

```text
1. pendingRollRequests.length > 0            -> 04b required-roll card
2. currentPlayer.status == "submitted"
   || room.isResolving                       -> 04a submitted/waiting bar (multiplayer)
                                                or "DM is thinking" disabled composer (solo)
3. combat active && actor != currentPlayer   -> 04c combat wait
4. else                                      -> S3 normal composer
```

Streaming overlays any state in the log. Reconnecting (04d) is an independent connection banner, not a composer state.

## 04a Submitted / waiting (multiplayer)

Status card above the disabled field: one pill per player. Self: `moss` "You · Submitted ✓". Others: `panelStrong` pill "Name · thinking…" with animated ellipsis. Data: room players array (status `waiting | submitted`), live-updated by `room_updated`. Disabled field placeholder "Waiting for the party…". When all submit, server resolves -> stream begins -> card is replaced by streaming state.

## 04b Roll required

Card replaces entire composer: `ember` 60% border, `ember` 12% fill, r10. Row: 44 pt die tile, title 15/700 (e.g. "Dexterity Saving Throw"), subtitle 13 `muted` "d20 + 2 · DC 14" (formula from `DiceRollRequest`: die, modifier, DC when visible). Gold button "Roll d20" (h46) -> S5 required mode. Auto-present S5 once when the state first appears + `.warning` haptic. Sheet swipe-dismiss allowed, but composer stays in this state until rolled. Multiple requests: card shows "1 of 2", queue in order.

## 04c Combat

Nav mode pill -> `combat` pill with swords icon and "Combat · Round N". Sticky combat strip pinned under nav bar inside the scroll area: horizontal ScrollView of actor pills, party as "Name HP/Max" (moss when healthy, ember below 25%), enemies grouped "Bandit ×2" in `combat` pill style. Data from combat context in snapshot. Tap strip -> Resources sheet opened to Cheat Sheet. Composer variant when not your turn: status card "Marra's turn" turn-pill + "You're next" caption, disabled field "Waiting for Marra…". On your turn: normal composer + gold "Your turn" pill, `.success` haptic once.

## 04d Reconnecting

WS closed/erroring: centered capsule under nav "↻ Reconnecting…" (`panelStrong`, spinner), send disabled, draft preserved, dice/segment 50% opacity. Start 25 s REST polling immediately. On recovery: capsule -> `moss` "Connected" 1.5 s, fade, request fresh snapshot. On app foreground always reconnect WS and refresh snapshot before enabling send.

## Solo "DM is thinking"

Between turn submit and stream start (`isResolving`), solo campaigns show disabled composer with placeholder "The DM is thinking…" and a subtle 3-dot shimmer in the log where the DM block will appear.
