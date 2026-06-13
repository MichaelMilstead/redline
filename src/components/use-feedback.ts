"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import type { ResolvedStreamItem } from "@/lib/feedback-stream";
import {
  buildTextAndMap,
  feedbackPluginKey,
  type FeedbackDecoration,
} from "./feedback-extension";
import type { FeedbackItem } from "./feedback-panel";

const DEBOUNCE_MS = 1000; // generate this long after the user stops typing
const MIN_INTERVAL_MS = 6000; // never auto-generate more often than this

/** Set this meta on a transaction to keep it from scheduling a regeneration
 * (e.g. when accepting a suggestion — that edit shouldn't trigger new feedback). */
export const SKIP_REGEN_META = "skip-feedback-regen";

type Options = {
  /** Return true to defer an auto-run (e.g. while the user has a panel open).
   * Deferred runs resume when `resume()` is called. */
  shouldDefer?: () => boolean;
};

function toFeedbackItems(feedback: ResolvedStreamItem[]): FeedbackItem[] {
  return feedback.map((f, i) => ({ id: `fb-${i}`, ...f }));
}

function buildDecorations(
  items: FeedbackItem[],
  map: number[],
  docSize: number,
): FeedbackDecoration[] {
  return items.flatMap((item) => {
    if (!item.range) return [];
    const { start, end } = item.range;
    if (start < 0 || end > map.length || start >= end) return [];
    const from = map[start];
    const to = map[end - 1]! + 1;
    if (from == null || to == null || to > docSize) return [];
    return [
      {
        id: item.id,
        from,
        to,
        severity: item.severity,
        quote: item.quote,
      },
    ];
  });
}

async function consumeFeedbackStream(
  res: Response,
  onEvent: (event: string, data: unknown) => void,
  signal: AbortSignal,
) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }

      if (data) onEvent(event, JSON.parse(data));
      boundary = buffer.indexOf("\n\n");
    }

    if (signal.aborted) {
      reader.cancel();
      break;
    }
  }
}

/**
 * Owns the feedback lifecycle: debounced auto-generation as the user types, the
 * manual `generate(force)` trigger, request cancellation, and applying the
 * resulting decorations. The editor component handles only the surrounding UI.
 */
export function useFeedback(editor: Editor | null, options: Options = {}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastTextRef = useRef<string>(""); // text of the last run — skip no-op reruns
  const lastRunAtRef = useRef<number>(0); // for the min-interval guard
  const pendingRef = useRef(false); // a run was deferred and should resume later
  const shouldDeferRef = useRef(options.shouldDefer);
  useEffect(() => {
    shouldDeferRef.current = options.shouldDefer;
  }, [options.shouldDefer]);

  const applyFeedback = useCallback(
    (feedback: ResolvedStreamItem[], map: number[]) => {
      if (!editor) return;
      const nextItems = toFeedbackItems(feedback);
      setItems(nextItems);
      const decorations = buildDecorations(
        nextItems,
        map,
        editor.state.doc.content.size,
      );
      editor.view.dispatch(
        editor.state.tr.setMeta(feedbackPluginKey, decorations),
      );
    },
    [editor],
  );

  const generate = useCallback(
    async (force = false) => {
      if (!editor) return;
      // Don't disrupt the user mid-interaction; resume once unblocked.
      if (!force && shouldDeferRef.current?.()) {
        pendingRef.current = true;
        return;
      }

      const { text, map } = buildTextAndMap(editor.state.doc);
      if (!text.trim()) {
        if (force) setError("Write something first.");
        return;
      }
      if (!force && text === lastTextRef.current) return; // nothing changed

      lastTextRef.current = text;
      lastRunAtRef.current = Date.now();
      pendingRef.current = false;

      // Cancel any in-flight request so a stale response can't land late.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const docAtSend = editor.state.doc;

      setLoading(true);
      setError(null);
      setItems([]);
      editor.view.dispatch(
        editor.state.tr.setMeta(feedbackPluginKey, []),
      );

      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ content: text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            (data as { error?: string }).error ?? "Something went wrong.",
          );
          return;
        }

        await consumeFeedbackStream(
          res,
          (event, data) => {
            if (editor.state.doc !== docAtSend) return;

            if (event === "error") {
              setError((data as { error?: string }).error ?? "Something went wrong.");
              return;
            }

            if (event === "partial") {
              const feedback = (data as { feedback: ResolvedStreamItem[] })
                .feedback;
              applyFeedback(feedback, map);
            }
          },
          controller.signal,
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // superseded — ignore
        setError("Request failed.");
      } finally {
        // Only the most recent request owns the loading state.
        if (abortRef.current === controller) {
          setLoading(false);
          abortRef.current = null;
        }
      }
    },
    [editor, applyFeedback],
  );

  // Debounced trigger, respecting a minimum interval between runs.
  const schedule = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const wait = MIN_INTERVAL_MS - (Date.now() - lastRunAtRef.current);
      if (wait > 0) {
        debounceRef.current = window.setTimeout(() => generate(), wait);
      } else {
        generate();
      }
    }, DEBOUNCE_MS);
  }, [generate]);

  // Re-run feedback a beat after the user stops typing — unless the change opted
  // out (accepting a suggestion).
  useEffect(() => {
    if (!editor) return;
    const onUpdate = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.getMeta(SKIP_REGEN_META)) return;
      schedule();
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, schedule]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  /** Run a deferred generation, if one is pending (call when unblocked). */
  const resume = useCallback(() => {
    if (pendingRef.current) {
      pendingRef.current = false;
      schedule();
    }
  }, [schedule]);

  return { loading, items, error, setItems, generate, resume };
}
