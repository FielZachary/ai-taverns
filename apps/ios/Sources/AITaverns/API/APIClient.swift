import Foundation

struct APIConfiguration {
    var baseURL: URL
    var clientHeader = "ios/1.0"

    var webSocketURL: URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        return components.url!
    }
}

struct APIClient {
    let configuration: APIConfiguration
    private let sessionStore = SessionStore()
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(configuration: APIConfiguration) {
        self.configuration = configuration
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
    }

    func currentSession() async throws -> AuthSession? {
        let response = try await request(path: "/api/auth/me")
        guard response.statusCode != 401 else { return nil }
        let body = response.data
        let auth = try decoder.decode(AuthMeResponse.self, from: body)
        guard auth.authenticated, let user = auth.user else { return nil }
        return AuthSession(userId: user.id, email: user.email, bearerToken: sessionStore.loadSession()?.bearerToken)
    }

    func startMagicLink(email: String) async throws {
        _ = try await request(
            path: "/api/auth/passwordless/start",
            method: "POST",
            body: ["email": email]
        )
    }

    func verifyMagicLink(token: String) async throws -> AuthSession {
        let response = try await request(
            path: "/api/auth/passwordless/verify",
            method: "POST",
            body: ["token": token]
        )
        return try decoder.decode(AuthSession.self, from: response.data)
    }

    func signOut() async throws {
        _ = try await request(path: "/api/auth/signout", method: "POST")
    }

    func listCampaigns() async throws -> [CampaignSummary] {
        let response = try await request(path: "/api/campaigns")
        return try decoder.decode(CampaignListResponse.self, from: response.data).campaigns
    }

    func createCampaign(_ draft: AdventureDraft) async throws -> CampaignSummary {
        var payload: [String: Any] = [
            "mode": draft.mode.rawValue,
            "title": draft.title.isEmpty ? "\(draft.characterName)'s Adventure" : draft.title,
            "playerName": draft.playerName,
            "characterName": draft.characterName,
            "characterSheet": characterSheetMarkdown(from: draft),
            "campaignGenre": draft.world,
            "campaignGenreKind": draft.world == "Eldermere" ? "preset" : "custom",
            "generateCharacterPortrait": false
        ]

        if draft.world != "Eldermere" {
            payload["customWorldName"] = draft.world
            payload["customWorldDescription"] = draft.tone
        }

        let response = try await request(path: "/api/campaigns", method: "POST", jsonObject: payload)
        return try decoder.decode(CampaignCreateResponse.self, from: response.data).campaign
    }

    func readRoom(campaignId: String, sessionId: String) async throws -> RoomSnapshot {
        let path = "/api/room?roomId=\(campaignId.urlEncoded)&sessionId=\(sessionId.urlEncoded)"
        let response = try await request(path: path)
        return try decoder.decode(RoomSnapshot.self, from: response.data)
    }

    func submitRoom(
        roomId: String,
        sessionId: String,
        playerId: String?,
        message: String,
        mode: ComposerMode,
        clientMessageId: String
    ) async throws -> RoomSnapshot {
        let path = mode == .askDM ? "/api/room/ask-dm" : "/api/room/submit"
        let response = try await request(
            path: path,
            method: "POST",
            body: RoomSubmitBody(
                roomId: roomId,
                sessionId: sessionId,
                playerId: playerId,
                message: message,
                skipTurn: nil,
                rollRequestId: nil,
                rollResult: nil,
                clientMessageId: clientMessageId
            )
        )
        return try decoder.decode(RoomSnapshot.self, from: response.data)
    }

    func submitRoll(
        roomId: String,
        sessionId: String,
        playerId: String?,
        request: DiceRollRequest?,
        result: DiceRollResult,
        clientMessageId: String
    ) async throws -> RoomSnapshot {
        let response = try await self.request(
            path: "/api/room/roll",
            method: "POST",
            body: RoomSubmitBody(
                roomId: roomId,
                sessionId: sessionId,
                playerId: playerId,
                message: nil,
                skipTurn: nil,
                rollRequestId: request?.id,
                rollResult: result,
                clientMessageId: clientMessageId
            )
        )
        return try decoder.decode(RoomSnapshot.self, from: response.data)
    }

    func generateCombatCheatSheet(roomId: String, sessionId: String, playerId: String) async throws -> RoomSnapshot {
        let response = try await request(
            path: "/api/room/combat-cheat-sheet",
            method: "POST",
            body: ["roomId": roomId, "sessionId": sessionId, "playerId": playerId]
        )
        return try decoder.decode(RoomSnapshot.self, from: response.data)
    }

    func listNpcCards(campaignId: String) async throws -> [CampaignNpcCard] {
        let response = try await request(path: "/api/campaigns/\(campaignId.urlEncoded)/npc-cards")
        return try decoder.decode(CampaignNpcCardsResponse.self, from: response.data).npcCards
    }

    private func request<T: Encodable>(path: String, method: String = "GET", body: T) async throws -> HTTPResponse {
        try await request(path: path, method: method, jsonData: encoder.encode(body))
    }

    private func request(path: String, method: String = "GET") async throws -> HTTPResponse {
        try await request(path: path, method: method, jsonData: nil)
    }

    private func request(path: String, method: String = "GET", jsonObject: [String: Any]) async throws -> HTTPResponse {
        let data = try JSONSerialization.data(withJSONObject: jsonObject)
        return try await request(path: path, method: method, jsonData: data)
    }

    private func request(path: String, method: String, jsonData: Data?) async throws -> HTTPResponse {
        let url = URL(string: path, relativeTo: configuration.baseURL)!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(configuration.clientHeader, forHTTPHeaderField: "X-AI-Taverns-Client")
        if let token = sessionStore.loadSession()?.bearerToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let jsonData {
            request.httpBody = jsonData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(message: String(data: data, encoding: .utf8) ?? "Request failed.", status: http.statusCode)
        }
        return HTTPResponse(statusCode: http.statusCode, data: data)
    }

    private func characterSheetMarkdown(from draft: AdventureDraft) -> String {
        let stats = draft.stats
            .sorted { $0.key < $1.key }
            .map { "- \($0.key): \($0.value)" }
            .joined(separator: "\n")
        return """
        # \(draft.characterName)
        \(draft.species) \(draft.characterClass)

        ## Player
        \(draft.playerName)

        ## Ability Scores
        \(stats)

        ## Backstory
        \(draft.backstory.isEmpty ? "To be discovered at the table." : draft.backstory)
        """
    }
}

struct HTTPResponse {
    var statusCode: Int
    var data: Data
}

enum APIError: LocalizedError {
    case invalidResponse
    case server(message: String, status: Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The server response could not be read."
        case .server(let message, let status):
            "Request failed (\(status)): \(message)"
        }
    }
}

private struct AuthMeResponse: Codable {
    var authenticated: Bool
    var user: AuthUserResponse?
}

private struct AuthUserResponse: Codable {
    var id: String
    var email: String?
}

private struct RoomSubmitBody: Codable {
    var roomId: String
    var sessionId: String
    var playerId: String?
    var message: String?
    var skipTurn: Bool?
    var rollRequestId: String?
    var rollResult: DiceRollResult?
    var clientMessageId: String?
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
