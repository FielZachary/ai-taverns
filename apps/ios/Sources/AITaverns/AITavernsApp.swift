import SwiftUI

@main
struct AITavernsApp: App {
    @StateObject private var appModel = AppModel(
        apiClient: APIClient(
            configuration: APIConfiguration(
                baseURL: URL(string: ProcessInfo.processInfo.environment["AI_TAVERNS_API_BASE_URL"] ?? "http://localhost:3001")!
            )
        )
    )

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appModel)
                .preferredColorScheme(.dark)
        }
    }
}
