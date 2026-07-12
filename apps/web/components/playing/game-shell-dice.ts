import type {
  DiceRollRequest,
  DiceRollResult,
  DiceRollSubmission
} from "@/lib/game-types";
import type {
  DiceFace,
  QueuedDice
} from "./PlayerInput";

export type PendingRollBatch = {
  requests: DiceRollRequest[];
  expression: string;
  notation: string;
  entries: {
    request: DiceRollRequest;
    count: number;
    sides: number;
  }[];
};

function modifierText(modifier: number | undefined) {
  if (!modifier) {
    return "";
  }

  return modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
}

function parseSimpleDiceExpression(dice: string) {
  const match = dice.trim().match(/^(\d*)d(4|6|8|10|12|20)$/i);

  if (!match) {
    return null;
  }

  return {
    count: Number(match[1] || "1"),
    sides: Number(match[2])
  };
}

function diceExpression(count: number, sides: number) {
  return `${count}d${sides}`;
}

function normalizedAdvantageState(request: DiceRollRequest) {
  const state = request.advantageState?.trim().toLowerCase();

  return state === "advantage" || state === "disadvantage" ? state : "normal";
}

function physicalRollCountForRequest(
  request: DiceRollRequest,
  count: number,
  sides: number
) {
  return count === 1 &&
    sides === 20 &&
    normalizedAdvantageState(request) !== "normal"
    ? 2
    : count;
}

function scoredRollsForRequest(request: DiceRollRequest, rolls: number[]) {
  const advantageState = normalizedAdvantageState(request);

  if (rolls.length === 2 && advantageState === "advantage") {
    return [Math.max(...rolls)];
  }

  if (rolls.length === 2 && advantageState === "disadvantage") {
    return [Math.min(...rolls)];
  }

  return rolls;
}

