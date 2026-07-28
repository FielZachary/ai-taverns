import SwiftUI

struct NewAdventureView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var draft = NewAdventureDraft()

    var body: some View {
        NavigationStack {
            Form {
                NativeSection(title: "Table") {
                    Picker("Mode", selection: $draft.mode) {
                        ForEach(CampaignMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }

                    TextField("Campaign title", text: $draft.title)
                }

                NativeSection(title: "World") {
                    TextField("Genre", text: $draft.genre)

                    TextField("Custom world name", text: $draft.customWorldName)

                    TextEditor(text: $draft.customWorldDescription)
                        .frame(minHeight: 120)
                        .overlay(alignment: .topLeading) {
                            if draft.customWorldDescription.isEmpty {
                                Text("Custom world details")
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 8)
                                    .padding(.leading, 5)
                            }
                        }
                }

                NativeSection(title: "Player") {
                    TextField("Your name", text: $draft.playerName)
                    TextField("Character name", text: $draft.characterName)

                    Toggle("Generate portrait", isOn: $draft.generatePortrait)
                }

                NativeSection(title: "Character Sheet") {
                    TextEditor(text: $draft.characterSheet)
                        .frame(minHeight: 220)
                        .overlay(alignment: .topLeading) {
                            if draft.characterSheet.isEmpty {
                                Text("Paste or write your character sheet")
                                    .foregroundStyle(.tertiary)
                                    .padding(.top, 8)
                                    .padding(.leading, 5)
                            }
                        }
                }
            }
            .navigationTitle("New Adventure")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            await appState.createCampaign(from: draftWithDefaults)
                            if appState.errorMessage == nil {
                                dismiss()
                            }
                        }
                    }
                    .disabled(!canCreate || appState.isSending)
                }
            }
        }
    }

    private var draftWithDefaults: NewAdventureDraft {
        var value = draft

        if value.playerName.trimmedOrNil == nil {
            value.playerName = appState.playerName
        }

        return value
    }

    private var canCreate: Bool {
        draft.characterName.trimmedOrNil != nil && draft.characterSheet.trimmedOrNil != nil
    }
}
