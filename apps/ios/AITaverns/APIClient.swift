import Foundation

enum APIClientError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case server(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            "The API base URL is not valid."
        case .invalidResponse:
            "The server returned a response the app could not read."
        case .server(_, let message):
            message
        }
    }
}

actor APIClient {
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var baseURLString: String

    init(baseURLString: String, session: URLSession = .shared) {
        self.baseURLString = baseURLString
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func updateBaseURL(_ value: String) {
        baseURLString = value
    }

    func listCampaigns() async throws -> [CampaignSummary] {
        let response: CampaignListResponse = try await request(path: "/api/campaigns")
        return response.campaigns
    }

    func createCampaign(_ body: CampaignCreateRequest) async throws -> CampaignSummary {
        let response: CampaignCreateResponse = try await request(
            path: "/api/campaigns",
            method: "POST",
            body: body
        )

        return response.campaign
    }

    func joinCampaign(_ body: CampaignJoinRequest) async throws -> CampaignSummary {
        let response: CampaignJoinResponse = try await request(
            path: "/api/campaigns/join",
            method: "POST",
            body: body
        )

        return response.campaign
    }

    func previewJoinCode(_ code: String) async throws -> CampaignJoinPreviewResponse {
        try await request(
            path: "/api/campaigns/join/preview",
            method: "POST",
            body: ["gameCode": code]
        )
    }

    func readRoom(roomId: UUID, sessionId: String? = nil) async throws -> RoomSnapshot {
        var queryItems = [URLQueryItem(name: "roomId", value: roomId.uuidString)]

        if let sessionId {
            queryItems.append(URLQueryItem(name: "sessionId", value: sessionId))
        }

        return try await request(path: "/api/room", queryItems: queryItems)
    }

    func updatePlayer(_ body: RoomPlayerUpdateRequest) async throws -> RoomSnapshot {
        try await request(path: "/api/room/player", method: "POST", body: body)
    }

    func beginRoom(_ body: RoomBeginRequest) async throws -> RoomSnapshot {
        try await request(path: "/api/room/begin", method: "POST", body: body)
    }

    func submitTurn(_ body: RoomSubmitRequest) async throws -> RoomSnapshot {
        try await request(path: "/api/room/submit", method: "POST", body: body)
    }

    func createInvite(campaignId: UUID) async throws -> CampaignInvite {
        let response: CampaignInviteCreateResponse = try await request(
            path: "/api/campaigns/\(campaignId.uuidString)/invites",
            method: "POST",
            body: [String: String]()
        )

        return response.invite
    }

    func roomEvents(roomId: UUID, sessionId: String) throws -> AsyncThrowingStream<RoomSocketEvent, Error> {
        guard var components = URLComponents(url: try baseURL().appending(path: "/api/room/live"), resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidBaseURL
        }

        components.scheme = components.scheme == "https" ? "wss" : "ws"
        components.queryItems = [
            URLQueryItem(name: "roomId", value: roomId.uuidString),
            URLQueryItem(name: "sessionId", value: sessionId)
        ]

        guard let url = components.url else {
            throw APIClientError.invalidBaseURL
        }

        let socket = session.webSocketTask(with: url)
        socket.resume()

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    while !Task.isCancelled {
                        let message = try await socket.receive()
                        let data: Data

                        switch message {
                        case .string(let text):
                            data = Data(text.utf8)
                        case .data(let value):
                            data = value
                        @unknown default:
                            continue
                        }

                        continuation.yield(try decoder.decode(RoomSocketEvent.self, from: data))
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
                socket.cancel(with: .goingAway, reason: nil)
            }
        }
    }

    private func request<Response: Decodable>(
        path: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> Response {
        try await request(path: path, method: "GET", queryItems: queryItems, bodyData: nil)
    }

    private func request<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        body: Body
    ) async throws -> Response {
        try await request(
            path: path,
            method: method,
            queryItems: queryItems,
            bodyData: try encoder.encode(body)
        )
    }

    private func request<Response: Decodable>(
        path: String,
        method: String,
        queryItems: [URLQueryItem],
        bodyData: Data?
    ) async throws -> Response {
        guard var components = URLComponents(url: try baseURL().appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidBaseURL
        }

        components.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let url = components.url else {
            throw APIClientError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = bodyData
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if bodyData != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            let message = decodeErrorMessage(from: data) ?? "Request failed with status \(httpResponse.statusCode)."
            throw APIClientError.server(statusCode: httpResponse.statusCode, message: message)
        }

        return try decoder.decode(Response.self, from: data)
    }

    private func baseURL() throws -> URL {
        guard let url = URL(string: baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw APIClientError.invalidBaseURL
        }

        return url
    }

    private func decodeErrorMessage(from data: Data) -> String? {
        if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
            return envelope.error?.message
        }

        return String(data: data, encoding: .utf8)
    }
}
