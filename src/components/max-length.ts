import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type MaxLengthOptions = { limit: number };

/**
 * The ProseMirror position just after the `limit`-th text character, or null if
 * the document has `limit` or fewer text characters. Counts text-node characters
 * only (matching CharacterCount's default text-size measure closely enough for
 * the cap); ignores non-text leaf nodes.
 */
export function cutPosition(
  doc: ProseMirrorNode,
  limit: number,
): number | null {
  let remaining = limit;
  let cut: number | null = null;

  doc.descendants((node, pos) => {
    if (cut !== null) return false;
    if (node.isText && node.text) {
      if (remaining < node.text.length) {
        cut = pos + remaining;
        return false;
      }
      remaining -= node.text.length;
    }
    return true;
  });

  return cut;
}

export const maxLengthPluginKey = new PluginKey("max-length");

/**
 * Caps the document at `limit` text characters by trimming any overflow from the
 * END. Unlike Tiptap's `CharacterCount` limit (which rejects over-limit
 * multi-node pastes outright), this lets the paste land and keeps the first
 * `limit` characters. The trim runs as an appendTransaction, so the over-limit
 * state is never rendered.
 */
export const MaxLength = Extension.create<MaxLengthOptions>({
  name: "maxLength",

  addOptions() {
    return { limit: 0 };
  },

  addProseMirrorPlugins() {
    const limit = this.options.limit;
    return [
      new Plugin({
        key: maxLengthPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!limit) return null;
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const cut = cutPosition(newState.doc, limit);
          if (cut === null) return null;

          const end = newState.doc.content.size;
          if (cut >= end) return null;

          return newState.tr.deleteRange(cut, end);
        },
      }),
    ];
  },
});
