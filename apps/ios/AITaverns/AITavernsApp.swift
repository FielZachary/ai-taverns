import SwiftUI

@main
struct AITavernsApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            CampaignLibraryView()
                .environment(appState)
        }
    }
}
