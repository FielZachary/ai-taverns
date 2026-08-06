import Foundation

struct AuthSession: Codable, Equatable {
    var userId: String
    var email: String?
    var bearerToken: String?
}

enum CampaignMode: String, Codable, CaseIterable {
    case singlePlayer = "single_player"
    case multiplayer

    var label: String {
        switch self {
        case .singlePlayer: "Solo"
        case .multiplayer: "Multiplayer"
        }
    }
}

struct CampaignSummary: Codable, Identifiable, Equatable {
    var id: String
    var sessionId: String
    var mode: CampaignMode
    var title: String
    var ownerClientId: String?
    var portraitAssetId: String?
    var portraitUrl: String?
    var preview: String?
    var time: String?
    var messageCount: Int?
    var joinCode: String?
}

struct CampaignListResponse: Codable {
    var campaigns: [CampaignSummary]
}

struct CampaignCreateResponse: Codable {
    var campaign: CampaignSummary
}

struct RoomSnapshot: Codable, Equatable {
    var roomId: String
    var mode: CampaignMode
    var sessionId: String
    var players: [RoomPlayer]
    var messages: [RoomMessage]
    var isResolving: Bool
    var hasBegun: Bool
    var pendingRollRequest: DiceRollRequest?
    var pendingRollRequests: [DiceRollRequest]
    var nextInputNeeded: NextInputNeeded
    var inputTargets: [String]
    var inputPolicy: InputPolicy
    var combat: CombatSnapshot
    var updatedAt: Date
}

struct RoomPlayer: Codable, Identifiable, Equatable {
    var id: String
    var actorKey: String
    var slot: Int
    var username: String
    var characterName: String
    var characterSheet: String
    var combatCheatSheet: String?
    var combatCheatSheetUpdatedAt: Date?
    var combatCheatSheetSourceHash: String?
    var portraitAssetId: String?
    var portraitUrl: String?
    var portraitStatus: PortraitStatus?
    var status: PlayerStatus
    var lastSeenAt: Date
}

enum PortraitStatus: String, Codable {
    case pending
    case ready
    case failed
}

enum PlayerStatus: String, Codable {
    case waiting
    case submitted
}

struct RoomMessage: Codable, Identifiable, Equatable {
    var id: String
    var role: MessageRole
    var kind: MessageKind?
    var playerName: String?
    var characterName: String?
    var setting: RoomMessageSetting?
    var content: String
    var createdAt: Date

    static func system(_ content: String) -> RoomMessage {
        RoomMessage(
            id: UUID().uuidString,
            role: .system,
            kind: .system,
            playerName: nil,
            characterName: nil,
            setting: nil,
            content: content,
            createdAt: Date()
        )
    }
}

enum MessageRole: String, Codable {
    case player
    case dm
    case system
}

enum MessageKind: String, Codable {
    case normal
    case askDMQuestion = "ask_dm_question"
    case askDMAnswer = "ask_dm_answer"
    case system
}

struct RoomMessageSetting: Codable, Equatable {
    var displayLocation: String?
    var worldName: String?
    var regionName: String?
    var settlementName: String?
    var sceneLocation: String?
    var startingLocation: String?
}

struct DiceRollRequest: Codable, Identifiable, Equatable {
    var id: String?
    var player: String?
    var dice: String
    var modifier: Int?
    var label: String
    var reason: String?
    var targetDc: Int?
    var target_dc: Int?
    var dc: Int?
    var threshold: Int?
    var advantageState: AdvantageState?
    var advantage_state: AdvantageState?

    var stableId: String { id ?? "\(label)-\(dice)" }
    var visibleDC: Int? { targetDc ?? target_dc ?? dc ?? threshold }
}

enum AdvantageState: String, Codable {
    case normal
    case advantage
    case disadvantage
}

struct DiceRollResult: Codable, Equatable {
    var rolls: [Int]
    var total: Int
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

struct CombatSnapshot: Codable, Equatable {
    var active: Bool
    var round: Int
    var turnOwner: String?
    var turnOwnerPlayerId: String?
    var turnOwnerCharacterName: String?
    var initiativeOrder: [String]
}

struct CampaignNpcCard: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var markdown: String
    var updatedAt: Date?
}

struct CampaignNpcCardsResponse: Codable {
    var npcCards: [CampaignNpcCard]
}

struct AdventureDraft: Equatable {
    var mode: CampaignMode = .singlePlayer
    var multiplayerIntent: MultiplayerIntent = .create
    var title = ""
    var playerName = ""
    var characterName = ""
    var characterClass = "Fighter"
    var species = "Human"
    var world = "Eldermere"
    var tone = ""
    var backstory = ""
    var gameCode = ""
    var buildMode: CharacterBuildMode = .quick
    var stats: [String: Int] = [
        "STR": 15, "DEX": 14, "CON": 13, "INT": 12, "WIS": 10, "CHA": 8
    ]
}

enum MultiplayerIntent: String, CaseIterable, Identifiable {
    case create = "Create a new table"
    case join = "Join with a game code"

    var id: String { rawValue }
}

enum CharacterBuildMode: String, CaseIterable, Identifiable {
    case quick = "Quick build"
    case custom = "Custom build"

    var id: String { rawValue }
}
