import { describe, it, expect } from "vitest";
import {
  resolveRange,
  parseStreamingFeedback,
  encodeSse,
  type FeedbackStreamEvent,
  type ResolvedStreamItem,
} from "./feedback-stream";

describe("resolveRange", () => {
  it("locates a quote and returns its character range", () => {
    expect(resolveRange("hello world", "world")).toEqual({ start: 6, end: 11 });
  });

  it("returns the first occurrence when the quote repeats", () => {
    expect(resolveRange("ab ab", "ab")).toEqual({ start: 0, end: 2 });
  });

  it("returns null when the quote is absent", () => {
    expect(resolveRange("hello", "xyz")).toBeNull();
  });

  it("handles a quote spanning the whole string", () => {
    expect(resolveRange("abc", "abc")).toEqual({ start: 0, end: 3 });
  });
});

describe("parseStreamingFeedback", () => {
  const content = "hello world";

  it("returns [] for an empty or whitespace buffer", () => {
    expect(parseStreamingFeedback("", content)).toEqual([]);
    expect(parseStreamingFeedback("   ", content)).toEqual([]);
  });

  it("returns [] before a feedback array has streamed in", () => {
    expect(parseStreamingFeedback("{", content)).toEqual([]);
    expect(parseStreamingFeedback('{"feedback":[', content)).toEqual([]);
  });

  it("parses a complete item and resolves its range", () => {
    const buf = JSON.stringify({
      feedback: [
        {
          quote: "world",
          comment: "c",
          severity: "issue",
          suggestions: [{ style: "S", text: "T" }],
        },
      ],
    });
    expect(parseStreamingFeedback(buf, content)).toEqual<ResolvedStreamItem[]>([
      {
        quote: "world",
        comment: "c",
        severity: "issue",
        suggestions: [{ style: "S", text: "T" }],
        range: { start: 6, end: 11 },
      },
    ]);
  });

  it("parses a partial (truncated) buffer mid-stream", () => {
    const buf = '{"feedback":[{"quote":"world","comment":"hal';
    const result = parseStreamingFeedback(buf, content);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      quote: "world",
      comment: "hal",
      severity: "suggestion", // default until streamed
      suggestions: [],
      range: { start: 6, end: 11 },
    });
  });

  it("drops items that have no quote yet", () => {
    const buf = JSON.stringify({ feedback: [{ comment: "x" }] });
    expect(parseStreamingFeedback(buf, content)).toEqual([]);
  });

  it("defaults an unknown severity to 'suggestion'", () => {
    const buf = JSON.stringify({
      feedback: [{ quote: "world", severity: "nonsense" }],
    });
    expect(parseStreamingFeedback(buf, content)[0]?.severity).toBe("suggestion");
  });

  it("filters out empty suggestions and fills missing fields", () => {
    const buf = JSON.stringify({
      feedback: [
        {
          quote: "world",
          suggestions: [{ style: "", text: "" }, { style: "A" }],
        },
      ],
    });
    expect(parseStreamingFeedback(buf, content)[0]?.suggestions).toEqual([
      { style: "A", text: "" },
    ]);
  });

  it("sets range to null when the quote isn't in the content", () => {
    const buf = JSON.stringify({ feedback: [{ quote: "absent" }] });
    expect(parseStreamingFeedback(buf, content)[0]?.range).toBeNull();
  });
});

describe("encodeSse", () => {
  function parseBlock(block: string) {
    const lines = block.replace(/\n\n$/, "").split("\n");
    const event = lines.find((l) => l.startsWith("event: "))?.slice(7);
    const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6);
    return { event, data: dataLine ? JSON.parse(dataLine) : undefined };
  }

  it("encodes a partial event with its feedback payload", () => {
    const feedback: ResolvedStreamItem[] = [
      {
        quote: "world",
        comment: "c",
        severity: "issue",
        suggestions: [],
        range: null,
      },
    ];
    const block = encodeSse({ type: "partial", feedback });
    expect(block.endsWith("\n\n")).toBe(true);
    expect(parseBlock(block)).toEqual({ event: "partial", data: { feedback } });
  });

  it("encodes a done event", () => {
    expect(encodeSse({ type: "done" })).toBe("event: done\ndata: {}\n\n");
  });

  it("encodes an error event", () => {
    const event: FeedbackStreamEvent = { type: "error", error: "boom" };
    expect(parseBlock(encodeSse(event))).toEqual({
      event: "error",
      data: { error: "boom" },
    });
  });
});
