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

type Suggestion = { style: string; text: string };

/** A feedback note as held in component state. `range` is character offsets into
 * the submitted text; `suggestions` are alternative rewrites of the quoted span. */
type FeedbackItem = {
  id: string;
  quote: string;
  comment: string;
  severity: Severity;
  suggestions: Suggestion[];
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
  const closeTimer = useRef<number | null>(null);
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
        return [
          { id: item.id, from, to, severity: item.severity, quote: item.quote },
        ];
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

  /** Replace the note's span with a chosen rewrite, then drop that note. */
  function acceptSuggestion(item: FeedbackItem, suggestion: Suggestion) {
    if (!editor) return;
    // Read the note's CURRENT range from the decoration set — earlier accepts or
    // edits may have shifted it from the position we first computed.
    const decoSet = feedbackPluginKey.getState(editor.state);
    const deco = decoSet?.find().find((d) => d.spec?.id === item.id);
    if (!deco) return;

    // Replacing the span deletes its decoration automatically; the other notes
    // keep their text and so survive the staleness check in the plugin.
    editor
      .chain()
      .focus()
      .insertContentAt({ from: deco.from, to: deco.to }, suggestion.text)
      .run();

    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setHovered(null);
  }

  function cancelClose() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setHovered(null), 150);
  }

  function handleMouseOver(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-feedback-popover]")) {
      cancelClose();
      return;
    }
    const el = target.closest<HTMLElement>("[data-feedback-id]");
    if (!el || !containerRef.current) {
      scheduleClose();
      return;
    }
    cancelClose();
    const item = items.find((f) => f.id === el.getAttribute("data-feedback-id"));
    if (!item) return;
    const c = containerRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setHovered({ item, top: r.bottom - c.top + 2, left: r.left - c.left });
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative"
        onMouseOver={handleMouseOver}
        onMouseLeave={scheduleClose}
      >
        <EditorContent editor={editor} />

        {hovered && (
          <div
            data-feedback-popover
            className="absolute z-10 w-72 rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
            style={{ top: hovered.top, left: hovered.left }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <span className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
              {hovered.item.severity}
            </span>
            <p className="mt-1">{hovered.item.comment}</p>

            {hovered.item.suggestions.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium text-neutral-500">
                  Suggested rewrites
                </p>
                {hovered.item.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => acceptSuggestion(hovered.item, s)}
                    className="block w-full rounded border border-neutral-200 p-2 text-left transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700"
                  >
                    <span className="text-xs font-medium text-neutral-500">
                      {s.style}
                    </span>
                    <span className="mt-0.5 block">{s.text}</span>
                  </button>
                ))}
              </div>
            )}
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
            Feedback appears as colored highlights — hover one to read it and
            accept a rewrite.
          </p>
        )}
      </div>
    </div>
  );
}
