import SwiftUI

struct AdventureListView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var searchText = ""
    @State private var showingWizard = false

    private var filteredCampaigns: [CampaignSummary] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return appModel.campaigns }
        return appModel.campaigns.filter {
            $0.title.lowercased().contains(query) || ($0.preview ?? "").lowercased().contains(query)
        }
    }

    var body: some View {
        List {
            if filteredCampaigns.isEmpty {
                EmptyStateView(
                    systemName: "castle",
                    title: "No adventures yet",
                    message: "Begin a new adventure or join a table with a code.",
                    buttonTitle: "Begin a new adventure"
                ) {
                    showingWizard = true
                }
                .listRowBackground(Color.clear)
            } else {
                ForEach(filteredCampaigns) { campaign in
                    Button {
                        Task { await appModel.activateCampaign(campaign) }
                    } label: {
                        AdventureRow(campaign: campaign, isActive: campaign.id == appModel.activeCampaign?.id)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button("Archive", role: .destructive) {}
                        Button("Rename") {}
                            .tint(TavernTheme.gold)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            }
        }
        .listStyle(.plain)
        .searchable(text: $searchText, prompt: "Search adventures")
        .refreshable { await appModel.refreshCampaigns() }
        .navigationTitle("Adventures")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    showingWizard = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingWizard) {
            NewAdventureWizard()
        }
        .tavernScreen()
    }
}

struct AdventureRow: View {
    let campaign: CampaignSummary
    let isActive: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(campaign.title)
                    .cinzel(16)
                    .lineLimit(1)
                Spacer()
                if isActive {
                    Pill("Active", color: TavernTheme.gold)
                }
            }

            Text(campaign.preview ?? "The table is quiet.")
                .font(.system(size: 14, design: campaign.preview?.hasPrefix("DM:") == true ? .serif : .default))
                .foregroundStyle(TavernTheme.muted)
                .lineLimit(1)

            HStack {
                Pill(campaign.mode.label, color: campaign.mode == .multiplayer ? TavernTheme.gold : TavernTheme.muted)
                if campaign.preview?.lowercased().contains("waiting") == true {
                    Pill("Waiting", color: TavernTheme.ember)
                }
                Spacer()
                Text(campaign.time ?? "")
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
            }
        }
        .tavernCard()
        .overlay(
            RoundedRectangle(cornerRadius: TavernTheme.cardRadius, style: .continuous)
                .stroke(isActive ? TavernTheme.gold : Color.clear, lineWidth: 1.5)
        )
    }
}

struct Pill: View {
    let text: String
    let color: Color

    init(_ text: String, color: Color) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }
}

struct EmptyStateView: View {
    let systemName: String
    let title: String
    let message: String
    let buttonTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemName)
                .font(.system(size: 44))
                .foregroundStyle(TavernTheme.goldBright)
            Text(title)
                .cinzel(20)
            Text(message)
                .font(.system(size: 15))
                .foregroundStyle(TavernTheme.muted)
                .multilineTextAlignment(.center)
            Button(buttonTitle, action: action)
                .buttonStyle(GoldButtonStyle())
        }
        .frame(maxWidth: .infinity, minHeight: 360)
        .padding(.horizontal, 20)
    }
}
