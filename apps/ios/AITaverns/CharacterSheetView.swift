import SwiftUI

struct CharacterSheetView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let snapshot: RoomSnapshot?

    @State private var characterName = ""
    @State private var characterSheet = ""

    var body: some View {
        NavigationStack {
            Form {
                NativeSection(title: "Character") {
                    TextField("Character name", text: $characterName)
                }

                NativeSection(title: "Sheet") {
                    TextEditor(text: $characterSheet)
                        .font(.body.monospaced())
                        .frame(minHeight: 360)
                }

                if let players = snapshot?.players, !players.isEmpty {
                    NativeSection(title: "Table") {
                        ForEach(players) { player in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(player.characterName)
                                    Text(player.username)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                Text(player.status.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(player.status == .submitted ? .green : .secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Character")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await appState.updateCurrentPlayer(
                                characterName: characterName,
                                characterSheet: characterSheet
                            )
                            dismiss()
                        }
                    }
                    .disabled(characterName.trimmedOrNil == nil || characterSheet.trimmedOrNil == nil)
                }
            }
        }
        .onAppear {
            let currentPlayer = snapshot?.players.first { $0.id == appState.clientId } ?? snapshot?.players.first
            characterName = currentPlayer?.characterName ?? ""
            characterSheet = currentPlayer?.characterSheet ?? ""
        }
    }
}
