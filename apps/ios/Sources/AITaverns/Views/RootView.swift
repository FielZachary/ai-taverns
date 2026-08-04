import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        Group {
            switch appModel.authState {
            case .signedOut:
                AuthView()
            case .signedIn:
                MainTabView()
            }
        }
        .task {
            await appModel.bootstrap()
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        TabView(selection: $appModel.selectedTab) {
            NavigationStack {
                PlayView()
            }
            .tabItem { Label("Play", systemImage: "text.bubble") }
            .tag(AppModel.Tab.play)

            NavigationStack {
                AdventureListView()
            }
            .tabItem { Label("Adventures", systemImage: "book.closed") }
            .tag(AppModel.Tab.adventures)

            NavigationStack {
                ResourcesRootView(presentedFromPlay: false)
            }
            .tabItem { Label("Resources", systemImage: "backpack") }
            .tag(AppModel.Tab.resources)

            NavigationStack {
                SettingsView(showCampaignSection: false)
            }
            .tabItem { Label("Settings", systemImage: "gearshape") }
            .tag(AppModel.Tab.settings)
        }
        .tint(TavernTheme.gold)
    }
}
