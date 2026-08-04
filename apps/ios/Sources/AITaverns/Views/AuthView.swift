import AuthenticationServices
import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var email = ""
    @State private var sentEmail: String?
    @State private var errorMessage: String?
    @State private var isSending = false

    private var emailIsValid: Bool {
        email.contains("@") && email.contains(".")
    }

    var body: some View {
        ZStack {
            TavernTheme.background
            LinearGradient(
                colors: [.clear, TavernTheme.bg.opacity(0.92)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            if let sentEmail {
                magicLinkSent(email: sentEmail)
            } else {
                signInForm
            }
        }
        .foregroundStyle(TavernTheme.ink)
    }

    private var signInForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Spacer()

            Text("AI TAVERNS")
                .cinzel(34, weight: .bold)
                .tracking(2.4)

            Text("An AI Dungeon Master. Your table, anywhere.")
                .font(.system(size: 17, design: .serif))
                .foregroundStyle(TavernTheme.muted)
                .padding(.bottom, 22)

            Button {
                startGoogleAuth()
            } label: {
                HStack {
                    Image(systemName: "globe")
                    Text("Continue with Google")
                }
                .frame(maxWidth: .infinity, minHeight: 50)
                .foregroundStyle(Color(hex: 0x241505))
                .background(Color(hex: 0xF4EFE6))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            TextField("Email address", text: $email)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                #endif
                .autocorrectionDisabled()
                .padding(.horizontal, 16)
                .frame(minHeight: 50)
                .background(TavernTheme.panelStrong)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(TavernTheme.line, lineWidth: 1)
                )

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(TavernTheme.ember)
            }

            Button {
                Task { await sendMagicLink() }
            } label: {
                Text(isSending ? "Sending..." : "Send magic link")
            }
            .buttonStyle(GoldButtonStyle(disabled: !emailIsValid || isSending))
            .disabled(!emailIsValid || isSending)

            Text("By continuing, you agree to the AI Taverns terms and privacy policy.")
                .font(.caption)
                .foregroundStyle(TavernTheme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                .padding(.bottom, 30)
        }
        .padding(.horizontal, 24)
    }

    private func magicLinkSent(email: String) -> some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "envelope")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(TavernTheme.goldBright)
                .frame(width: 76, height: 76)
                .background(TavernTheme.panel)
                .clipShape(Circle())
                .overlay(Circle().stroke(TavernTheme.gold, lineWidth: 1))

            Text("Check your email")
                .cinzel(22)
            Text("We sent a sign-in link to \(email). Open it on this device to continue.")
                .font(.system(size: 15))
                .foregroundStyle(TavernTheme.muted)
                .multilineTextAlignment(.center)

            Button("Resend link") {
                Task { await sendMagicLink() }
            }
            .buttonStyle(GoldButtonStyle())

            Button("Wrong address? Go back") {
                sentEmail = nil
            }
            .font(.caption)
            .foregroundStyle(TavernTheme.gold)
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    private func sendMagicLink() async {
        isSending = true
        defer { isSending = false }
        do {
            try await appModel.apiClient.startMagicLink(email: email)
            sentEmail = email
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func startGoogleAuth() {
        guard let startURL = URL(string: "/api/auth/google/start", relativeTo: appModel.apiClient.configuration.baseURL) else { return }
        #if os(iOS)
        let session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: "aitaverns") { callback, error in
            if let token = callback?.queryValue(named: "mobileToken") {
                Task { @MainActor in
                    appModel.signIn(session: AuthSession(userId: "mobile", email: nil, bearerToken: token))
                }
            } else if let error {
                errorMessage = error.localizedDescription
            } else {
                errorMessage = "Google sign-in needs the mobile session bridge endpoint before it can finish."
            }
        }
        session.presentationContextProvider = AuthPresentationContextProvider.shared
        session.prefersEphemeralWebBrowserSession = false
        session.start()
        #else
        errorMessage = "Google sign-in is available on iOS devices."
        #endif
    }
}

#if os(iOS)
final class AuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AuthPresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
#endif

private extension URL {
    func queryValue(named name: String) -> String? {
        URLComponents(url: self, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == name }?
            .value
    }
}
