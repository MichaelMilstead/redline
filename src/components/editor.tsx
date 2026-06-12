"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

type FeedbackItem = {
  quote: string;
  comment: string;
  severity: "praise" | "suggestion" | "issue";
  range: { start: number; end: number } | null;
};

export default function Editor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…" }),
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

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getFeedback() {
    if (!editor) return;
    const content = editor.getText().trim();
    if (!content) {
      setError("Write something first.");
      return;
    }

    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setFeedback(data.feedback);
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <EditorContent editor={editor} />

      <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button
          onClick={getFeedback}
          disabled={loading}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Getting feedback…" : "Get feedback"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {feedback && (
          <div className="mt-4 space-y-3">
            {feedback.length === 0 && (
              <p className="text-sm text-neutral-500">No feedback.</p>
            )}
            {feedback.map((item, i) => (
              <div
                key={i}
                className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {item.severity}
                </span>
                <p className="mt-1 italic text-neutral-600 dark:text-neutral-400">
                  “{item.quote}”
                </p>
                <p className="mt-1">{item.comment}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
