import SwiftUI

struct DiceSheet: View {
    @EnvironmentObject private var appModel: AppModel
    @Environment(\.dismiss) private var dismiss
    let request: DiceRollRequest?

    @State private var selectedDice: [String: Int] = [:]
    @State private var result: DiceRollResult?
    @State private var isRolling = false

    private let diceFaces = ["d4", "d6", "d8", "d10", "d12", "d20"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                if let result {
                    resultView(result)
                } else if let request {
                    requiredRollView(request)
                } else {
                    freeRollView
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color(hex: 0x1C1511).ignoresSafeArea())
            .navigationTitle(request == nil ? "Roll the Dice" : "Roll Required")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }

    private var freeRollView: some View {
        VStack(spacing: 18) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(diceFaces, id: \.self) { die in
                    DieButton(label: die, count: selectedDice[die, default: 0]) {
                        let total = selectedDice.values.reduce(0, +)
                        guard total < 10 else { return }
                        selectedDice[die, default: 0] += 1
                    }
                    .contextMenu {
                        Button("Clear \(die)") { selectedDice[die] = nil }
                    }
                }
            }

            HStack {
                Text(summary)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(TavernTheme.goldBright)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(TavernTheme.gold.opacity(0.12))
                    .clipShape(Capsule())
                Spacer()
                Button("Clear") { selectedDice.removeAll() }
                    .foregroundStyle(TavernTheme.gold)
            }

            Button("Roll") {
                rollFreeDice()
            }
            .buttonStyle(GoldButtonStyle(disabled: selectedDice.isEmpty || isRolling))
            .disabled(selectedDice.isEmpty || isRolling)

            Text("Results are posted to the table for the DM to see.")
                .font(.caption)
                .foregroundStyle(TavernTheme.muted)
        }
    }

    private func requiredRollView(_ request: DiceRollRequest) -> some View {
        VStack(spacing: 18) {
            Pill("Roll required", color: TavernTheme.ember)
            Text(request.label)
                .cinzel(18)
            Text(formula(for: request))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TavernTheme.goldBright)

            DieButton(label: request.dice, count: 0) {}
                .frame(width: 84, height: 84)
                .allowsHitTesting(false)

            Button("Roll \(request.dice)") {
                rollRequired(request)
            }
            .buttonStyle(GoldButtonStyle(disabled: isRolling))
            .disabled(isRolling)
        }
        .frame(maxWidth: .infinity)
    }

    private func resultView(_ result: DiceRollResult) -> some View {
        VStack(spacing: 18) {
            Text("\(result.rolls.first ?? result.total)")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .foregroundStyle(TavernTheme.goldBright)
                .frame(width: 96, height: 96)
                .background(TavernTheme.gold.opacity(0.16))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: TavernTheme.gold.opacity(0.35), radius: 24)

            Text(resultLine(result))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(TavernTheme.ink)

            if let dc = request?.visibleDC {
                Pill(result.total >= dc ? "Success" : "Failure", color: result.total >= dc ? TavernTheme.moss : TavernTheme.ember)
            }

            Button("Continue") {
                Task {
                    await appModel.submitRoll(result, request: request)
                    dismiss()
                }
            }
            .buttonStyle(GoldButtonStyle())
        }
    }

    private var summary: String {
        let parts = selectedDice
            .sorted { $0.key < $1.key }
            .map { "\($0.value) x \($0.key)" }
        return parts.isEmpty ? "Choose dice" : "Rolling: " + parts.joined(separator: ", ")
    }

    private func rollFreeDice() {
        isRolling = true
        let rolls = selectedDice.flatMap { die, count in
            Array(repeating: die.sides, count: count).map { Int.random(in: 1...$0) }
        }
        Haptics.diceImpact()
        result = DiceRollResult(rolls: rolls, total: rolls.reduce(0, +))
        isRolling = false
    }

    private func rollRequired(_ request: DiceRollRequest) {
        isRolling = true
        let raw = Int.random(in: 1...request.dice.sides)
        let total = raw + (request.modifier ?? 0)
        Haptics.diceImpact()
        result = DiceRollResult(rolls: [raw], total: total)
        isRolling = false
    }

    private func formula(for request: DiceRollRequest) -> String {
        let modifier = request.modifier.map { $0 >= 0 ? " +\($0)" : " \($0)" } ?? ""
        let dc = request.visibleDC.map { " · DC \($0)" } ?? ""
        return "\(request.dice)\(modifier)\(dc)"
    }

    private func resultLine(_ result: DiceRollResult) -> String {
        if let request {
            let modifier = request.modifier ?? 0
            let dc = request.visibleDC.map { " vs DC \($0)" } ?? ""
            return "\(result.rolls.first ?? result.total) \(modifier >= 0 ? "+" : "")\(modifier) = \(result.total)\(dc)"
        }
        return "Total \(result.total)"
    }
}

struct DieButton: View {
    let label: String
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Text(label)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(count > 0 ? TavernTheme.goldBright : TavernTheme.ink)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(TavernTheme.panelStrong)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(count > 0 ? TavernTheme.gold : TavernTheme.line, lineWidth: count > 0 ? 2 : 1)
                    )
                if count > 0 {
                    Text("\(count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color(hex: 0x241505))
                        .frame(width: 20, height: 20)
                        .background(TavernTheme.gold)
                        .clipShape(Circle())
                        .offset(x: 6, y: -6)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private extension String {
    var sides: Int {
        Int(dropFirst()) ?? 20
    }
}
