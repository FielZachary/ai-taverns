import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var appState = appState

        NavigationStack {
            Form {
                NativeSection(title: "Connection") {
                    TextField("API Base URL", text: $appState.apiBaseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                NativeSection(title: "Player") {
                    TextField("Display name", text: Binding(
                        get: { appState.playerName },
                        set: { appState.updatePlayerName($0) }
                    ))

                    LabeledContent("Client ID", value: appState.clientId)
                }

                NativeSection(title: "DM Model") {
                    Picker("Model", selection: Binding(
                        get: { appState.selectedModel },
                        set: { appState.updateSelectedModel($0) }
                    )) {
                        ForEach(AIModelID.allCases) { model in
                            Text(model.title).tag(model)
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
