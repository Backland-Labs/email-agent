import { describe, expect, it } from "vitest";

import { DRAFT_REPLY_ENDPOINT_DEPENDENCIES_CONTRACT } from "../../src/handlers/draft-reply-endpoint-dependencies.js";

describe("draft reply endpoint dependency contract", () => {
  it("exposes contract marker", () => {
    expect(DRAFT_REPLY_ENDPOINT_DEPENDENCIES_CONTRACT).toBe("v1");
  });
});
