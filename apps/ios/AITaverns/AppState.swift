import Foundation
import Observation

@Observable
@MainActor
final class AppState {
    var apiBaseURL: String {
        didSet {
            UserDefaults.standard.set(apiBaseURL, forKey: StorageKey.apiBaseURL)
            Task { await apiClient.updateBaseURL(apiBaseURL) }
        }
    }

    var clientId: String
    var playerName: String
    var selectedModel: AIModelID
    var campaigns: [CampaignSummary] = []
    var selectedCampaign: CampaignSummary?
    var roomSnapshot: RoomSnapshot?
    var streamingMessage: RoomMessage?
    var isLoadingCampaigns = false
    var isLoadingRoom = false
    var isSending = false
    var errorMessage: String?

    private let apiClient: APIClient
    private var realtimeTask: Task<Void, Never>?

    init() {
        let defaults = UserDefaults.standard
        let savedBaseURL = defaults.string(forKey: StorageKey.apiBaseURL) ?? "http://localhost:4000"
        let savedClientId = defaults.string(forKey: StorageKey.clientId) ?? UUID().uuidString
        let savedPlayerName = defaults.string(forKey: StorageKey.playerName) ?? "Player"
        let savedModel = defaults.string(forKey: StorageKey.selectedModel)

        self.apiBaseURL = savedBaseURL
        self.clientId = savedClientId
        self.playerName = savedPlayerName
        self.selectedModel = savedModel.flatMap(AIModelID.init(rawValue:)) ?? .deepseekV4Flash
        self.apiClient = APIClient(baseURLString: savedBaseURL)

        defaults.set(savedClientId, forKey: StorageKey.clientId)
    }

    func updatePlayerName(_ value: String) {
        playerName = value
        UserDefaults.standard.set(value, forKey: StorageKey.playerName)
    }

    func updateSelectedModel(_ model: AIModelID) {
        selectedModel = model
        UserDefaults.standard.set(model.rawValue, forKey: StorageKey.selectedModel)
    }

