import { describe, expect, it } from "vitest";

import { handleHealthEndpoint } from "../../src/handlers/health-endpoint.js";

describe("handleHealthEndpoint", () => {
  it("returns 200 with status ok JSON body", async () => {
    const response = handleHealthEndpoint();
    const data = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(data).toEqual({ status: "ok" });
  });
});
