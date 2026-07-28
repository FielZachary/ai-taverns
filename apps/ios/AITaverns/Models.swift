import Foundation

enum CampaignMode: String, Codable, CaseIterable, Identifiable {
    case singlePlayer = "single_player"
    case multiplayer

    var id: String { rawValue }

    var title: String {
        switch self {
        case .singlePlayer: "Solo"
        case .multiplayer: "Multiplayer"
        }
    }
}

enum AIModelID: String, Codable, CaseIterable, Identifiable {
    case deepseekV4Flash = "deepseek-v4-flash"
    case qwen37Flash = "qwen-3-7-flash"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .deepseekV4Flash: "DeepSeek V4 Flash"
        case .qwen37Flash: "Qwen 3.7 Flash"
        }
    }
}

struct CampaignSummary: Codable, Identifiable, Hashable {
    let id: UUID
    let sessionId: String
    let mode: CampaignMode
    let title: String
    let ownerClientId: String?
    let portraitAssetId: UUID?
    let portraitUrl: String?
    let preview: String?
    let time: String?
    let messageCount: Int?
    let joinCode: String?
}

struct CampaignListResponse: Codable {
    let campaigns: [CampaignSummary]
}

struct CampaignCreateRequest: Codable {
    var mode: CampaignMode?
    var title: String?
    var campaignGenre: String?
    var campaignGenreKind: String?
    var campaignGenrePresetId: String?
    var customWorldName: String?
    var customWorldDescription: String?
    var ownerClientId: String?
    var playerName: String?
    var characterName: String?
    var characterSheet: String?
    var generateCharacterPortrait: Bool?
}

struct CampaignCreateResponse: Codable {
    let campaign: CampaignSummary
}

struct CampaignJoinPreviewResponse: Codable {
    let code: String
    let campaignTitle: String
    let availableSlots: Int
    let hasBegun: Bool
}

struct CampaignJoinRequest: Codable {
    var gameCode: String?
    var clientId: String?
    var username: String?
    var characterName: String?
    var characterSheet: String?
}

struct CampaignJoinResponse: Codable {
    let campaign: CampaignSummary
}

struct CampaignInvite: Codable, Identifiable, Hashable {
    let id: UUID
    let campaignId: UUID
    let enabled: Bool
    let maxUses: Int?
    let useCount: Int
    let expiresAt: String?
    let createdAt: String
    let disabledAt: String?
    let token: String?
}

struct CampaignInviteCreateResponse: Codable {
    let invite: CampaignInvite
}

struct CampaignInviteListResponse: Codable {
    let invites: [CampaignInvite]
}

enum RoomMessageRole: String, Codable {
    case player
    case dm
}

struct RoomMessage: Codable, Identifiable, Hashable {
    let id: String
    let role: RoomMessageRole
    let kind: String?
    let playerName: String?
    let characterName: String?
    let content: String
    let createdAt: String
}

struct DiceRollResult: Codable, Hashable {
    let rolls: [Int]
    let total: Int
}

struct DiceRollRequest: Codable, Identifiable, Hashable {
    let id: String?
    let player: String?
    let dice: String
    let modifier: Int?
    let label: String
    let reason: String?
    let advantageState: String?
    let advantage_state: String?
}

struct DiceRollSubmission: Codable {
    let rollRequestId: String
    let rollResult: DiceRollResult?
    let clientMessageId: String?
}

enum NextInputNeeded: String, Codable {
    case playerActions = "player_actions"
    case diceResults = "dice_results"
    case clarification
}

enum InputPolicy: String, Codable {
    case allPlayers = "all_players"
    case onlyTargetedPlayers = "only_targeted_players"
}

enum RoomPlayerStatus: String, Codable {
    case waiting
    case submitted
}

struct RoomPlayer: Codable, Identifiable, Hashable {
    let id: String
    let actorKey: String
    let slot: Int
    let username: String
    let characterName: String
    let characterSheet: String
    let portraitAssetId: UUID?
    let portraitUrl: String?
    let portraitStatus: String?
    let status: RoomPlayerStatus
    let lastSeenAt: String
}

struct CombatState: Codable, Hashable {
    let active: Bool
    let round: Int
    let turnOwner: String?
    let turnOwnerPlayerId: String?
    let turnOwnerCharacterName: String?
    let initiativeOrder: [String]
}

