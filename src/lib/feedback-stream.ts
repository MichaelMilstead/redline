import { parse as partialParse } from "partial-json";

/** Hard cap on input length for this POC. Counts document text characters
 *  (matches the editor's CharacterCount), not payload bytes. */
export const MAX_CONTENT_CHARS = 5000;

export type StreamSuggestion = { style?: string; text?: string };

export type StreamFeedbackItem = {
  quote?: string;
  comment?: string;
  severity?: "suggestion" | "issue";
  suggestions?: StreamSuggestion[];
};

export type ResolvedStreamItem = {
  quote: string;
  comment: string;
  severity: "suggestion" | "issue";
  suggestions: { style: string; text: string }[];
  range: { start: number; end: number } | null;
};

export type FeedbackStreamEvent =
  | { type: "partial"; feedback: ResolvedStreamItem[] }
  | { type: "done" }
  | { type: "error"; error: string };

/** Locate a verbatim quote in the content and return its character range. */
export function resolveRange(
  content: string,
  quote: string,
): { start: number; end: number } | null {
  const start = content.indexOf(quote);
  if (start === -1) return null;
  return { start, end: start + quote.length };
}

function toResolvedItem(
  item: StreamFeedbackItem,
  content: string,
): ResolvedStreamItem | null {
  if (!item.quote) return null;

  const suggestions = (item.suggestions ?? [])
    .map((s) => ({ style: s.style ?? "", text: s.text ?? "" }))
    .filter((s) => s.style || s.text);

  return {
    quote: item.quote,
    comment: item.comment ?? "",
    severity:
      item.severity === "issue" || item.severity === "suggestion"
        ? item.severity
        : "suggestion",
    suggestions,
    range: resolveRange(content, item.quote),
  };
}

/** Turn a partial structured-output JSON buffer into feedback items for the client. */
export function parseStreamingFeedback(
  jsonBuf: string,
  content: string,
): ResolvedStreamItem[] {
  if (!jsonBuf.trim()) return [];

  let parsed: { feedback?: StreamFeedbackItem[] };
  try {
    parsed = partialParse(jsonBuf) as { feedback?: StreamFeedbackItem[] };
  } catch {
    return [];
  }

  return (parsed.feedback ?? [])
    .map((item) => toResolvedItem(item, content))
    .filter((item): item is ResolvedStreamItem => item !== null);
}

export function encodeSse(event: FeedbackStreamEvent): string {
  const name = event.type;
  const data =
    event.type === "error"
      ? { error: event.error }
      : event.type === "done"
        ? {}
        : { feedback: event.feedback };
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
