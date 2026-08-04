import SwiftUI

struct MapView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var zoom: CGFloat = 1

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            VStack(spacing: 12) {
                Spacer()
                Image(systemName: "map")
                    .font(.system(size: 88))
                    .foregroundStyle(TavernTheme.gold.opacity(0.8))
                    .scaleEffect(zoom)
                    .gesture(MagnifyGesture().onChanged { zoom = max(1, min(6, $0.magnification)) })
                Text("Eldermere")
                    .cinzel(22)
                Text("Map asset binding: apps/web/public/maps/eldermere-map.png")
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
                Spacer()
            }
            Button("Done") { dismiss() }
                .padding()
                .foregroundStyle(TavernTheme.gold)
        }
    }
}

struct PortraitViewer: View {
    let player: RoomPlayer
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                PortraitCircle(url: player.portraitUrl, size: 220)
                Text(player.characterName)
                    .cinzel(18)
                Text(characterSubtitle(player.characterSheet))
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
                Spacer()
            }
            Button("Done") { dismiss() }
                .padding()
                .foregroundStyle(TavernTheme.gold)
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var appModel: AppModel
    let showCampaignSection: Bool

    var body: some View {
        List {
            Section("DUNGEON MASTER MODEL") {
                SettingsOption(title: "DeepSeek", caption: "Balanced narration and cost.", selected: true)
                SettingsOption(title: "OpenAI", caption: "Higher polish for special tables.", selected: false)
            }

            if showCampaignSection, let campaign = appModel.activeCampaign {
                Section("THIS CAMPAIGN") {
                    HStack {
                        Text("Campaign name")
                        Spacer()
                        Text(campaign.title).foregroundStyle(TavernTheme.muted)
                    }
                    if campaign.mode == .multiplayer {
                        Button("Invite players") {}
                    }
                    Button("Restart campaign...", role: .destructive) {}
                }
            }

            Section("ACCOUNT") {
                if case .signedIn(let session) = appModel.authState {
                    HStack {
                        Text("Email")
                        Spacer()
                        Text(session.email ?? "Signed in")
                            .foregroundStyle(TavernTheme.muted)
                    }
                }
                Button("Sign out", role: .destructive) {
                    Task { await appModel.signOut() }
                }
            }

            Section {
                Text("AI Taverns iOS 1.0")
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
            }
        }
        .navigationTitle("Settings")
        .tavernScreen()
    }
}

struct SettingsOption: View {
    let title: String
    let caption: String
    let selected: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(title)
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
            }
            Spacer()
            if selected {
                Image(systemName: "checkmark")
                    .foregroundStyle(TavernTheme.gold)
            }
        }
    }
}

extension View {
    @ViewBuilder
    func mapPresentation(isPresented: Binding<Bool>) -> some View {
        #if os(iOS)
        self.fullScreenCover(isPresented: isPresented) {
            MapView()
        }
        #else
        self.sheet(isPresented: isPresented) {
            MapView()
        }
        #endif
    }
}
