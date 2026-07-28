import SwiftUI

extension Color {
    static let tavernBackground = Color(.systemGroupedBackground)
    static let tavernPanel = Color(.secondarySystemGroupedBackground)
    static let tavernAccent = Color(red: 0.58, green: 0.18, blue: 0.24)
}

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(message)
        }
    }
}

struct ErrorBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)

            Text(message)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss error")
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }
}

struct CampaignThumbnail: View {
    let campaign: CampaignSummary

    var body: some View {
        Group {
            if let value = campaign.portraitUrl, let url = URL(string: value) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        fallback
                    @unknown default:
                        fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: 52, height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var fallback: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.tavernAccent.gradient)
            Image(systemName: campaign.mode == .multiplayer ? "person.3.fill" : "sparkles")
                .font(.title3)
                .foregroundStyle(.white)
        }
    }
}

struct NativeSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        Section {
            content
        } header: {
            Text(title)
        }
    }
}
