import SwiftUI

struct DiceRollerView: View {
    @Environment(\.dismiss) private var dismiss
    let request: DiceRollRequest
    let onSubmit: (DiceRollResult) -> Void

    @State private var rolls: [Int] = []

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text(request.label)
                        .font(.title2.bold())

                    Text(request.reason ?? request.dice)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if rolls.isEmpty {
                    Image(systemName: "die.face.5.fill")
                        .font(.system(size: 80))
                        .foregroundStyle(Color.tavernAccent)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 64))], spacing: 12) {
                        ForEach(Array(rolls.enumerated()), id: \.offset) { _, value in
                            Text("\(value)")
                                .font(.title.bold())
                                .frame(width: 64, height: 64)
                                .background(Color.tavernPanel, in: RoundedRectangle(cornerRadius: 14))
                        }
                    }

                    Text("Total \(total)")
                        .font(.largeTitle.bold())
                }

                Button {
                    withAnimation(.spring) {
                        rolls = rollDice(notation: request.dice)
                    }
                } label: {
                    Label(rolls.isEmpty ? "Roll" : "Roll Again", systemImage: "die.face.6")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    onSubmit(DiceRollResult(rolls: rolls, total: total))
                    dismiss()
                } label: {
                    Text("Submit Result")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(rolls.isEmpty)
            }
            .padding()
            .navigationTitle("Dice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var total: Int {
        rolls.reduce(0, +) + (request.modifier ?? 0)
    }

    private func rollDice(notation: String) -> [Int] {
        let pattern = #"(?i)(\d*)d(\d+)"#
        guard
            let regex = try? NSRegularExpression(pattern: pattern),
            let match = regex.firstMatch(in: notation, range: NSRange(notation.startIndex..., in: notation)),
            let sidesRange = Range(match.range(at: 2), in: notation)
        else {
            return [Int.random(in: 1...20)]
        }

        let countRange = Range(match.range(at: 1), in: notation)
        let countText = countRange.map { String(notation[$0]) } ?? ""
        let count = Int(countText).map { max($0, 1) } ?? 1
        let sides = max(Int(notation[sidesRange]) ?? 20, 2)

        return (0..<count).map { _ in Int.random(in: 1...sides) }
    }
}
