import SwiftUI

struct PlayView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var showingDice = false
    @State private var showingResources = false
    @State private var showingSettings = false
    @State private var showingMap = false
    @State private var requiredRollPresentedForId: String?

    private var pendingRoll: DiceRollRequest? {
        appModel.room?.pendingRollRequests.first ?? appModel.room?.pendingRollRequest
    }

    var body: some View {
        ZStack {
            TavernTheme.background
            if let room = appModel.room, let campaign = appModel.activeCampaign {
                VStack(spacing: 0) {
                    connectionBanner
                    MessageLogView(room: room, streaming: appModel.streamingMessage)
                    ComposerContainer(
                        room: room,
                        campaign: campaign,
                        pendingRoll: pendingRoll,
                        showingDice: $showingDice
                    )
                }
            } else {
                EmptyStateView(
                    systemName: "book.closed",
                    title: "No adventure underway",
                    message: "Choose an adventure or start a new one.",
                    buttonTitle: "Choose an adventure"
                ) {
                    appModel.selectedTab = .adventures
                }
            }
        }
        .navigationTitle(appModel.activeCampaign?.title ?? "Play")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button { showingMap = true } label: { IconCircle(systemName: "map", label: "Map") }
                Button { showingResources = true } label: { IconCircle(systemName: "backpack", label: "Resources") }
                Button { showingSettings = true } label: { IconCircle(systemName: "gearshape", label: "Settings") }
            }
        }
        .sheet(isPresented: $showingDice) {
            DiceSheet(request: pendingRoll)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingResources) {
            NavigationStack {
                ResourcesRootView(presentedFromPlay: true)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(showCampaignSection: true)
                .presentationDetents([.height(560), .large])
        }
        .mapPresentation(isPresented: $showingMap)
        .onChange(of: pendingRoll?.stableId) { _, newValue in
            guard let newValue, requiredRollPresentedForId != newValue else { return }
            requiredRollPresentedForId = newValue
            Haptics.warning()
            showingDice = true
        }
        .task {
            await appModel.loadRoom()
        }
    }

    @ViewBuilder
    private var connectionBanner: some View {
        if appModel.roomConnectionState == .reconnecting {
            Text("Reconnecting...")
                .font(.caption.weight(.semibold))
                .foregroundStyle(TavernTheme.goldBright)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(TavernTheme.panelStrong)
                .clipShape(Capsule())
                .padding(.top, 8)
        }
    }
}

struct MessageLogView: View {
    let room: RoomSnapshot
    let streaming: StreamingMessage?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    if room.combat.active {
                        CombatStrip(combat: room.combat)
                    }
                    ForEach(room.messages) { message in
                        MessageRow(message: message)
                            .id(message.id)
                    }
                    if let streaming {
                        DMStreamingRow(text: streaming.text)
                            .id("streaming")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .onChange(of: room.messages.count) { _, _ in
                withAnimation { proxy.scrollTo(room.messages.last?.id, anchor: .bottom) }
            }
            .onChange(of: streaming?.text) { _, _ in
                withAnimation { proxy.scrollTo("streaming", anchor: .bottom) }
            }
        }
    }
}

struct MessageRow: View {
    let message: RoomMessage

    var body: some View {
        switch message.role {
        case .dm:
            dmBlock
        case .player:
            playerBubble
        case .system:
            systemCapsule
        }
    }

    private var dmBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle()
                    .fill(TavernTheme.panelStrong)
                    .frame(width: 28, height: 28)
                    .overlay(Image(systemName: "sparkles").font(.caption).foregroundStyle(TavernTheme.gold))
                Text("Dungeon Master")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(TavernTheme.gold)
                if let location = message.setting?.displayLocation {
                    Text("· \(location)")
                        .font(.caption)
                        .foregroundStyle(TavernTheme.muted)
                }
            }
            Text(message.content)
                .font(.system(size: message.kind == .askDMAnswer ? 15 : 17, design: .serif))
                .lineSpacing(6)
                .foregroundStyle(message.kind == .askDMAnswer ? TavernTheme.muted : TavernTheme.ink)
                .padding(.leading, message.kind == .askDMAnswer ? 10 : 0)
                .overlay(alignment: .leading) {
                    if message.kind == .askDMAnswer {
                        Rectangle()
                            .fill(TavernTheme.gold)
                            .frame(width: 2)
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var playerBubble: some View {
        HStack {
            Spacer(minLength: 50)
            Text((message.kind == .askDMQuestion ? "Ask DM: " : "") + message.content)
                .font(.system(size: 15))
                .foregroundStyle(message.kind == .askDMQuestion ? TavernTheme.muted : TavernTheme.ink)
                .padding(12)
                .background(TavernTheme.panelStrong)
                .clipShape(RoundedRectangle(cornerRadius: TavernTheme.bubbleRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: TavernTheme.bubbleRadius, style: .continuous)
                        .stroke(TavernTheme.line, style: StrokeStyle(lineWidth: 1, dash: message.kind == .askDMQuestion ? [4] : []))
                )
                .frame(maxWidth: 300, alignment: .trailing)
        }
    }

    private var systemCapsule: some View {
        Text(message.content)
            .font(.caption)
            .foregroundStyle(TavernTheme.muted)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(TavernTheme.panel)
            .clipShape(Capsule())
            .frame(maxWidth: .infinity)
    }
}

struct DMStreamingRow: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Dungeon Master")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(TavernTheme.gold)
                Text("· writing...")
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
            }
            HStack(alignment: .bottom, spacing: 3) {
                Text(text.isEmpty ? " " : text)
                    .font(.system(size: 17, design: .serif))
                    .lineSpacing(6)
                Rectangle()
                    .fill(TavernTheme.goldBright)
                    .frame(width: 8, height: 16)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CombatStrip: View {
    let combat: CombatSnapshot

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                Pill("Combat · Round \(combat.round)", color: TavernTheme.ember)
                ForEach(combat.initiativeOrder, id: \.self) { actor in
                    Pill(actor, color: actor == combat.turnOwner ? TavernTheme.gold : TavernTheme.muted)
                }
            }
        }
    }
}

