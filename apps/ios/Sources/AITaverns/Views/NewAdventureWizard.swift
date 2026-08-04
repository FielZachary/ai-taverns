import SwiftUI

struct NewAdventureWizard: View {
    @EnvironmentObject private var appModel: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = AdventureDraft()
    @State private var step: WizardStep = .mode
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(step.question)
                            .cinzel(20)
                            .padding(.top, 12)
                        content
                    }
                    .padding(16)
                }
                bottomButton
                    .padding(16)
                    .background(TavernTheme.panel.opacity(0.92))
            }
            .navigationTitle("New Adventure")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button(step == .mode ? "Close" : "Back") {
                        if step == .mode {
                            dismiss()
                        } else {
                            step = step.previous(for: draft)
                        }
                    }
                }
            }
            .tavernScreen()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .mode:
            ModeStep(draft: $draft)
        case .multiplayer:
            MultiplayerStep(draft: $draft)
        case .campaign:
            CampaignStep(draft: $draft)
        case .character:
            CharacterStep(draft: $draft)
        case .review:
            ReviewStep(draft: draft)
        case .preparing:
            PreparingStep()
        }
    }

    private var bottomButton: some View {
        Button(isSubmitting ? "Preparing..." : step.buttonTitle(for: draft)) {
            Task { await advance() }
        }
        .buttonStyle(GoldButtonStyle(disabled: !step.isValid(draft) || isSubmitting))
        .disabled(!step.isValid(draft) || isSubmitting)
    }

    private func advance() async {
        if step == .review {
            isSubmitting = true
            step = .preparing
            let campaign = await appModel.createCampaign(from: draft)
            isSubmitting = false
            if campaign != nil {
                dismiss()
                appModel.selectedTab = .play
            } else {
                step = .review
            }
            return
        }
        step = step.next(for: draft)
    }
}

enum WizardStep {
    case mode
    case multiplayer
    case campaign
    case character
    case review
    case preparing

    var question: String {
        switch self {
        case .mode: "How do you want to play?"
        case .multiplayer: "Create or join a table?"
        case .campaign: "Choose the campaign shape."
        case .character: "Build your character."
        case .review: "Review your table."
        case .preparing: "Preparing your table..."
        }
    }

    func buttonTitle(for draft: AdventureDraft) -> String {
        switch self {
        case .review:
            draft.mode == .multiplayer && draft.multiplayerIntent == .join ? "Join the Table" : "Start Adventure"
        case .preparing:
            "Preparing..."
        default:
            "Continue"
        }
    }

    func isValid(_ draft: AdventureDraft) -> Bool {
        switch self {
        case .mode:
            true
        case .multiplayer:
            draft.multiplayerIntent == .create || !draft.gameCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .campaign:
            !draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .character:
            !draft.playerName.isEmpty && !draft.characterName.isEmpty
        case .review:
            true
        case .preparing:
            false
        }
    }

    func next(for draft: AdventureDraft) -> WizardStep {
        switch self {
        case .mode:
            draft.mode == .multiplayer ? .multiplayer : .campaign
        case .multiplayer:
            .campaign
        case .campaign:
            .character
        case .character:
            .review
        case .review, .preparing:
            .preparing
        }
    }

    func previous(for draft: AdventureDraft) -> WizardStep {
        switch self {
        case .mode:
            .mode
        case .multiplayer:
            .mode
        case .campaign:
            draft.mode == .multiplayer ? .multiplayer : .mode
        case .character:
            .campaign
        case .review:
            .character
        case .preparing:
            .review
        }
    }
}

struct ModeStep: View {
    @Binding var draft: AdventureDraft

    var body: some View {
        VStack(spacing: 12) {
            WizardChoiceCard(
                title: "Single Player",
                subtitle: "A private campaign with AI Taverns as your DM.",
                systemName: "person",
                selected: draft.mode == .singlePlayer
            ) {
                draft.mode = .singlePlayer
            }
            WizardChoiceCard(
                title: "Multiplayer",
                subtitle: "Invite players and resolve party turns together.",
                systemName: "person.3",
                selected: draft.mode == .multiplayer
            ) {
                draft.mode = .multiplayer
            }
        }
    }
}

struct MultiplayerStep: View {
    @Binding var draft: AdventureDraft

