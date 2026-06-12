"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Feedback, feedbackPluginKey } from "./feedback-extension";
import FeedbackPanel, {
  FEEDBACK_PANEL_WIDTH,
  type FeedbackItem,
  type Suggestion,
} from "./feedback-panel";
import { useFeedback } from "./use-feedback";

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
  const [pinned, setPinned] = useState<Pinned | null>(null);

  // Defer auto-generation while a panel is open so feedback doesn't change out
  // from under the user mid-interaction.
  const pinnedRef = useRef<Pinned | null>(null);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  const { loading, items, error, setItems, generate, resume } = useFeedback(
    editor,
    { shouldDefer: () => pinnedRef.current !== null },
  );

  // Resume a deferred run once the panel closes.
  useEffect(() => {
    if (pinned === null) resume();
  }, [pinned, resume]);

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
      {loading && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 text-xs font-medium text-sky-400/80">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400/80" />
          Generating feedback…
        </div>
      )}

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
          onClick={() => {
            setPinned(null);
            generate(true);
          }}
          disabled={loading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Getting feedback…" : "Refresh feedback"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="mt-3 text-sm text-neutral-500">
            Feedback generates automatically as you write, and appears as colored
            highlights — click one to read it and accept a rewrite.
          </p>
        )}
      </div>
    </div>
  );
}
