"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Feedback,
  feedbackPluginKey,
  buildTextAndMap,
  type FeedbackDecoration,
  type Severity,
} from "./feedback-extension";

/** A feedback note as held in component state. `range` is character offsets into
 * the submitted text; `suggestion` is reserved for future suggested rewrites. */
type FeedbackItem = {
  id: string;
  quote: string;
  comment: string;
  severity: Severity;
  range: { start: number; end: number } | null;
};

type Hovered = { item: FeedbackItem; top: number; left: number };

export default function Editor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…" }),
      Feedback,
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[60vh] focus:outline-none",
      },
    },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  async function getFeedback() {
    if (!editor) return;
    const { text, map } = buildTextAndMap(editor.state.doc);
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }

    setLoading(true);
    setError(null);
    setHovered(null);
    setItems([]);
    editor.view.dispatch(editor.state.tr.setMeta(feedbackPluginKey, []));

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      const nextItems: FeedbackItem[] = (
        data.feedback as Omit<FeedbackItem, "id">[]
      ).map((f, i) => ({ id: `fb-${i}`, ...f }));
      setItems(nextItems);

      // Convert character ranges into ProseMirror positions via the map.
      const docSize = editor.state.doc.content.size;
      const decorations: FeedbackDecoration[] = nextItems.flatMap((item) => {
        if (!item.range) return [];
        const { start, end } = item.range;
        if (start < 0 || end > map.length || start >= end) return [];
        const from = map[start];
        const to = map[end - 1] + 1;
        if (from == null || to == null || to > docSize) return [];
        return [{ id: item.id, from, to, severity: item.severity }];
      });
      editor.view.dispatch(
        editor.state.tr.setMeta(feedbackPluginKey, decorations),
      );
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleMouseOver(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-feedback-id]",
    );
    if (!el || !containerRef.current) {
      setHovered(null);
      return;
    }
    const item = items.find((f) => f.id === el.getAttribute("data-feedback-id"));
    if (!item) return;
    const c = containerRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setHovered({ item, top: r.bottom - c.top + 4, left: r.left - c.left });
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative"
        onMouseOver={handleMouseOver}
        onMouseLeave={() => setHovered(null)}
      >
        <EditorContent editor={editor} />

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-md bg-neutral-900 px-3 py-2 text-sm text-white shadow-lg dark:bg-neutral-700"
            style={{ top: hovered.top, left: hovered.left }}
          >
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              {hovered.item.severity}
            </span>
            {hovered.item.comment}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button
          onClick={getFeedback}
          disabled={loading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Getting feedback…" : "Get feedback"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">
            Feedback will appear as colored, hoverable highlights in your text.
          </p>
        )}
      </div>
    </div>
  );
}
