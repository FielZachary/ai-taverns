import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import type { DiceRollRequest } from "@/lib/game-types";
import {
  expectedPendingRollExpression,
  pendingRollBatchFromQueue,
  requiredDiceQueueFromRequests,
  rollPendingBatch,
  rollQueuedDice
} from "./game-shell-dice";

function request(
  id: string,
  dice: string,
  overrides: Partial<DiceRollRequest> = {}
): DiceRollRequest {
  return {
    id,
    dice,
    label: `Check ${id}`,
    ...overrides
  };
}

function mockRandom(...values: number[]) {
  let index = 0;

  return vi.spyOn(Math, "random").mockImplementation(() => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  });
}

describe("game shell dice helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a required dice queue and grouped expression from pending requests", () => {
    const requiredDice = requiredDiceQueueFromRequests([
      request("stealth", "d20"),
      request("damage-a", "2d6"),
      request("damage-b", "1d6"),
      request("save", "1d20", { advantageState: "advantage" })
    ]);

    expect(requiredDice).toEqual({
      queuedDice: {
        d20: 3,
        d6: 3
      },
      entries: [
        {
          request: request("stealth", "d20"),
          count: 1,
          sides: 20
        },
        {
          request: request("damage-a", "2d6"),
          count: 2,
          sides: 6
        },
        {
          request: request("damage-b", "1d6"),
          count: 1,
          sides: 6
        },
        {
          request: request("save", "1d20", { advantageState: "advantage" }),
          count: 2,
          sides: 20
        }
      ],
      expression: "1d20 + 3d6 + 2d20",
      notation: "1d20+3d6+2d20"
    });
  });

  it("falls back to the first request dice when required dice cannot be queued", () => {
    const pendingRequests = [request("odd-die", "1d100")];

    expect(requiredDiceQueueFromRequests(pendingRequests)).toBeNull();
    expect(expectedPendingRollExpression(pendingRequests)).toBe("1d100");
    expect(expectedPendingRollExpression([])).toBe("the required dice");
  });

  it("matches queued dice only when all required dice faces and counts match", () => {
    const pendingRequests = [
      request("attack", "d20"),
      request("damage", "2d6")
    ];

    expect(
      pendingRollBatchFromQueue({ d20: 1, d6: 2 }, pendingRequests)
    ).toMatchObject({
      requests: pendingRequests,
      expression: "1d20 + 2d6",
      notation: "1d20+2d6"
    });
    expect(pendingRollBatchFromQueue({ d20: 1, d6: 1 }, pendingRequests)).toBeNull();
    expect(
      pendingRollBatchFromQueue({ d20: 1, d6: 2, d4: 1 }, pendingRequests)
    ).toBeNull();
  });

  it("rolls freeform queued dice in face order with deterministic notation", () => {
    mockRandom(0, 0.5, 0.99);

    expect(rollQueuedDice({ d20: 1, d4: 2 })).toEqual({
      expression: "2d4 + 1d20",
      notation: "2d4+1d20@1,3,20",
      rolls: [1, 3, 20],
      total: 24,
      content: "I rolled 2d4 + 1d20: 24 (d4: 1, 3; d20: 20)."
    });
  });

  it("rolls pending batches with modifiers and d20 advantage scoring", () => {
    mockRandom(0.95, 0.1, 0.4);
    const pendingRequests = [
      request("advantage", "1d20", {
        label: "Strength",
        modifier: 2,
        advantageState: "advantage"
      }),
      request("damage", "1d6", {
        label: "Damage",
        modifier: -1
      })
    ];
    const batch = pendingRollBatchFromQueue(
      { d20: 2, d6: 1 },
      pendingRequests
    );

    expect(batch).not.toBeNull();
    expect(rollPendingBatch(batch!, "message-1")).toEqual({
      rolls: [20, 3, 3],
      total: 24,
      content: [
        "I rolled 1d20 + 2: 22 (20, 3) for Strength.",
        "I rolled 1d6 - 1: 2 (3) for Damage."
      ].join("\n"),
      rollSubmissions: [
        {
          rollRequestId: "advantage",
          rollResult: {
            rolls: [20, 3],
            total: 22
          },
          clientMessageId: "message-1"
        },
        {
          rollRequestId: "damage",
          rollResult: {
            rolls: [3],
            total: 2
          },
          clientMessageId: "message-1"
        }
      ]
    });
  });

  it("uses the lower d20 for disadvantage scoring", () => {
    mockRandom(0.95, 0.1);
    const batch = pendingRollBatchFromQueue(
      { d20: 2 },
      [
        request("disadvantage", "1d20", {
          label: "Wisdom",
          advantageState: "disadvantage"
        })
      ]
    );

    expect(batch).not.toBeNull();
    expect(rollPendingBatch(batch!, "message-2").rollSubmissions[0]).toEqual({
      rollRequestId: "disadvantage",
      rollResult: {
        rolls: [20, 3],
        total: 3
      },
      clientMessageId: "message-2"
    });
  });
});
