import SwiftUI

enum TavernTheme {
    static let bg = Color(hex: 0x120F0D)
    static let panel = Color(hex: 0x261D17).opacity(0.86)
    static let panelStrong = Color(hex: 0x38281F).opacity(0.96)
    static let line = Color(hex: 0xE2B05D).opacity(0.24)
    static let gold = Color(hex: 0xD9A94A)
    static let goldBright = Color(hex: 0xF4CF7A)
    static let ember = Color(hex: 0xAD472B)
    static let moss = Color(hex: 0x5F7751)
    static let ink = Color(hex: 0xF9EDD6)
    static let muted = Color(hex: 0xBCA98E)
    static let scrim = Color(hex: 0x070503).opacity(0.62)

    static let screenMargin: CGFloat = 16
    static let cardPadding: CGFloat = 14
    static let cardRadius: CGFloat = 10
    static let bubbleRadius: CGFloat = 16
    static let buttonRadius: CGFloat = 10
    static let minTapTarget: CGFloat = 44

    static var background: some View {
        ZStack {
            bg
            LinearGradient(
                colors: [
                    Color(hex: 0xAD472B).opacity(0.22),
                    Color.clear,
                    Color(hex: 0x5F7751).opacity(0.18)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .blur(radius: 30)
        }
        .ignoresSafeArea()
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

extension View {
    func tavernCard(radius: CGFloat = TavernTheme.cardRadius) -> some View {
        self
            .padding(TavernTheme.cardPadding)
            .background(TavernTheme.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(TavernTheme.line, lineWidth: 1)
            )
    }

    func tavernScreen() -> some View {
        self
            .background(TavernTheme.background)
            .scrollContentBackground(.hidden)
            .tint(TavernTheme.gold)
    }

    func cinzel(_ size: CGFloat, weight: Font.Weight = .semibold) -> some View {
        self.font(.system(size: size, weight: weight, design: .serif).smallCaps())
    }
}

struct GoldButtonStyle: ButtonStyle {
    var disabled = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(disabled ? TavernTheme.muted : Color(hex: 0x241505))
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(disabled ? TavernTheme.panelStrong : TavernTheme.gold)
            .clipShape(RoundedRectangle(cornerRadius: TavernTheme.buttonRadius, style: .continuous))
            .opacity(configuration.isPressed ? 0.78 : 1)
    }
}

struct IconCircle: View {
    let systemName: String
    let label: String

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(TavernTheme.goldBright)
            .frame(width: 34, height: 34)
            .background(TavernTheme.panelStrong)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(TavernTheme.line, lineWidth: 1)
            )
            .accessibilityLabel(label)
    }
}
