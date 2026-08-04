import SwiftUI

struct ResourcesRootView: View {
    @EnvironmentObject private var appModel: AppModel
    let presentedFromPlay: Bool
    @Environment(\.dismiss) private var dismiss

    private var player: RoomPlayer? {
        appModel.currentPlayer()
    }

    var body: some View {
        List {
            if let player {
                NavigationLink {
                    CharacterSheetView(player: player, room: appModel.room)
                } label: {
                    CharacterSummaryCard(player: player)
                }
                .listRowBackground(Color.clear)

                resourceLinks(player: player)
            } else {
                EmptyStateView(
                    systemName: "backpack",
                    title: "No resources yet",
                    message: "Choose an active adventure to see your sheet, gear, spells, NPCs, and lore.",
                    buttonTitle: "Go to Adventures"
                ) {
                    appModel.selectedTab = .adventures
                    dismiss()
                }
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .navigationTitle("Resources")
        .toolbar {
            if presentedFromPlay {
                ToolbarItem(placement: .automatic) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .tavernScreen()
    }

    @ViewBuilder
    private func resourceLinks(player: RoomPlayer) -> some View {
        Section {
            NavigationLink("Combat Cheat Sheet") { CheatSheetView(player: player) }
            NavigationLink("Inventory") { InventoryView(player: player) }
            NavigationLink("Weapons & Spells") { WeaponsSpellsView(player: player) }
            NavigationLink("Backstory") { BackstoryView(player: player) }
            NavigationLink("NPC Cards") { NPCListView() }
            NavigationLink("Eldermere Lore") { EldermereLoreView() }
        }
        .listRowBackground(TavernTheme.panel)
        .foregroundStyle(TavernTheme.ink)
    }
}

struct CharacterSummaryCard: View {
    let player: RoomPlayer

    var body: some View {
        HStack(spacing: 12) {
            PortraitCircle(url: player.portraitUrl, size: 56)
            VStack(alignment: .leading, spacing: 5) {
                Text(player.characterName)
                    .cinzel(17)
                Text(characterSubtitle(player.characterSheet))
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
                HStack {
                    Pill("HP 27", color: TavernTheme.moss)
                    Pill("AC 16", color: TavernTheme.gold)
                }
            }
            Spacer()
        }
        .tavernCard()
    }
}

struct CharacterSheetView: View {
    let player: RoomPlayer
    let room: RoomSnapshot?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                CharacterSummaryCard(player: player)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 8) {
                    StatTile(label: "HP", value: "27")
                    StatTile(label: "AC", value: "16")
                    StatTile(label: "Init", value: "+2")
                    StatTile(label: "Speed", value: "30")
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                    ForEach(["STR +3", "DEX +2", "CON +2", "INT +0", "WIS +1", "CHA -1"], id: \.self) { stat in
                        let pieces = stat.split(separator: " ")
                        StatTile(label: String(pieces[0]), value: String(pieces[1]))
                    }
                }

                ResourceDisclosure(title: "Skills & Saves", detail: "Athletics +5, Perception +3, Constitution saves +4.")
                ResourceDisclosure(title: "Features & Traits", detail: "Second Wind, Action Surge, Fighting Style, human resilience.")
                ResourceDisclosure(title: "Attacks", detail: "Longsword +5 to hit, 1d8+3 slashing. Longbow +4 to hit, 1d8+2 piercing.")
            }
            .padding(16)
        }
        .navigationTitle("Character Sheet")
        .tavernScreen()
    }
}

struct StatTile: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(TavernTheme.goldBright)
            Text(label)
                .font(.caption2)
                .foregroundStyle(TavernTheme.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(TavernTheme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(TavernTheme.line, lineWidth: 1))
    }
}

struct CheatSheetView: View {
    @EnvironmentObject private var appModel: AppModel
    let player: RoomPlayer
    @State private var confirmingRegenerate = false

