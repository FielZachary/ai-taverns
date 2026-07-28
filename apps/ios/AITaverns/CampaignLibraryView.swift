import SwiftUI

struct CampaignLibraryView: View {
    @Environment(AppState.self) private var appState
    @State private var isCreatingAdventure = false
    @State private var isShowingJoin = false
    @State private var isShowingSettings = false

    var body: some View {
        @Bindable var appState = appState

        NavigationSplitView {
            List(selection: $appState.selectedCampaign) {
                Section {
                    Button {
                        isCreatingAdventure = true
                    } label: {
                        Label("New Adventure", systemImage: "plus.circle.fill")
                    }

                    Button {
                        isShowingJoin = true
                    } label: {
                        Label("Join Campaign", systemImage: "person.badge.plus")
                    }
                }

                Section("Campaigns") {
                    if appState.campaigns.isEmpty && !appState.isLoadingCampaigns {
                        Text("No campaigns yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(appState.campaigns) { campaign in
                            CampaignRow(campaign: campaign)
                                .tag(campaign)
                        }
                    }
                }
            }
            .navigationTitle("AI Taverns")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        isShowingSettings = true
                    } label: {
                        Image(systemName: "gear")
                    }
                    .accessibilityLabel("Settings")
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await appState.refreshCampaigns() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel("Refresh campaigns")
                }
            }
            .overlay(alignment: .bottom) {
                if let message = appState.errorMessage {
                    ErrorBanner(message: message) {
                        appState.errorMessage = nil
                    }
                }
            }
        } detail: {
            if let campaign = appState.selectedCampaign {
                GameRoomView(campaign: campaign)
            } else {
                EmptyStateView(
                    systemImage: "bubble.left.and.bubble.right",
                    title: "Choose a campaign",
                    message: "Continue an adventure, create a new one, or join a table."
                )
            }
        }
        .task {
            await appState.refreshCampaigns()
        }
        .onChange(of: appState.selectedCampaign) { _, campaign in
            guard let campaign else {
                appState.disconnectRealtime()
                return
            }

            Task { await appState.selectCampaign(campaign) }
        }
        .sheet(isPresented: $isCreatingAdventure) {
            NewAdventureView()
        }
        .sheet(isPresented: $isShowingJoin) {
            JoinCampaignView()
        }
        .sheet(isPresented: $isShowingSettings) {
            SettingsView()
        }
    }
}

private struct CampaignRow: View {
    let campaign: CampaignSummary

    var body: some View {
        HStack(spacing: 12) {
            CampaignThumbnail(campaign: campaign)

            VStack(alignment: .leading, spacing: 4) {
                Text(campaign.title)
                    .font(.headline)
                    .lineLimit(1)

                Text(campaign.preview?.trimmedOrNil ?? campaign.mode.title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Label(campaign.mode.title, systemImage: campaign.mode == .multiplayer ? "person.3" : "person")

                    if let count = campaign.messageCount {
                        Label("\(count)", systemImage: "text.bubble")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct JoinCampaignView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var characterName = ""
    @State private var characterSheet = ""

    var body: some View {
        NavigationStack {
            Form {
                NativeSection(title: "Invite") {
                    TextField("Join code", text: $code)
                        .textInputAutocapitalization(.characters)
                }

                NativeSection(title: "Character") {
                    TextField("Character name", text: $characterName)
                    TextEditor(text: $characterSheet)
                        .frame(minHeight: 180)
                }
            }
            .navigationTitle("Join Campaign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Join") {
                        Task {
                            await appState.joinCampaign(
                                code: code,
                                characterName: characterName,
                                characterSheet: characterSheet
                            )
                            if appState.errorMessage == nil {
                                dismiss()
                            }
                        }
                    }
                    .disabled(code.trimmedOrNil == nil || appState.isSending)
                }
            }
        }
    }
}
