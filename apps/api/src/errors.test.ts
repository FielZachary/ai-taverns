import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiErrorResponseSchema } from "@ai-dnd/contracts";

import { app } from "./test/app-test-harness.js";

test("missing routes use the standard error envelope", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/missing"
  });

  assert.equal(response.statusCode, 404);
  assert.doesNotThrow(() => ApiErrorResponseSchema.parse(response.json()));
});
