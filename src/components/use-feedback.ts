"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  buildTextAndMap,
  feedbackPluginKey,
  type FeedbackDecoration,
} from "./feedback-extension";
import type { FeedbackItem } from "./feedback-panel";

const DEBOUNCE_MS = 2500; // generate this long after the user stops typing
const MIN_INTERVAL_MS = 6000; // never auto-generate more often than this

type Options = {
  /** Return true to defer an auto-run (e.g. while the user has a panel open).
   * Deferred runs resume when `resume()` is called. */
  shouldDefer?: () => boolean;
};

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

      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Something went wrong.");
          return;
        }

        // If the doc changed while we waited, `map`'s positions are stale —
        // discard. The edit that changed it already scheduled a fresh run.
        if (editor.state.doc !== docAtSend) return;

        const nextItems: FeedbackItem[] = (
          data.feedback as Omit<FeedbackItem, "id">[]
        ).map((f, i) => ({ id: `fb-${i}`, ...f }));
        setItems(nextItems);

        const docSize = editor.state.doc.content.size;
        const decorations: FeedbackDecoration[] = nextItems.flatMap((item) => {
          if (!item.range) return [];
          const { start, end } = item.range;
          if (start < 0 || end > map.length || start >= end) return [];
          const from = map[start];
          const to = map[end - 1] + 1;
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
        editor.view.dispatch(
          editor.state.tr.setMeta(feedbackPluginKey, decorations),
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
    [editor],
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

  // Re-run feedback a beat after the user stops typing.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => schedule();
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
