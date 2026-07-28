# AI Taverns iOS

Native SwiftUI client for AI Taverns.

This app is intentionally separate from the Next.js web app. It talks directly
to the existing Fastify API and treats the web app as a behavioral reference,
not a UI template.

## Local Setup

1. Open `AITaverns.xcodeproj` in Xcode.
2. Edit the `API Base URL` field in the in-app settings if your API is not
   running at `http://localhost:4000`.
3. Run the `AITaverns` scheme on an iOS simulator.

For a simulator talking to a local Fastify server on the Mac, `localhost` maps
to the Mac host, so the default base URL works with `npm run dev:api`.

## Architecture

```txt
AITavernsApp.swift      SwiftUI app entry point
AppState.swift          Session, campaign, and room orchestration
APIClient.swift         REST and WebSocket client for apps/api
Models.swift            Codable mirrors of packages/contracts
DesignSystem.swift      Shared native styling primitives
CampaignLibraryView     Home, recent campaigns, join entry
NewAdventureView        Native campaign creation flow
GameRoomView            Message timeline and turn composer
DiceRollerView          Native dice submission sheet
CharacterSheetView      Character sheet viewer/editor surface
SettingsView            API origin and session controls
```

## Boundary

Keep iOS-only code in `apps/ios`. Shared API or backend work belongs in
`packages/contracts` or `apps/api`, but should only be added when the native app
needs a stable mobile contract that does not already exist.
