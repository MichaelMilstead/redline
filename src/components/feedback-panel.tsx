"use client";

import type { Severity } from "./feedback-extension";

export type Suggestion = { style: string; text: string };

/** A feedback note as held in component state. `range` is character offsets into
 * the submitted text; `suggestions` are alternative rewrites of the quoted span. */
export type FeedbackItem = {
  id: string;
  quote: string;
  comment: string;
  severity: Severity;
  suggestions: Suggestion[];
  range: { start: number; end: number } | null;
};

/** Keep in sync with the `w-[36rem]` class below — used by the editor to clamp
 * the panel's left offset so it never overflows the column. */
export const FEEDBACK_PANEL_WIDTH = 576;

type Props = {
  item: FeedbackItem;
  top: number;
  left: number;
  streaming?: boolean;
  onClose: () => void;
  onAccept: (suggestion: Suggestion) => void;
};

export default function FeedbackPanel({
  item,
  top,
  left,
  streaming = false,
  onClose,
  onAccept,
}: Props) {
  return (
    <div
      data-feedback-popover
      className="absolute z-10 w-[36rem] max-w-full rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
      style={{ top, left }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {item.severity}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      </div>
      <p className="mt-1">{item.comment}</p>

      {item.suggestions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-neutral-500">
            Suggested rewrites
          </p>
          {item.suggestions.map((s, i) => (
            <button
              key={i}
              disabled={streaming || !s.text}
              onClick={() => onAccept(s)}
              className="block w-full rounded border border-neutral-200 p-2 text-left transition-colors enabled:hover:border-neutral-400 enabled:hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:enabled:hover:bg-neutral-700"
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
  );
}
