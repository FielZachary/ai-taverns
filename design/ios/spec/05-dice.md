# S5 Dice Sheet — Spec

Mockup: `screens/05-dice.html`. `.sheet` with `.presentationDetents([.medium])`, background `#1C1511`, r16 top corners, grabber visible. Web sources: dice popover in `PlayerInput.tsx`, `game-shell-dice.ts` (faces d4 d6 d8 d10 d12 d20).

## 05a Free roll

Opened from composer dice button (enabled only in Turn mode, unlocked composer). Title "Roll the Dice" Cinzel 16 centered. Die row: six 52 pt tiles (r12, `panelStrong`, `line` border) labeled d4–d20. Tap = add one of that face (count badge, gold circle 20 pt, top-right, max total 10); long-press tile = clear that face; selected tiles gold border + `goldBright` label. Summary row: "Rolling: 2 × d20" pill + "Clear" gold pill. Gold Roll button (h50) disabled until at least one die selected. Footer caption: "Results are posted to the table for the DM to see."

Roll animation: tiles shake 0.6 s, play `apps/web/public/audio/dice-roll.mp3` (respect silent switch), then transition to 05c. `.medium` impact haptic per die settle (stagger 80 ms). No Three.js port; SceneKit dice are a v2 consideration.

## 05b Required roll

Triggered by `pendingRollRequests` (auto-present once + from 04b button). Content from `DiceRollRequest`: label (e.g. "Dexterity Saving Throw"), die face, modifier, DC when player-visible. Ember "Roll required" pill, Cinzel 18 title, formula line 14 with modifier/DC in `goldBright`. Single large 84 pt die tile (non-interactive), gold "Roll d20" button. No die picker, no Clear. Swipe-dismiss allowed; requirement persists via 04b card. If multiple requests: header "Roll 1 of 2", advance in place after each Continue.

## 05c Result

96 pt result die showing raw face value, gold glow (`rgba(217,169,74,0.35)` 24 blur). Math line: "17 +2 = **19** vs DC 14" (total `goldBright` 18/700). Outcome pill only when DC known: `moss` Success / `ember` Failure. Free rolls with multiple dice: horizontal row of result dice (52 pt) + total line; no outcome pill. Continue button: POST `/api/room/roll` with idempotency key; on success dismiss sheet, log gains a system capsule "Garrick rolled 19 · Dex save vs DC 14 — success", DM resolution streams next. On network failure keep sheet open, button becomes "Retry" with `ember` caption.

Rolls are generated client-side in v1 (same trust model as web); server records submitted values. If backend later adds server-side rolling, only the animation timing changes.
