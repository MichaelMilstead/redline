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
import { useFeedback, SKIP_REGEN_META } from "./use-feedback";

type Pinned = { item: FeedbackItem; top: number; left: number };

const EXAMPLE_TEXT = `
<p><strong>Introducing Relay: Webhooks That Don't Drop</strong></p>
<p>Today we're launching Relay, a webhook delivery service for developers. Webhooks are an extremely common pattern, but handling them well is surprisingly hard. Relay sits between your service and your customers' endpoints, handling retries, ordering, and delivery guarantees so you don't have to. We built Relay because we faced this problem ourselves and existing solutions weren't good enough.</p>
<p>Relay is significantly faster than building it in-house, and teams in our beta are already delivering millions of events with it. Getting started takes five minutes — point your webhooks at Relay, and we handle the rest. We can't wait to see what you build.</p>
`;

export default function Editor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…" }),
      Feedback,
    ],
    content: EXAMPLE_TEXT,
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
    // keep their text and so survive the staleness check in the plugin. Tag the
    // transaction so this edit doesn't itself trigger a feedback regeneration.
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setMeta(SKIP_REGEN_META, true);
        return true;
      })
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
    </div>
  );
}
