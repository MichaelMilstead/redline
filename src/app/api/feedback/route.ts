import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const runtime = "nodejs";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

/**
 * What the client sends. `content` is the text to critique — either the full
 * editor contents or a selected snippet. Feedback ranges in the response are
 * character offsets into this exact string; if the client sent a snippet, it's
 * responsible for adding the snippet's base offset to map back into the doc.
 */
const RequestSchema = z.object({
  content: z.string().min(1),
});

const Severity = z.enum(["suggestion", "issue"]);

/**
 * A proposed rewrite of the quoted span. Each suggestion takes a different
 * stylistic approach so the user can choose. `text` replaces the quote verbatim.
 */
const SuggestionSchema = z.object({
  style: z
    .string()
    .describe(
      "A short label for this rewrite's approach, e.g. 'Concise', 'Formal', 'Vivid', 'Plain'.",
    ),
  text: z
    .string()
    .describe("The rewritten text that replaces the quoted span."),
});

/**
 * What we ask the model for. The model returns an exact verbatim `quote` rather
 * than character indices — models are reliable at copying text and unreliable at
 * counting offsets. We resolve each quote to a range server-side below.
 */
const ModelFeedback = z.object({
  feedback: z.array(
    z.object({
      quote: z
        .string()
        .describe("The exact, verbatim span of the document this note is about."),
      comment: z.string().describe("The feedback itself."),
      severity: Severity,
      suggestions: z
        .array(SuggestionSchema)
        .describe(
          "Exactly 2 alternative rewrites of the quoted span, each in a distinctly different style.",
        ),
    }),
  ),
});

const SYSTEM_PROMPT = `You are an editor giving feedback on a piece of writing.

You will be given a document (or an excerpt). Return a list of specific, actionable notes anchored to concrete spans of the text.

Rules for each note:
- "quote" MUST be copied verbatim from the document, character for character, including punctuation and capitalization. Do not paraphrase, trim, or normalize it — it is used to locate the passage. Keep it as short as possible while still uniquely identifying the spot (a phrase or sentence, not a whole paragraph).
- "comment" is your note about that span: what works, what doesn't, and how to improve it.
- "severity" is "suggestion" for an optional improvement or "issue" for a real problem.
- "suggestions": provide exactly 2 rewrites of the quoted span, each taking a clearly different stylistic approach (for example one more concise and one more vivid, or one formal and one plain). You can generate only one if both would be identical. Each suggestion's "text" must be a drop-in replacement for the quoted span — it should read naturally in place of the quote, with no surrounding context.

Only comment on spans that genuinely warrant a note. If the writing is strong, return fewer notes. Return an empty list if there is nothing worth saying.`;

type Suggestion = z.infer<typeof SuggestionSchema>;

type ResolvedFeedback = {
  quote: string;
  comment: string;
  severity: z.infer<typeof Severity>;
  suggestions: Suggestion[];
  /** Character offsets into the submitted content, or null if the quote couldn't be located. */
  range: { start: number; end: number } | null;
};

/** Locate a verbatim quote in the content and return its character range. */
function resolveRange(
  content: string,
  quote: string,
): { start: number; end: number } | null {
  const start = content.indexOf(quote);
  if (start === -1) return null;
  return { start, end: start + quote.length };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { content: string }", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { content } = parsed.data;

  let response;
  try {
    response = await client.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      output_config: {
        effort: "low",
        format: zodOutputFormat(ModelFeedback),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Give feedback on the following document:\n\n${content}`,
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "Feedback generation failed", status: error.status },
        { status: 502 },
      );
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    return NextResponse.json(
      { error: "The model declined to generate feedback for this content." },
      { status: 422 },
    );
  }

  const result = response.parsed_output;
  if (!result) {
    return NextResponse.json(
      { error: "Could not parse feedback from the model response." },
      { status: 502 },
    );
  }

  const feedback: ResolvedFeedback[] = result.feedback.map((item) => ({
    ...item,
    range: resolveRange(content, item.quote),
  }));

  return NextResponse.json({ feedback });
}