    var body: some View {
        VStack(spacing: 12) {
            ForEach(MultiplayerIntent.allCases) { intent in
                WizardChoiceCard(
                    title: intent.rawValue,
                    subtitle: intent == .create ? "Host the table and share a code." : "Enter a code from your host.",
                    systemName: intent == .create ? "plus.circle" : "number",
                    selected: draft.multiplayerIntent == intent
                ) {
                    draft.multiplayerIntent = intent
                }
            }
            if draft.multiplayerIntent == .join {
                TextField("GAME CODE", text: $draft.gameCode)
                    #if os(iOS)
                    .textInputAutocapitalization(.characters)
                    #endif
                    .multilineTextAlignment(.center)
                    .font(.system(size: 22, weight: .bold, design: .monospaced))
                    .padding()
                    .background(TavernTheme.panelStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

struct CampaignStep: View {
    @Binding var draft: AdventureDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Campaign title", text: $draft.title)
                .padding()
                .background(TavernTheme.panelStrong)
                .clipShape(RoundedRectangle(cornerRadius: 10))

            WizardChoiceCard(
                title: "Eldermere",
                subtitle: "Flagship world of harbors, gods, rumors, and old debts.",
                systemName: "mountain.2",
                selected: draft.world == "Eldermere"
            ) {
                draft.world = "Eldermere"
            }
            WizardChoiceCard(
                title: "Custom World",
                subtitle: "Bring your own setting and tone.",
                systemName: "wand.and.stars",
                selected: draft.world != "Eldermere"
            ) {
                draft.world = "Custom World"
            }

            TextField("Tone and details", text: $draft.tone, axis: .vertical)
                .lineLimit(3...5)
                .padding()
                .background(TavernTheme.panelStrong)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}

struct CharacterStep: View {
    @Binding var draft: AdventureDraft
    private let classes = ["Artificer", "Barbarian", "Bard", "Blood Hunter", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Psion", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]
    private let species = ["Human", "Elf", "Dwarf", "Halfling", "Gnome", "Half-Elf", "Half-Orc", "Tiefling", "Dragonborn"]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                ForEach(CharacterBuildMode.allCases) { mode in
                    Button {
                        draft.buildMode = mode
                    } label: {
                        Text(mode.rawValue)
                            .font(.caption.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(draft.buildMode == mode ? TavernTheme.gold.opacity(0.16) : TavernTheme.panelStrong)
                            .foregroundStyle(draft.buildMode == mode ? TavernTheme.goldBright : TavernTheme.ink)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }

            TextField("Player name", text: $draft.playerName)
                .wizardField()
            TextField("Character name", text: $draft.characterName)
                .wizardField()

            Text("Class")
                .font(.caption.weight(.semibold))
                .foregroundStyle(TavernTheme.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 2), spacing: 10) {
                ForEach(classes, id: \.self) { option in
                    WizardTile(title: option, selected: draft.characterClass == option) {
                        draft.characterClass = option
                    }
                }
            }

            Text("Species")
                .font(.caption.weight(.semibold))
                .foregroundStyle(TavernTheme.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 2), spacing: 10) {
                ForEach(species, id: \.self) { option in
                    WizardTile(title: option, selected: draft.species == option) {
                        draft.species = option
                    }
                }
            }

            Text("Stats")
                .font(.caption.weight(.semibold))
                .foregroundStyle(TavernTheme.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                ForEach(draft.stats.sorted(by: { $0.key < $1.key }), id: \.key) { label, value in
                    StatTile(label: label, value: "\(value)")
                }
            }

            TextField("Backstory", text: $draft.backstory, axis: .vertical)
                .lineLimit(3...6)
                .wizardField()
        }
    }
}

struct ReviewStep: View {
    let draft: AdventureDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            reviewCard(title: "CHARACTER", rows: [
                draft.characterName,
                "\(draft.species) \(draft.characterClass)",
                "\(draft.buildMode.rawValue)"
            ])
            reviewCard(title: "CAMPAIGN", rows: [
                draft.title,
                draft.world,
                draft.mode.label
            ])
        }
    }

    private func reviewCard(title: String, rows: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(TavernTheme.muted)
            ForEach(rows, id: \.self) { row in
                Text(row.isEmpty ? "Not set" : row)
                    .foregroundStyle(row.isEmpty ? TavernTheme.ember : TavernTheme.ink)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tavernCard()
    }
}

struct PreparingStep: View {
    @State private var statusIndex = 0
    private let statuses = [
        "The Dungeon Master is sketching the opening scene...",
        "Lighting the candles...",
        "Consulting the old maps...",
        "Waking the innkeep..."
    ]

    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
                .tint(TavernTheme.gold)
            Text("Preparing your table...")
                .cinzel(20)
            Text(statuses[statusIndex])
                .font(.system(size: 15, design: .serif))
                .foregroundStyle(TavernTheme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 420)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                statusIndex = (statusIndex + 1) % statuses.count
            }
        }
    }
}

struct WizardChoiceCard: View {
    let title: String
    let subtitle: String
    let systemName: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemName)
                    .font(.title2)
                    .foregroundStyle(TavernTheme.goldBright)
                    .frame(width: 42, height: 42)
                    .background(TavernTheme.panelStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .cinzel(17)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(TavernTheme.muted)
                }
                Spacer()
            }
            .tavernCard()
            .overlay(
                RoundedRectangle(cornerRadius: TavernTheme.cardRadius)
                    .stroke(selected ? TavernTheme.gold : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

struct WizardTile: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .bottom) {
                LinearGradient(
                    colors: [TavernTheme.panelStrong, TavernTheme.bg],
                    startPoint: .top,
                    endPoint: .bottom
                )
                Image(systemName: "sparkles")
                    .foregroundStyle(TavernTheme.gold.opacity(0.5))
                Text(title)
                    .cinzel(15)
                    .padding(10)
                    .frame(maxWidth: .infinity)
                    .background(TavernTheme.scrim)
            }
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? TavernTheme.gold : TavernTheme.line, lineWidth: selected ? 2 : 1))
        }
        .buttonStyle(.plain)
    }
}

private extension View {
    func wizardField() -> some View {
        self
            .padding()
            .background(TavernTheme.panelStrong)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(TavernTheme.line, lineWidth: 1))
    }
}
