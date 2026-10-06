import { describe, expect, it } from "vitest";

import { formatOutputForDiff } from "./dm-lab";

describe("formatOutputForDiff", () => {
  it("pretty-prints JSON responses before they are diffed", () => {
    expect(formatOutputForDiff('{"narration":"The door opens.","updates":{"hp":12}}')).toBe(`{
  "narration": "The door opens.",
  "updates": {
    "hp": 12
  }
}`);
  });

  it("leaves non-JSON responses unchanged", () => {
    expect(formatOutputForDiff("The door opens.")).toBe("The door opens.");
  });
});
