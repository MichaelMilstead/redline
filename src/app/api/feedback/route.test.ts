import { describe, it, expect, beforeAll } from "vitest";
import { MAX_CONTENT_CHARS } from "@/lib/feedback-stream";

// route.ts constructs `new Anthropic()` at import time, which needs an API key.
// Set a dummy one before importing — the validation paths under test all return
// before any network call, so the key is never used.
process.env.ANTHROPIC_API_KEY ??= "test-key";

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});

function post(body: unknown) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/feedback — input validation", () => {
  it("returns 400 for an unparseable body", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is empty", async () => {
    const res = await POST(post({ content: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when content exceeds the payload backstop", async () => {
    const res = await POST(post({ content: "a".repeat(MAX_CONTENT_CHARS * 2) }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toMatch(/proof-of-concept/i);
  });

  it("does not 413 content within the separator-slack allowance", async () => {
    // Just over the char cap but within the 1.5x payload backstop — the guard
    // must let it through. Use an already-aborted signal so the downstream
    // streaming path short-circuits instead of making a real API call.
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "a".repeat(MAX_CONTENT_CHARS + 100) }),
      signal: AbortSignal.abort(),
    });
    const res = await POST(req);
    expect(res.status).not.toBe(413);
  });
});
