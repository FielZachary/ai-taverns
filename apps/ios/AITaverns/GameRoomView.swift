import SwiftUI

struct GameRoomView: View {
    @Environment(AppState.self) private var appState
    let campaign: CampaignSummary

    @State private var draft = ""
    @State private var inputMode: PlayerInputMode = .turn
    @State private var isShowingCharacterSheet = false
    @State private var isShowingDice = false
    @State private var inviteURL: InviteShareItem?

    var body: some View {
        VStack(spacing: 0) {
            if appState.isLoadingRoom && appState.roomSnapshot == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                MessageTimeline(messages: visibleMessages)
            }

            Divider()

            ComposerBar(
                draft: $draft,
                mode: $inputMode,
                canSubmit: canSubmit,
                pendingRoll: pendingRoll,
                isSending: appState.isSending,
                onSubmit: submit,
                onRoll: { isShowingDice = true },
                onSkip: { Task { await appState.skipTurn() } }
            )
        }
        .navigationTitle(campaign.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    isShowingCharacterSheet = true
                } label: {
                    Image(systemName: "person.text.rectangle")
                }
                .accessibilityLabel("Character sheet")

                Button {
                    Task {
                        inviteURL = await appState.createInviteURL().map(InviteShareItem.init)
                    }
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Share invite")
            }
        }
        .safeAreaInset(edge: .top) {
            if let snapshot = appState.roomSnapshot, !snapshot.hasBegun {
                Button {
                    Task { await appState.beginCurrentRoom() }
                } label: {
                    Label("Begin Adventure", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding()
                .background(.regularMaterial)
            }
        }
        .sheet(isPresented: $isShowingCharacterSheet) {
            CharacterSheetView(snapshot: appState.roomSnapshot)
        }
        .sheet(isPresented: $isShowingDice) {
            if let pendingRoll {
                DiceRollerView(request: pendingRoll) { result in
                    Task { await appState.submitRoll(pendingRoll, result: result) }
                }
            }
        }
        .sheet(item: $inviteURL) { item in
            ShareSheetView(url: item.url)
        }
        .task(id: campaign.id) {
            await appState.selectCampaign(campaign)
        }
    }

    private var visibleMessages: [RoomMessage] {
        var messages = appState.roomSnapshot?.messages ?? []

        if let streamingMessage = appState.streamingMessage {
            messages.append(streamingMessage)
        }

        return messages
    }

    private var pendingRoll: DiceRollRequest? {
        appState.roomSnapshot?.pendingRollRequests.first ?? appState.roomSnapshot?.pendingRollRequest
    }

    private var canSubmit: Bool {
        draft.trimmedOrNil != nil && pendingRoll == nil && !appState.isSending
    }

    private func submit() {
        let message = draft
        draft = ""

        Task {
            await appState.submitTurn(message: message, mode: inputMode)
        }
    }
}

private struct MessageTimeline: View {
    let messages: [RoomMessage]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if messages.isEmpty {
                        EmptyStateView(
                            systemImage: "text.bubble",
                            title: "The table is quiet",
                            message: "Begin the adventure or send your first turn."
                        )
                        .padding(.top, 80)
                    }

                    ForEach(messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                }
                .padding()
            }
            .background(Color.tavernBackground)
            .onChange(of: messages.map(\.id)) { _, _ in
                guard let last = messages.last else {
                    return
                }

                withAnimation(.snappy) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }
}

private struct MessageBubble: View {
    let message: RoomMessage

    var body: some View {
        HStack {
            if message.role == .player {
                Spacer(minLength: 36)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)

                Text(message.content.isEmpty ? "Thinking..." : message.content)
                    .font(.body)
                    .textSelection(.enabled)
            }
            .padding(12)
            .background(background, in: RoundedRectangle(cornerRadius: 14))

            if message.role == .dm {
                Spacer(minLength: 36)
            }
        }
    }

    private var label: String {
        if message.role == .dm {
            return message.kind == "ask_dm_answer" ? "DM Answer" : "Dungeon Master"
        }

        return message.characterName ?? message.playerName ?? "Player"
    }

    private var background: some ShapeStyle {
        message.role == .dm ? AnyShapeStyle(Color.tavernPanel) : AnyShapeStyle(Color.accentColor.opacity(0.14))
    }
}

private struct ComposerBar: View {
    @Binding var draft: String
    @Binding var mode: PlayerInputMode

    let canSubmit: Bool
    let pendingRoll: DiceRollRequest?
    let isSending: Bool
    let onSubmit: () -> Void
    let onRoll: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Picker("Input mode", selection: $mode) {
                ForEach(PlayerInputMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            if let pendingRoll {
                Button {
                    onRoll()
                } label: {
                    Label("Roll \(pendingRoll.dice)", systemImage: "die.face.5")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField(mode == .askDM ? "Ask the DM" : "What do you do?", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...5)

                Button(action: onSubmit) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(!canSubmit)
                .accessibilityLabel("Send")

                Menu {
                    Button("Skip Turn", action: onSkip)
                        .disabled(isSending || pendingRoll != nil)
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                }
                .accessibilityLabel("More turn actions")
            }
        }
        .padding()
        .background(.bar)
    }
}

private struct ShareSheetView: View {
    let url: URL

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "person.3.sequence.fill")
                    .font(.system(size: 54))
                    .foregroundStyle(Color.tavernAccent)

                Text("Invite players")
                    .font(.title2.bold())

                ShareLink(item: url) {
                    Label("Share Invite", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

                Text(url.absoluteString)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Invite")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct InviteShareItem: Identifiable {
    let url: URL

    var id: String { url.absoluteString }
}
