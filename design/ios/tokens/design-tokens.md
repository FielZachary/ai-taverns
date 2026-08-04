# Design Tokens

Machine values live in `design-tokens.json`. This file explains intent and the SwiftUI mapping. Token names below are the names used throughout every spec file and every mockup's CSS.

## Palette

Taken directly from `apps/web/app/globals.css` so the iOS app is recognizably the same product.

| Token | Value | iOS usage |
|---|---|---|
| `bg` | `#120F0D` | Root background of every screen. Never pure black. |
| `panel` | `rgba(38,29,23,0.86)` (solid `#261D17`) | Cards, list rows, message blocks, sheet backgrounds. Use the solid equivalent when layered over `bg`; use the alpha value only over imagery. |
| `panelStrong` | `rgba(56,40,31,0.96)` (solid `#38281F`) | Composer, selected rows, elevated cards. |
| `line` | `rgba(226,176,93,0.24)` | The only border color. 1 pt hairlines. |
| `gold` | `#D9A94A` | The accent. Primary buttons, active states, important numbers, links. Use sparingly; if a screen is more than ~10 percent gold, it is wrong. |
| `goldBright` | `#F4CF7A` | Pressed states, streaming caret, selected segment label. |
| `ember` | `#AD472B` | Combat status, required-roll emphasis, destructive confirm. Not a general red; errors use ember too. |
| `moss` | `#5F7751` | Success, "Submitted", connection restored. |
| `ink` | `#F9EDD6` | Primary text. Never pure white. |
| `muted` | `#BCA98E` | Secondary text, placeholders, timestamps. |
| `scrim` | `rgba(7,5,3,0.62)` | Over hero/banner imagery so `ink` text always passes contrast. |

Contrast: `ink` on `bg` is ~14:1, `muted` on `panel` is ~5.6:1. Do not put `muted` on imagery without `scrim`.

## Typography

Three type voices, strictly separated:

1. Cinzel (bundle the OFL font, weights 600/700) is ceremonial. Nav titles, campaign names, wizard step titles, class/species names on art cards. Never for body text, never below 15 pt. Fallback: SF Pro semibold with 0.06em tracking.
2. New York serif (`.fontDesign(.serif)`) is the DM's voice. All DM narration at 17/26. Must respect Dynamic Type up to accessibility sizes.
3. SF Pro is the app's voice: controls, player messages, lists, captions. SF Pro Rounded semibold for stat numbers and dice results.

## Spacing, radius, sizing

Base grid is 4. Screen margin 16, card padding 14, section gap 24. Radii: cards 10, message bubbles 16, sheets 16, dice 12. All interactive elements at least 44x44 pt. Nav bar content height 52, tab bar 49, composer starts at 44 and grows to 5 lines before scrolling internally.

## SwiftUI theme layer

Implement as an enum + environment, not scattered literals:

```swift
enum TavernColor {
    static let bg = Color(hex: 0x120F0D)
    static let panel = Color(hex: 0x261D17)
    static let panelStrong = Color(hex: 0x38281F)
    static let line = Color(hex: 0xE2B05D).opacity(0.24)
    static let gold = Color(hex: 0xD9A94A)
    static let goldBright = Color(hex: 0xF4CF7A)
    static let ember = Color(hex: 0xAD472B)
    static let moss = Color(hex: 0x5F7751)
    static let ink = Color(hex: 0xF9EDD6)
    static let muted = Color(hex: 0xBCA98E)
}

extension Font {
    static func heading(_ size: CGFloat) -> Font { .custom("Cinzel", size: size) }
    static let dmProse = Font.system(size: 17, design: .serif)
}
```

Card style used everywhere a spec says "card": `panel` fill, `line` 1 pt stroke, radius 10, shadow `rgba(0,0,0,0.42)` y2 r8.

## Status pills

Reused across Play, Adventures, and Resources. Capsule, caption size (13), 10 pt horizontal padding, 4 pt vertical:

| Pill | Fill | Text/border |
|---|---|---|
| Solo | `panelStrong` | `muted` |
| Multiplayer | `panelStrong` | `gold` |
| Waiting | `panelStrong` | `muted`, animated ellipsis |
| Combat | `ember` at 25% | `ember` text, ember border |
| Submitted | `moss` at 25% | `moss` text |
| Your turn | `gold` at 20% | `gold` text |
