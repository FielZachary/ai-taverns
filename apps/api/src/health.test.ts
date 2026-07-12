import assert from "node:assert/strict";
import { test } from "node:test";

import { app } from "./test/app-test-harness.js";

test("GET /health returns the API health contract", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "api",
    timestamp: response.json().timestamp
  });
});

