# AI Taverns iOS Design Package

Agent-readable design source for the native SwiftUI iOS port. This package is the design authority for the iOS implementation. Read this file first, then tokens, then the spec for whatever screen you are building. The HTML mockups are the visual ground truth; the spec files are the dimensional and behavioral ground truth. When they disagree, the spec wins and the disagreement should be reported.

## How to consume this package

1. Read `tokens/design-tokens.md` (and `design-tokens.json` for machine values). Every color, font, spacing, and radius in the mockups comes from these tokens. Build the SwiftUI theme layer first.
2. Read `flows/navigation-map.md` for the app structure: tabs, stacks, sheets, and every transition between screens.
3. Read `assets/asset-manifest.md` for the exact repo paths of every reusable art asset and where each is used.
4. For each screen: open `screens/<name>.html` in a browser to see the frames, and read `spec/<name>.md` for exact layout regions, component mapping, states, and data bindings.
5. Mockup frames are 393 x 852 CSS px = 393 x 852 pt (iPhone 16/17 baseline). 1 px in the mockup = 1 pt in SwiftUI. Design scales down to iPhone SE (375 pt) and up to Pro Max (440 pt); specs note anything that reflows.

## File map

```text
design/ios/
├─ README.md                      this file
├─ tokens/
│  ├─ design-tokens.json          machine-readable tokens
│  └─ design-tokens.md            token rationale + SwiftUI mapping
├─ assets/
│  └─ asset-manifest.md           repo paths for all art, per-screen usage
├─ flows/
│  └─ navigation-map.md           app structure, tabs, sheets, transitions
├─ screens/                       HTML mockups (open in browser)
│  ├─ _frame.css                  shared phone-frame styles for all mockups
│  ├─ 01-auth.html
│  ├─ 02-adventure-list.html
│  ├─ 03-play-screen.html
│  ├─ 04-play-states.html
│  ├─ 05-dice.html
│  ├─ 06-wizard-mode-campaign.html
│  ├─ 07-wizard-character.html
│  ├─ 08-wizard-finish.html
│  ├─ 09-resources-root-sheet.html
│  ├─ 10-resources-combat-inventory.html
│  ├─ 11-resources-spells-backstory.html
│  ├─ 12-npc-lore.html
│  └─ 13-overlays.html
└─ spec/                          one spec per mockup file, same numbering
   ├─ 01-auth.md ... 13-overlays.md
```

## Design principles (binding)

1. Chat-first. The player spends 80 percent of their time in the Play loop: read DM prose, type action, roll when asked, peek at resources in a sheet, return exactly where they were. Nothing may interrupt that loop with navigation resets.
2. Native, not ported. Segmented controls, sheets, navigation stacks, swipe actions, context menus. No hover states, no popovers, no desktop 3-column layouts. Minimum tap target 44 pt.
3. Dark fantasy, restrained. Keep the palette (charcoal, gold, parchment ink) but drop decorative density. Fantasy serif (Cinzel) for headings and campaign titles only. DM prose uses New York (serif) via `.serif` font design. All controls use SF Pro.
4. Dark mode only in v1. Respect Dynamic Type for all body text; DM prose must scale.
5. Server is authoritative. Every mutation shown in the UI is optimistic-with-confirmation against the Fastify API; specs mark which elements render server state vs local state.

## Source references (web app ground truth)

- Tokens: `apps/web/app/globals.css` (`:root` custom properties)
- Play shell and state machine: `apps/web/components/playing/GameShell.tsx`, `game-shell-state.ts`
- Composer: `apps/web/components/playing/PlayerInput.tsx`
- Messages: `apps/web/components/playing/MessageLog.tsx`
- Campaign list: `apps/web/components/playing/ChatHistorySidebar.tsx`
- Resources: `apps/web/components/playing/CharacterSheetOverlay.tsx`
- Wizard: `apps/web/app/new-adventure/new-adventure-form.tsx`
- Runtime behavior: Pageden `ai-taverns/02-architecture/ai-dm-runtime-architecture.md`
- Cheat sheet rules: Pageden `ai-taverns/03-implementation/player-combat-cheat-sheet.md`
- Auth model: Pageden `ai-taverns/90-decisions/0007-fastify-owned-auth-sessions.md`

## Non-goals for the implementing agent

Do not design new features, rename product concepts, or change copy tone. Do not port the web debug modal, the marketing landing page, or the Three.js dice reveal. Where a spec says "defer", leave a stub.