    func refreshCampaigns() async {
        isLoadingCampaigns = true
        errorMessage = nil

        do {
            campaigns = try await apiClient.listCampaigns()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingCampaigns = false
    }

    func createCampaign(from draft: NewAdventureDraft) async {
        isSending = true
        errorMessage = nil

        do {
            let campaign = try await apiClient.createCampaign(
                CampaignCreateRequest(
                    mode: draft.mode,
                    title: draft.title.trimmedOrNil,
                    campaignGenre: draft.genre.trimmedOrNil,
                    campaignGenreKind: draft.genreKind,
                    campaignGenrePresetId: draft.genrePresetId,
                    customWorldName: draft.customWorldName.trimmedOrNil,
                    customWorldDescription: draft.customWorldDescription.trimmedOrNil,
                    ownerClientId: clientId,
                    playerName: draft.playerName.trimmedOrNil ?? playerName,
                    characterName: draft.characterName.trimmedOrNil,
                    characterSheet: draft.characterSheet.trimmedOrNil,
                    generateCharacterPortrait: draft.generatePortrait
                )
            )

            campaigns = [campaign] + campaigns.filter { $0.id != campaign.id }
            await selectCampaign(campaign)
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func joinCampaign(code: String, characterName: String, characterSheet: String) async {
        isSending = true
        errorMessage = nil

        do {
            let campaign = try await apiClient.joinCampaign(
                CampaignJoinRequest(
                    gameCode: code,
                    clientId: clientId,
                    username: playerName,
                    characterName: characterName.trimmedOrNil,
                    characterSheet: characterSheet.trimmedOrNil
                )
            )

            campaigns = [campaign] + campaigns.filter { $0.id != campaign.id }
            await selectCampaign(campaign)
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func selectCampaign(_ campaign: CampaignSummary) async {
        selectedCampaign = campaign
        await loadRoom(for: campaign)
        connectRealtime(for: campaign)
    }

    func loadRoom(for campaign: CampaignSummary? = nil) async {
        guard let campaign = campaign ?? selectedCampaign else {
            return
        }

        isLoadingRoom = true
        errorMessage = nil

        do {
            roomSnapshot = try await apiClient.readRoom(roomId: campaign.id, sessionId: campaign.sessionId)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingRoom = false
    }

    func updateCurrentPlayer(characterName: String, characterSheet: String) async {
        guard let campaign = selectedCampaign else {
            return
        }

        isSending = true
        errorMessage = nil

        do {
            roomSnapshot = try await apiClient.updatePlayer(
                RoomPlayerUpdateRequest(
                    roomId: campaign.id.uuidString,
                    sessionId: campaign.sessionId,
                    playerId: clientId,
                    username: playerName,
                    characterName: characterName.trimmedOrNil,
                    characterSheet: characterSheet.trimmedOrNil
                )
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func beginCurrentRoom() async {
        guard let campaign = selectedCampaign else {
            return
        }

        isSending = true
        errorMessage = nil

        do {
            roomSnapshot = try await apiClient.beginRoom(
                RoomBeginRequest(roomId: campaign.id.uuidString, sessionId: campaign.sessionId)
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func submitTurn(message: String, mode: PlayerInputMode) async {
        guard let campaign = selectedCampaign else {
            return
        }

        isSending = true
        errorMessage = nil

        do {
            roomSnapshot = try await apiClient.submitTurn(
                RoomSubmitRequest(
                    roomId: campaign.id.uuidString,
                    sessionId: campaign.sessionId,
                    playerId: clientId,
                    message: message.trimmedOrNil,
                    skipTurn: false,
                    clientMessageId: UUID().uuidString,
                    model: selectedModel
                )
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func skipTurn() async {
        guard let campaign = selectedCampaign else {
            return
        }

        isSending = true
        errorMessage = nil

        do {
            roomSnapshot = try await apiClient.submitTurn(
                RoomSubmitRequest(
                    roomId: campaign.id.uuidString,
                    sessionId: campaign.sessionId,
                    playerId: clientId,
                    skipTurn: true,
                    clientMessageId: UUID().uuidString,
                    model: selectedModel
                )
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func submitRoll(_ request: DiceRollRequest, result: DiceRollResult) async {
        guard let campaign = selectedCampaign, let requestId = request.id else {
            return
        }

        isSending = true
        errorMessage = nil

        do {
            roomSnapshot = try await apiClient.submitTurn(
                RoomSubmitRequest(
                    roomId: campaign.id.uuidString,
                    sessionId: campaign.sessionId,
                    playerId: clientId,
                    rollRequestId: requestId,
                    rollResult: result,
                    clientMessageId: UUID().uuidString,
                    model: selectedModel
                )
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    func createInviteURL() async -> URL? {
        guard let campaign = selectedCampaign else {
            return nil
        }

        do {
            let invite = try await apiClient.createInvite(campaignId: campaign.id)
            guard let token = invite.token else {
                return nil
            }

            return URL(string: "\(apiBaseURL)/invite/\(token)")
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func disconnectRealtime() {
        realtimeTask?.cancel()
        realtimeTask = nil
    }

    private func connectRealtime(for campaign: CampaignSummary) {
        disconnectRealtime()

        realtimeTask = Task { [apiClient] in
            do {
                let events = try await apiClient.roomEvents(roomId: campaign.id, sessionId: campaign.sessionId)

                for try await event in events {
                        apply(event)
                }
            } catch {
                await MainActor.run {
                    if self.selectedCampaign?.id == campaign.id {
                        self.errorMessage = "Realtime connection paused. Pull to refresh or reopen the campaign."
                    }
                }
            }
        }
    }

    private func apply(_ event: RoomSocketEvent) {
        switch event {
        case .roomUpdated:
            Task { await loadRoom() }
        case .roomSnapshot(_, let snapshot):
            roomSnapshot = snapshot
            streamingMessage = nil
        case .heartbeat:
            break
        case .error(let message):
            errorMessage = message
        case .dmStreamStarted(_, let turnId):
            streamingMessage = RoomMessage(
                id: "stream-\(turnId)",
                role: .dm,
                kind: "dm_stream",
                playerName: nil,
                characterName: nil,
                content: "",
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
        case .dmStreamDelta(_, _, let text):
            guard let current = streamingMessage else {
                return
            }

            streamingMessage = RoomMessage(
                id: current.id,
                role: current.role,
                kind: current.kind,
                playerName: current.playerName,
                characterName: current.characterName,
                content: current.content + text,
                createdAt: current.createdAt
            )
        case .dmStreamDone, .dmStreamFailed:
            streamingMessage = nil
            Task { await loadRoom() }
        }
    }
}

enum PlayerInputMode: String, CaseIterable, Identifiable {
    case turn
    case askDM

    var id: String { rawValue }

    var title: String {
        switch self {
        case .turn: "Turn"
        case .askDM: "Ask DM"
        }
    }
}

struct NewAdventureDraft {
    var mode: CampaignMode = .singlePlayer
    var title = ""
    var genre = "High fantasy"
    var genreKind = "preset"
    var genrePresetId: String? = nil
    var customWorldName = ""
    var customWorldDescription = ""
    var playerName = ""
    var characterName = ""
    var characterSheet = ""
    var generatePortrait = true
}

private enum StorageKey {
    static let apiBaseURL = "ai-taverns.apiBaseURL"
    static let clientId = "ai-taverns.clientId"
    static let playerName = "ai-taverns.playerName"
    static let selectedModel = "ai-taverns.selectedModel"
}

extension String {
    var trimmedOrNil: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