    private var entries: [String] {
        (player.combatCheatSheet ?? "")
            .components(separatedBy: "\n\n")
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !$0.hasPrefix("##") }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(metaLine)
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
                if entries.isEmpty {
                    EmptyStateView(systemName: "figure.fencing", title: "No cheat sheet yet", message: "Generate a compact guide for what this character can do now.", buttonTitle: "Generate cheat sheet") {
                        Task { await appModel.refreshCheatSheet() }
                    }
                } else {
                    ForEach(entries, id: \.self) { entry in
                        Text(cleanMarkdown(entry))
                            .font(.system(size: 14))
                            .lineSpacing(5)
                            .foregroundStyle(TavernTheme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .tavernCard()
                    }
                }
            }
            .padding(16)
        }
        .navigationTitle("Cheat Sheet")
        .toolbar {
            Button {
                confirmingRegenerate = true
            } label: {
                Image(systemName: "arrow.clockwise")
            }
        }
        .confirmationDialog("Regenerate cheat sheet?", isPresented: $confirmingRegenerate) {
            Button("Regenerate") { Task { await appModel.refreshCheatSheet() } }
            Button("Cancel", role: .cancel) {}
        }
        .tavernScreen()
    }

    private var metaLine: String {
        "Generated for \(player.characterName)"
    }
}

struct InventoryView: View {
    let player: RoomPlayer

    var body: some View {
        List {
            Section("EQUIPPED") {
                Text("Longsword · 1d8+3 slashing")
                Text("Chain mail · AC 16")
            }
            Section("PACK") {
                Text("Explorer's pack")
                Text("Copper tube · quest")
            }
            Section("COIN") {
                Text("34 gp")
            }
        }
        .navigationTitle("Inventory")
        .tavernScreen()
    }
}

struct WeaponsSpellsView: View {
    let player: RoomPlayer
    @State private var searchText = ""
    @State private var spellDetail: SpellSample?

    private let spells = [
        SpellSample(name: "Shield", level: "Level 1", school: "Abjuration", summary: "Reaction · +5 AC", effect: "An invisible barrier of magical force appears and protects you until the start of your next turn."),
        SpellSample(name: "Burning Hands", level: "Level 1", school: "Evocation", summary: "Action · 15 ft cone · Dex save", effect: "Each creature in a 15-foot cone makes a Dexterity save. A creature takes 3d6 fire damage on a failed save.")
    ]

    var body: some View {
        List {
            Section("WEAPONS") {
                ResourceDisclosure(title: "Longsword", detail: "+5 to hit · 1d8+3 slashing · versatile 1d10")
                ResourceDisclosure(title: "Longbow", detail: "+4 to hit · 1d8+2 piercing · range 150/600")
            }
            Section("SPELLS") {
                ForEach(spells) { spell in
                    Button {
                        spellDetail = spell
                    } label: {
                        VStack(alignment: .leading) {
                            Text(spell.name).font(.system(size: 15, weight: .semibold))
                            Text(spell.summary).font(.caption).foregroundStyle(TavernTheme.muted)
                        }
                    }
                }
            }
        }
        .searchable(text: $searchText)
        .navigationTitle("Weapons & Spells")
        .sheet(item: $spellDetail) { SpellDetailSheet(spell: $0) }
        .tavernScreen()
    }
}

struct SpellSample: Identifiable {
    var id: String { name }
    var name: String
    var level: String
    var school: String
    var summary: String
    var effect: String
}

struct SpellDetailSheet: View {
    let spell: SpellSample

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "sparkles")
                    .frame(width: 52, height: 52)
                    .background(TavernTheme.panelStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading) {
                    Text(spell.name).cinzel(18)
                    Text("\(spell.level) · \(spell.school)")
                        .font(.caption)
                        .foregroundStyle(TavernTheme.muted)
                }
            }
            Text(spell.effect)
                .font(.system(size: 14))
                .lineSpacing(5)
            Spacer()
        }
        .padding(20)
        .presentationDetents([.medium])
        .background(Color(hex: 0x1C1511))
    }
}

struct BackstoryView: View {
    let player: RoomPlayer

