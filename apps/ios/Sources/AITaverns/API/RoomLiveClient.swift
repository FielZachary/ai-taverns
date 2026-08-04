import Foundation

final class RoomLiveClient {
    var onEvent: ((RoomSocketEvent) -> Void)?

    private let configuration: APIConfiguration
    private let roomId: String
    private let sessionId: String
    private var task: URLSessionWebSocketTask?
    private let decoder: JSONDecoder

    init(configuration: APIConfiguration, roomId: String, sessionId: String) {
        self.configuration = configuration
        self.roomId = roomId
        self.sessionId = sessionId
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func connect() {
        var components = URLComponents(url: configuration.webSocketURL.appending(path: "/api/room/live"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "roomId", value: roomId),
            URLQueryItem(name: "sessionId", value: sessionId)
        ]
        var request = URLRequest(url: components.url!)
        request.setValue(configuration.clientHeader, forHTTPHeaderField: "X-AI-Taverns-Client")
        task = URLSession.shared.webSocketTask(with: request)
        task?.resume()
        receive()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            defer { self.receive() }

            switch result {
            case .success(.string(let string)):
                if let data = string.data(using: .utf8),
                   let event = try? self.decoder.decode(RoomSocketEvent.self, from: data) {
                    self.onEvent?(event)
                }
            case .success(.data(let data)):
                if let event = try? self.decoder.decode(RoomSocketEvent.self, from: data) {
                    self.onEvent?(event)
                }
            case .failure(let error):
                self.onEvent?(.error(roomId: self.roomId, message: error.localizedDescription))
            @unknown default:
                break
            }
        }
    }
}

enum RoomSocketEvent: Decodable, Equatable {
    case roomUpdated(roomId: String, updatedAt: Date, eventId: String?)
    case roomSnapshot(roomId: String, snapshot: RoomSnapshot)
    case heartbeat(sentAt: Date)
    case error(roomId: String?, message: String)
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
                updatedAt: try container.decode(Date.self, forKey: .updatedAt),
                eventId: try container.decodeIfPresent(String.self, forKey: .eventId)
            )
        case "room_snapshot":
            self = .roomSnapshot(
                roomId: try container.decode(String.self, forKey: .roomId),
                snapshot: try container.decode(RoomSnapshot.self, forKey: .snapshot)
            )
        case "heartbeat":
            self = .heartbeat(sentAt: try container.decode(Date.self, forKey: .sentAt))
        case "error":
            self = .error(
                roomId: try container.decodeIfPresent(String.self, forKey: .roomId),
                message: try container.decode(String.self, forKey: .message)
            )
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
            self = .error(roomId: nil, message: "Unknown room event: \(type)")
        }
    }
}
