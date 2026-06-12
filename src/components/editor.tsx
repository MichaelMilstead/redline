"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Feedback,
  feedbackPluginKey,
  buildTextAndMap,
  type FeedbackDecoration,
} from "./feedback-extension";
import FeedbackPanel, {
  FEEDBACK_PANEL_WIDTH,
  type FeedbackItem,
  type Suggestion,
} from "./feedback-panel";

type Pinned = { item: FeedbackItem; top: number; left: number };

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
  const [pinned, setPinned] = useState<Pinned | null>(null);

  // Open the panel when a highlight is clicked; close it on a click elsewhere or
  // on Escape. A click inside the panel itself (e.g. an accept button) is ignored
  // here so it stays open.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-feedback-popover]")) return;

      const el = target.closest<HTMLElement>("[data-feedback-id]");
      if (!el || !containerRef.current) {
        setPinned(null);
        return;
      }
      const item = items.find(
        (f) => f.id === el.getAttribute("data-feedback-id"),
      );
      if (!item) {
        setPinned(null);
        return;
      }
      const c = containerRef.current.getBoundingClientRect();
      const left = Math.max(
        0,
        Math.min(e.clientX - c.left, c.width - FEEDBACK_PANEL_WIDTH),
      );
      const top = e.clientY - c.top + 12;
      setPinned({ item, top, left });
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinned(null);
    }

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [items]);

  async function getFeedback() {
    if (!editor) return;
    const { text, map } = buildTextAndMap(editor.state.doc);
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }

    setLoading(true);
    setError(null);
    setPinned(null);
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
    setPinned(null);
  }

  return (
    <div>
      <div ref={containerRef} className="relative">
        <EditorContent editor={editor} />

        {pinned && (
          <FeedbackPanel
            item={pinned.item}
            top={pinned.top}
            left={pinned.left}
            onClose={() => setPinned(null)}
            onAccept={(s) => acceptSuggestion(pinned.item, s)}
          />
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
            Feedback appears as colored highlights — click one to read it and
            accept a rewrite.
          </p>
        )}
      </div>
    </div>
  );
}
