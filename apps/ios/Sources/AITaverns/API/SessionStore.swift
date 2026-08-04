import Foundation

struct SessionStore {
    private let key = "ai-taverns.session"

    func loadSession() -> AuthSession? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    func save(_ session: AuthSession) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