struct ComposerContainer: View {
    @EnvironmentObject private var appModel: AppModel
    let room: RoomSnapshot
    let campaign: CampaignSummary
    let pendingRoll: DiceRollRequest?
    @Binding var showingDice: Bool

    private var currentPlayer: RoomPlayer? { appModel.currentPlayer(in: room) }
    private var composerLocked: Bool {
        pendingRoll != nil || room.isResolving || currentPlayer?.status == .submitted || appModel.streamingMessage != nil
    }

    var body: some View {
        VStack(spacing: 10) {
            if let pendingRoll {
                RequiredRollCard(request: pendingRoll) {
                    showingDice = true
                }
            } else if room.isResolving || currentPlayer?.status == .submitted {
                WaitingCard(room: room)
            } else if room.combat.active && room.combat.turnOwnerPlayerId != currentPlayer?.id {
                WaitingCombatCard(combat: room.combat)
            }
            ComposerView(
                mode: appModel.composerModeBinding,
                text: appModel.currentDraftBinding,
                locked: composerLocked,
                placeholder: room.isResolving ? "The DM is thinking..." : "What do you do?",
                onDice: { showingDice = true },
                onSend: { text, mode in
                    Task { await appModel.submitComposer(text: text, mode: mode) }
                }
            )
            .opacity(pendingRoll == nil ? 1 : 0.55)
            .disabled(pendingRoll != nil)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(TavernTheme.panel.opacity(0.92))
        .overlay(alignment: .top) {
            Rectangle()
                .fill(TavernTheme.line)
                .frame(height: 1)
        }
    }
}

struct ComposerView: View {
    @Binding var mode: ComposerMode
    @Binding var text: String
    let locked: Bool
    let placeholder: String
    let onDice: () -> Void
    let onSend: (String, ComposerMode) -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Picker("Mode", selection: $mode) {
                    ForEach(ComposerMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 160)
                .disabled(locked)

                Spacer()

                Button(action: onDice) {
                    IconCircle(systemName: "die.face.5", label: "Dice")
                }
                .disabled(locked || mode == .askDM)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField(mode == .askDM ? "Ask the DM..." : placeholder, text: $text, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(TavernTheme.panelStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(TavernTheme.line, style: StrokeStyle(lineWidth: 1, dash: mode == .askDM ? [4] : []))
                    )
                    .disabled(locked)

                Button {
                    onSend(text, mode)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || locked ? TavernTheme.muted : Color(hex: 0x241505))
                        .frame(width: 44, height: 44)
                        .background(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || locked ? TavernTheme.panelStrong : TavernTheme.gold)
                        .clipShape(Circle())
                }
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || locked)
            }
        }
    }
}

struct RequiredRollCard: View {
    let request: DiceRollRequest
    let action: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "die.face.5")
                .font(.title3.weight(.bold))
                .foregroundStyle(TavernTheme.goldBright)
                .frame(width: 44, height: 44)
                .background(TavernTheme.ember.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(request.label)
                    .font(.system(size: 15, weight: .bold))
                Text(formula(for: request))
                    .font(.caption)
                    .foregroundStyle(TavernTheme.muted)
            }
            Spacer()
            Button("Roll \(request.dice)", action: action)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Color(hex: 0x241505))
                .padding(.horizontal, 12)
                .frame(height: 42)
                .background(TavernTheme.gold)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .tavernCard()
        .overlay(
            RoundedRectangle(cornerRadius: TavernTheme.cardRadius)
                .stroke(TavernTheme.ember.opacity(0.6), lineWidth: 1)
        )
    }

    private func formula(for request: DiceRollRequest) -> String {
        let mod = request.modifier.map { $0 >= 0 ? "+ \($0)" : "- \(abs($0))" } ?? ""
        let dc = request.visibleDC.map { " · DC \($0)" } ?? ""
        return "\(request.dice) \(mod)\(dc)"
    }
}

struct WaitingCard: View {
    let room: RoomSnapshot

    var body: some View {
        HStack {
            ForEach(room.players) { player in
                Pill("\(player.username) · \(player.status == .submitted ? "Submitted" : "thinking...")", color: player.status == .submitted ? TavernTheme.moss : TavernTheme.muted)
            }
            Spacer()
        }
        .tavernCard()
    }
}

struct WaitingCombatCard: View {
    let combat: CombatSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Pill("\(combat.turnOwnerCharacterName ?? "Another hero")'s turn", color: TavernTheme.ember)
            Text("Your next opening is coming. Keep your resources close.")
                .font(.caption)
                .foregroundStyle(TavernTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tavernCard()
    }
}