struct RoomSnapshot: Codable, Hashable {
    let roomId: UUID
    let mode: CampaignMode
    let sessionId: String
    let players: [RoomPlayer]
    let messages: [RoomMessage]
    let isResolving: Bool
    let hasBegun: Bool
    let pendingRollRequest: DiceRollRequest?
    let pendingRollRequests: [DiceRollRequest]
    let nextInputNeeded: NextInputNeeded
    let inputTargets: [String]
    let inputPolicy: InputPolicy
    let combat: CombatState
    let updatedAt: String
}

struct RoomPlayerUpdateRequest: Codable {
    var roomId: String?
    var sessionId: String?
    var playerId: String?
    var username: String?
    var characterName: String?
    var characterSheet: String?
}

struct RoomBeginRequest: Codable {
    var roomId: String?
    var sessionId: String?
}

struct RoomSubmitRequest: Codable {
    var roomId: String?
    var sessionId: String?
    var playerId: String?
    var message: String?
    var skipTurn: Bool?
    var rollRequestId: String?
    var rollResult: DiceRollResult?
    var clientMessageId: String?
    var model: AIModelID?
    var rollSubmissions: [DiceRollSubmission]?
}

enum RoomSocketEvent: Decodable {
    case roomUpdated(roomId: String, updatedAt: String, eventId: String?)
    case roomSnapshot(roomId: String, snapshot: RoomSnapshot)
    case heartbeat(sentAt: String)
    case error(message: String)
    case dmStreamStarted(roomId: String, turnId: String)
    case dmStreamDelta(roomId: String, turnId: String, text: String)
    case dmStreamDone(roomId: String, turnId: String, messageId: String)
    case dmStreamFailed(roomId: String, turnId: String, message: String)

    private enum CodingKeys: String, CodingKey {
        case type
        case roomId
        case updatedAt
        case eventId
        case snapshot
        case sentAt
        case message
        case turnId
        case text
        case messageId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "room_updated":
            self = .roomUpdated(
                roomId: try container.decode(String.self, forKey: .roomId),
                updatedAt: try container.decode(String.self, forKey: .updatedAt),
                eventId: try container.decodeIfPresent(String.self, forKey: .eventId)
            )
        case "room_snapshot":
            self = .roomSnapshot(
                roomId: try container.decode(String.self, forKey: .roomId),
                snapshot: try container.decode(RoomSnapshot.self, forKey: .snapshot)
            )
        case "heartbeat":
            self = .heartbeat(sentAt: try container.decode(String.self, forKey: .sentAt))
        case "error":
            self = .error(message: try container.decode(String.self, forKey: .message))
        case "dm_stream_started":
            self = .dmStreamStarted(
                roomId: try container.decode(String.self, forKey: .roomId),
                turnId: try container.decode(String.self, forKey: .turnId)
            )
        case "dm_stream_delta":
            self = .dmStreamDelta(
                roomId: try container.decode(String.self, forKey: .roomId),
                turnId: try container.decode(String.self, forKey: .turnId),
                text: try container.decode(String.self, forKey: .text)
            )
        case "dm_stream_done":
            self = .dmStreamDone(
                roomId: try container.decode(String.self, forKey: .roomId),
                turnId: try container.decode(String.self, forKey: .turnId),
                messageId: try container.decode(String.self, forKey: .messageId)
            )
        case "dm_stream_failed":
            self = .dmStreamFailed(
                roomId: try container.decode(String.self, forKey: .roomId),
                turnId: try container.decode(String.self, forKey: .turnId),
                message: try container.decode(String.self, forKey: .message)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown room socket event type: \(type)"
            )
        }
    }
}

struct APIErrorEnvelope: Codable {
    struct NestedError: Codable {
        let message: String?
    }

    let error: ErrorValue?
}

enum ErrorValue: Codable {
    case string(String)
    case object(APIErrorEnvelope.NestedError)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let value = try? container.decode(String.self) {
            self = .string(value)
            return
        }

        self = .object(try container.decode(APIErrorEnvelope.NestedError.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        }
    }

    var message: String? {
        switch self {
        case .string(let value):
            value
        case .object(let value):
            value.message
        }
    }
}
