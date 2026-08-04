# S1 Auth — Spec

Mockup: `screens/01-auth.html`. Full screen, presented when no valid session exists. No tab bar.

## 01a Welcome / Sign in

Layout (top to bottom, 393 pt frame):

| Region | Geometry | Content |
|---|---|---|
| Hero art | fills frame, behind everything | `apps/web/public/auth/viking-warrior-auth.png`, `scaledToFill`, scrim gradient: 35% dark at top, 88% dark from y≈580 to bottom |
| Wordmark | left 24, bottom-anchored group starting ≈y 480 | "AI TAVERNS" Cinzel 34/700, tracking 0.08em, `ink` |
| Tagline | below wordmark, 12 gap | serif 17, `muted`, "An AI Dungeon Master. Your table, anywhere." |
| Google button | 24 margin, h50, r10 | light fill `#F4EFE6`, dark text, Google G mark. Follows Google sign-in branding |
| Email field | h50, r22, `panelStrong` + `line` border | placeholder "Email address", keyboard `.emailAddress`, autocap off |
| Magic link button | h50, `gold` fill, text `#241505` | "Send magic link"; disabled until valid email |
| Legal | caption 12 `muted`, centered | Terms & privacy line |
| Bottom padding | 60 above home indicator | |

Behavior: Google -> `ASWebAuthenticationSession` against the Fastify-owned Google start/callback flow (`/api/auth/google/start` -> `/api/auth/google/callback`, bridged for mobile universal-link return). On callback the app exchanges the completed Fastify session for a mobile session credential stored in Keychain; this mobile bridge must be added before native implementation if it does not yet exist. Magic link -> POST to the passwordless start endpoint (`/api/auth/passwordless/start`), then push 01b; universal-link verification calls the passwordless verify endpoint (`/api/auth/passwordless/verify`) and stores the same Keychain credential. Keyboard: group slides up, hero scrim darkens to keep contrast. Errors (invalid email, network) show inline under the field in `ember`, 13 pt.

## 01b Magic link sent

Centered vertical stack, 32 side margins: envelope glyph in a 76 pt circle (`panel` fill, `gold` border), "Check your email" Cinzel 22, explanation 15 pt `muted` with the submitted address in `ink` semibold, "Resend link" small button (36 pt, disabled 30 s with countdown "Resend in 0:24"), "Wrong address? Go back" caption with gold link back to 01a.

Universal link: tapping the emailed link opens the app via associated domain, exchanges the login token, stores session, and routes to the Play tab (Adventures tab if the account has no campaigns). If the link is expired, return to 01a with an inline `ember` notice "That link expired. Send a new one."

## Accessibility

All text Dynamic Type. Google/magic buttons are 50 pt targets. Hero art is decorative (`accessibilityHidden`). VoiceOver order: wordmark, tagline, Google, email, send, legal.