function queuedDiceEntries(queuedDice: QueuedDice) {
  const faceOrder: DiceFace[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

  return faceOrder
    .map((face) => ({
      face,
      count: queuedDice[face] ?? 0
    }))
    .filter((entry) => entry.count > 0);
}

function diceExpressionFromQueue(queuedDice: QueuedDice) {
  return queuedDiceEntries(queuedDice)
    .map(({ face, count }) => `${count}${face}`)
    .join(" + ");
}

function diceNotationFromQueue(queuedDice: QueuedDice) {
  return queuedDiceEntries(queuedDice)
    .map(({ face, count }) => `${count}${face}`)
    .join("+");
}

function diceFaceFromSides(sides: number): DiceFace | null {
  const face = `d${sides}` as DiceFace;

  return ["d4", "d6", "d8", "d10", "d12", "d20"].includes(face)
    ? face
    : null;
}

function diceExpressionFromBatchEntries(
  entries: PendingRollBatch["entries"],
  separator = " + "
) {
  const groups: { count: number; sides: number }[] = [];

  entries.forEach((entry) => {
    const previousGroup = groups[groups.length - 1];

    if (previousGroup?.sides === entry.sides) {
      previousGroup.count += entry.count;
      return;
    }

    groups.push({
      count: entry.count,
      sides: entry.sides
    });
  });

  return groups
    .map((group) => diceExpression(group.count, group.sides))
    .join(separator);
}

export function requiredDiceQueueFromRequests(
  pendingRequests: DiceRollRequest[]
) {
  const queuedDice: QueuedDice = {};
  const entries: PendingRollBatch["entries"] = [];

  for (const request of pendingRequests) {
    const parsed = parseSimpleDiceExpression(request.dice);
    const face = parsed ? diceFaceFromSides(parsed.sides) : null;

    if (!parsed || !face) {
      return null;
    }

    const physicalCount = physicalRollCountForRequest(
      request,
      parsed.count,
      parsed.sides
    );

    queuedDice[face] = (queuedDice[face] ?? 0) + physicalCount;
    entries.push({
      request,
      count: physicalCount,
      sides: parsed.sides
    });
  }

  return {
    queuedDice,
    entries,
    expression: diceExpressionFromBatchEntries(entries),
    notation: diceExpressionFromBatchEntries(entries, "+")
  };
}

function diceQueuesMatch(left: QueuedDice, right: QueuedDice) {
  const faces: DiceFace[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

  return faces.every((face) => (left[face] ?? 0) === (right[face] ?? 0));
}

export function predeterminedDiceNotation(dice: string, rolls: number[]) {
  return `${dice.replace(/\s+/g, "")}@${rolls.join(",")}`;
}

export function rollQueuedDice(queuedDice: QueuedDice) {
  const entries = queuedDiceEntries(queuedDice);
  const rollsByFace = entries.map(({ face, count }) => {
    const sides = Number(face.slice(1));
    const rolls = Array.from(
      { length: count },
      () => Math.floor(Math.random() * sides) + 1
    );

    return {
      face,
      rolls
    };
  });
  const total = rollsByFace.reduce(
    (sum, group) =>
      sum + group.rolls.reduce((groupSum, roll) => groupSum + roll, 0),
    0
  );
  const details = rollsByFace
    .map(({ face, rolls }) => `${face}: ${rolls.join(", ")}`)
    .join("; ");
  const rolls = rollsByFace.flatMap((group) => group.rolls);
  const notation = predeterminedDiceNotation(
    diceNotationFromQueue(queuedDice),
    rolls
  );

  return {
    expression: diceExpressionFromQueue(queuedDice),
    notation,
    rolls,
    total,
    content: `I rolled ${diceExpressionFromQueue(queuedDice)}: ${total} (${details}).`
  };
}

export function pendingRollBatchFromQueue(
  queuedDice: QueuedDice,
  pendingRequests: DiceRollRequest[]
): PendingRollBatch | null {
  const requiredDice = requiredDiceQueueFromRequests(pendingRequests);

  if (!requiredDice || !diceQueuesMatch(queuedDice, requiredDice.queuedDice)) {
    return null;
  }

  return {
    requests: pendingRequests,
    expression: requiredDice.expression,
    notation: requiredDice.notation,
    entries: requiredDice.entries
  };
}

export function expectedPendingRollExpression(
  pendingRequests: DiceRollRequest[]
) {
  const requiredDice = requiredDiceQueueFromRequests(pendingRequests);

  return requiredDice?.expression || pendingRequests[0]?.dice || "the required dice";
}

export function rollPendingBatch(
  batch: PendingRollBatch,
  clientMessageId: string
) {
  const rolls: number[] = [];
  const rollSubmissions: DiceRollSubmission[] = batch.entries.map((entry) => {
    const requestRolls = Array.from(
      { length: entry.count },
      () => Math.floor(Math.random() * entry.sides) + 1
    );

    rolls.push(...requestRolls);

    return {
      rollRequestId: entry.request.id,
      rollResult: {
        rolls: requestRolls,
        total: scoredRollsForRequest(entry.request, requestRolls).reduce(
          (sum, roll) => sum + roll,
          entry.request.modifier ?? 0
        )
      },
      clientMessageId
    };
  });
  const total = rollSubmissions.reduce(
    (sum, submission) => sum + submission.rollResult.total,
    0
  );
  const content = rollSubmissions
    .map((submission, index) =>
      formatRollSubmission(batch.requests[index], submission.rollResult)
    )
    .join("\n");

  return {
    rolls,
    total,
    content,
    rollSubmissions
  };
}

function formatRollSubmission(
  request: DiceRollRequest,
  result: DiceRollResult
) {
  const rollText =
    result.rolls.length === 1
      ? String(result.rolls[0])
      : result.rolls.join(", ");

  return `I rolled ${request.dice}${modifierText(request.modifier)}: ${
    result.total
  } (${rollText}) for ${request.label}.`;
}