    var body: some View {
        ScrollView {
            Text("Garrick once guarded a lighthouse that should not have gone dark. Now every bell at midnight sounds like an accusation.")
                .font(.system(size: 16, design: .serif))
                .lineSpacing(7)
                .foregroundStyle(TavernTheme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
        .navigationTitle("Backstory")
        .tavernScreen()
    }
}

struct NPCListView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var npcCards: [CampaignNpcCard] = []

    var body: some View {
        List {
            if npcCards.isEmpty {
                Text("No one worth remembering yet. The DM adds cards as you meet people.")
                    .foregroundStyle(TavernTheme.muted)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(npcCards) { card in
                    NavigationLink(card.title) {
                        NPCDetailView(card: card)
                    }
                }
            }
        }
        .navigationTitle("NPC Cards")
        .task {
            guard let id = appModel.activeCampaign?.id else { return }
            npcCards = (try? await appModel.apiClient.listNpcCards(campaignId: id)) ?? []
        }
        .tavernScreen()
    }
}

struct NPCDetailView: View {
    @State var card: CampaignNpcCard
    @State private var markdown = ""

    var body: some View {
        Form {
            Section("NOTES") {
                TextEditor(text: $markdown)
                    .frame(minHeight: 180)
            }
            Section {
                HStack {
                    Circle().fill(TavernTheme.moss).frame(width: 8, height: 8)
                    Text("Synced with campaign memory")
                }
                .font(.caption)
                .foregroundStyle(TavernTheme.muted)
            }
        }
        .navigationTitle(card.title)
        .toolbar {
            Button("Save") {}
        }
        .onAppear { markdown = card.markdown }
        .tavernScreen()
    }
}

struct EldermereLoreView: View {
    var body: some View {
        List {
            Section {
                Text("The Age You Live In")
                    .cinzel(17)
                Text("Graywake keeps old secrets under salt and bell-metal. The Hush makes every oath feel overheard. Kindling moves through the world as rumor, spark, and threat.")
                    .font(.system(size: 15, design: .serif))
                    .lineSpacing(5)
            }
            Section("REGIONS") {
                NavigationLink("The Salt Concordat") { LoreDetailView(title: "The Salt Concordat") }
                NavigationLink("The Veiled Reach") { LoreDetailView(title: "The Veiled Reach") }
                NavigationLink("The Ashfell Marches") { LoreDetailView(title: "The Ashfell Marches") }
            }
            NavigationLink("Open the map of Eldermere") { MapView() }
        }
        .navigationTitle("Eldermere Lore")
        .tavernScreen()
    }
}

struct LoreDetailView: View {
    let title: String

    var body: some View {
        ScrollView {
            Text("\(title) is a playable region of Eldermere. Its roads are practical, its stories are sharp, and every local kindness has a cost worth remembering.")
                .font(.system(size: 16, design: .serif))
                .lineSpacing(7)
                .padding(16)
        }
        .navigationTitle(title)
        .tavernScreen()
    }
}

struct ResourceDisclosure: View {
    let title: String
    let detail: String

    var body: some View {
        DisclosureGroup {
            Text(detail)
                .font(.system(size: 14))
                .foregroundStyle(TavernTheme.muted)
                .padding(.top, 6)
        } label: {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
        }
        .tavernCard()
    }
}

struct PortraitCircle: View {
    let url: String?
    let size: CGFloat

    var body: some View {
        AsyncImage(url: url.flatMap(URL.init(string:))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                Image(systemName: "shield")
                    .foregroundStyle(TavernTheme.gold)
            }
        }
        .frame(width: size, height: size)
        .background(TavernTheme.panelStrong)
        .clipShape(Circle())
        .overlay(Circle().stroke(TavernTheme.line, lineWidth: 1))
    }
}

func cleanMarkdown(_ markdown: String) -> String {
    markdown
        .replacingOccurrences(of: "**", with: "")
        .replacingOccurrences(of: "## Cheat Sheet", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func characterSubtitle(_ sheet: String) -> String {
    sheet
        .split(separator: "\n")
        .dropFirst()
        .first
        .map(String.init) ?? "Adventurer"
}
