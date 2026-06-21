import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  encodeSse,
  parseStreamingFeedback,
  MAX_CONTENT_CHARS,
} from "@/lib/feedback-stream";

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

Comment on every span that genuinely warrants a note — aim for thorough coverage across the whole document, not just a handful of highlights. Skip spans that are already strong, and return an empty list only if there is genuinely nothing worth saying.`;

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

  // Abuse backstop only — the editor hard-caps input client-side. The payload
  // adds "\n\n" between paragraphs, so allow generous slack over the char cap.
  const MAX_PAYLOAD_CHARS = Math.ceil(MAX_CONTENT_CHARS * 1.5);
  if (content.length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json(
      { error: "Input exceeds the length limit for this proof-of-concept." },
      { status: 413 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Parameters<typeof encodeSse>[0]) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      let jsonBuf = "";
      let lastSnapshot = "";

      try {
        const messageStream = client.messages.stream(
          {
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
          },
          { signal: request.signal },
        );

        messageStream.on("text", (_delta, snapshot) => {
          jsonBuf = snapshot;
          const feedback = parseStreamingFeedback(jsonBuf, content);
          const snapshotKey = JSON.stringify(feedback);
          if (snapshotKey === lastSnapshot) return;
          lastSnapshot = snapshotKey;
          send({ type: "partial", feedback });
        });

        const finalMessage = await messageStream.finalMessage();

        if (finalMessage.stop_reason === "refusal") {
          send({
            type: "error",
            error: "The model declined to generate feedback for this content.",
          });
          return;
        }

        const feedback = parseStreamingFeedback(jsonBuf, content);
        send({ type: "partial", feedback });
        send({ type: "done" });
      } catch (error) {
        if (request.signal.aborted) return;
        if (error instanceof Anthropic.APIError) {
          send({ type: "error", error: "Feedback generation failed." });
          return;
        }
        send({ type: "error", error: "Feedback generation failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
