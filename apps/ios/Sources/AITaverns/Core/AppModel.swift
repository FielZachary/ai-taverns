import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    enum Tab: Hashable {
        case play
        case adventures
        case resources
        case settings
    }

    @Published var selectedTab: Tab = .play
    @Published var authState: AuthState = .signedOut
    @Published var activeCampaign: CampaignSummary?
    @Published var campaigns: [CampaignSummary] = []
    @Published var room: RoomSnapshot?
    @Published var isLoadingCampaigns = false
    @Published var isLoadingRoom = false
    @Published var roomConnectionState: RoomConnectionState = .disconnected
    @Published var streamingMessage: StreamingMessage?
    @Published var draftsByCampaign: [String: String] = [:]
    @Published var playModeByCampaign: [String: ComposerMode] = [:]
    @Published var lastError: String?

    let apiClient: APIClient
    private let sessionStore = SessionStore()
    private var roomSocket: RoomLiveClient?
    private var roomPollTask: Task<Void, Never>?

    init(apiClient: APIClient) {
        self.apiClient = apiClient
        if let session = sessionStore.loadSession() {
            authState = .signedIn(session)
        }
        campaigns = SampleData.campaigns
        activeCampaign = campaigns.first
        room = SampleData.room
    }

    var currentCampaignId: String? {
        activeCampaign?.id
    }

    var currentDraftBinding: Binding<String> {
        Binding(
            get: { [weak self] in
                guard let self, let id = self.currentCampaignId else { return "" }
                return self.draftsByCampaign[id, default: ""]
            },
            set: { [weak self] newValue in
                guard let self, let id = self.currentCampaignId else { return }
                self.draftsByCampaign[id] = newValue
            }
        )
    }

    var composerModeBinding: Binding<ComposerMode> {
        Binding(
            get: { [weak self] in
                guard let self, let id = self.currentCampaignId else { return .turn }
                return self.playModeByCampaign[id, default: .turn]
            },
            set: { [weak self] newValue in
                guard let self, let id = self.currentCampaignId else { return }
                self.playModeByCampaign[id] = newValue
            }
        )
    }

    func bootstrap() async {
        await refreshSession()
        await refreshCampaigns()
        if let activeCampaign {
            await activateCampaign(activeCampaign)
        }
    }

    func refreshSession() async {
        do {
            if let session = try await apiClient.currentSession() {
                authState = .signedIn(session)
                sessionStore.save(session)
            } else if sessionStore.loadSession() == nil {
                authState = .signedOut
            }
        } catch {
            if sessionStore.loadSession() == nil {
                authState = .signedOut
            }
        }
    }

    func signIn(session: AuthSession) {
        sessionStore.save(session)
        authState = .signedIn(session)
    }

    func signOut() async {
        try? await apiClient.signOut()
        roomSocket?.disconnect()
        sessionStore.clear()
        authState = .signedOut
        room = nil
        activeCampaign = nil
        selectedTab = .play
    }

    func refreshCampaigns() async {
        isLoadingCampaigns = true
        defer { isLoadingCampaigns = false }

        do {
            campaigns = try await apiClient.listCampaigns()
            if activeCampaign == nil {
                activeCampaign = campaigns.first
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    func activateCampaign(_ campaign: CampaignSummary) async {
        activeCampaign = campaign
        selectedTab = .play
        await loadRoom(campaign: campaign)
    }

    func loadRoom(campaign: CampaignSummary? = nil) async {
        guard let campaign = campaign ?? activeCampaign else { return }
        isLoadingRoom = true
        defer { isLoadingRoom = false }

        do {
            let snapshot = try await apiClient.readRoom(campaignId: campaign.id, sessionId: campaign.sessionId)
            room = snapshot
            connectRoomSocket(snapshot)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func submitComposer(text: String, mode: ComposerMode) async {
        guard let room else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if let id = currentCampaignId {
            draftsByCampaign[id] = ""
        }

        let optimistic = RoomMessage(
            id: UUID().uuidString,
            role: .player,
            kind: mode == .askDM ? .askDMQuestion : .normal,
            playerName: currentPlayer(in: room)?.username,
            characterName: currentPlayer(in: room)?.characterName,
            setting: nil,
            content: trimmed,
            createdAt: Date()
        )
        self.room?.messages.append(optimistic)

        do {
            let updated = try await apiClient.submitRoom(
                roomId: room.roomId,
                sessionId: room.sessionId,
                playerId: currentPlayer(in: room)?.id,
                message: trimmed,
                mode: mode,
                clientMessageId: optimistic.id
            )
            self.room = updated
            Haptics.success()
        } catch {
            lastError = error.localizedDescription
            self.room?.messages.append(RoomMessage.system("Your message could not be sent. Tap retry from the web client while mobile retry is finalized."))
        }
    }

    func submitRoll(_ result: DiceRollResult, request: DiceRollRequest?) async {
        guard let room else { return }
        do {
            let updated = try await apiClient.submitRoll(
                roomId: room.roomId,
                sessionId: room.sessionId,
                playerId: currentPlayer(in: room)?.id,
                request: request,
                result: result,
                clientMessageId: UUID().uuidString
            )
            self.room = updated
            Haptics.success()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func createCampaign(from draft: AdventureDraft) async -> CampaignSummary? {
        do {
            let campaign = try await apiClient.createCampaign(draft)
            campaigns.insert(campaign, at: 0)
            activeCampaign = campaign
            await loadRoom(campaign: campaign)
            return campaign
        } catch {
            lastError = error.localizedDescription
            return nil
        }
    }

    func refreshCheatSheet() async {
        guard let room, let playerId = currentPlayer(in: room)?.id else { return }
        do {
            self.room = try await apiClient.generateCombatCheatSheet(
                roomId: room.roomId,
                sessionId: room.sessionId,
                playerId: playerId
            )
        } catch {
            lastError = error.localizedDescription
        }
    }

    func currentPlayer(in room: RoomSnapshot? = nil) -> RoomPlayer? {
        let snapshot = room ?? self.room
        return snapshot?.players.first
    }

    private func connectRoomSocket(_ snapshot: RoomSnapshot) {
        roomSocket?.disconnect()
        roomSocket = RoomLiveClient(
            configuration: apiClient.configuration,
            roomId: snapshot.roomId,
            sessionId: snapshot.sessionId
        )
        roomSocket?.onEvent = { [weak self] event in
            Task { @MainActor in
                self?.handleRoomEvent(event)
            }
        }
        roomSocket?.connect()
        roomConnectionState = .connecting
        startFallbackPoll()
    }

    private func handleRoomEvent(_ event: RoomSocketEvent) {
        switch event {
        case .heartbeat:
            roomConnectionState = .connected
        case .roomUpdated:
            roomConnectionState = .connected
            Task { await loadRoom() }
        case .roomSnapshot(_, let snapshot):
            roomConnectionState = .connected
            room = snapshot
        case .error(_, let message):
            roomConnectionState = .reconnecting
            lastError = message
        case .dmStreamStarted(_, let turnId):
            streamingMessage = StreamingMessage(turnId: turnId, text: "")
        case .dmStreamDelta(_, _, let text):
            streamingMessage?.text.append(text)
        case .dmStreamDone:
            streamingMessage = nil
            Task { await loadRoom() }
        case .dmStreamFailed(_, _, let message):
            streamingMessage = nil
            room?.messages.append(RoomMessage.system(message))
        }
    }

    private func startFallbackPoll() {
        roomPollTask?.cancel()
        roomPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                await self?.loadRoom()
            }
        }
    }
}

enum AuthState: Equatable {
    case signedOut
    case signedIn(AuthSession)
}

enum RoomConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

enum ComposerMode: String, CaseIterable, Identifiable {
    case turn = "Turn"
    case askDM = "Ask DM"

    var id: String { rawValue }
}

struct StreamingMessage: Equatable {
    var turnId: String
    var text: String
}
