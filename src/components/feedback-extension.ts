import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type Severity = "praise" | "suggestion" | "issue";

/**
 * A single decoration to render. It carries only what the view needs: where to
 * paint (`from`/`to`), how to color it (`severity`), and an `id` back-reference
 * to the full feedback object held in React state.
 *
 * Extension point: when feedback later includes a suggested alternative, the
 * accept action does NOT need anything new here — it's a transaction over the
 * same `from`/`to` (e.g. `editor.chain().insertContentAt({ from, to }, alt)`).
 * The alternative text and any inline accept UI hang off the `id`, so this
 * decoration layer stays unchanged.
 */
export type FeedbackDecoration = {
  id: string;
  from: number;
  to: number;
  severity: Severity;
};

export const feedbackPluginKey = new PluginKey<DecorationSet>("feedback");

/**
 * Build the document's plain text alongside a map from each text-offset to its
 * ProseMirror position. Send `text` to the API and use `map` to translate the
 * returned character ranges back into editor positions — the two stay in sync
 * because they're produced in the same pass.
 */
export function buildTextAndMap(doc: ProseMirrorNode): {
  text: string;
  map: number[];
} {
  let text = "";
  const map: number[] = [];
  const SEPARATOR = "\n\n";

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        map.push(pos + i);
      }
      text += node.text;
    } else if (node.isTextblock && text.length > 0) {
      // Start of a new block — insert a separator so the API sees paragraph
      // breaks. These positions are never the target of a quote range.
      for (let i = 0; i < SEPARATOR.length; i++) map.push(pos);
      text += SEPARATOR;
    }
  });

  return { text, map };
}

/**
 * Tiptap extension that renders feedback as inline decorations. Decorations are
 * a view overlay — they color the text and tag it with an id without mutating
 * the document, and they map through edits automatically.
 *
 * Set them with:
 *   editor.view.dispatch(editor.state.tr.setMeta(feedbackPluginKey, decorations))
 */
export const Feedback = Extension.create({
  name: "feedback",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: feedbackPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(feedbackPluginKey) as
              | FeedbackDecoration[]
              | undefined;
            if (next) {
              const decorations = next.map((f) =>
                Decoration.inline(f.from, f.to, {
                  class: `feedback feedback-${f.severity}`,
                  "data-feedback-id": f.id,
                }),
              );
              return DecorationSet.create(tr.doc, decorations);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return feedbackPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
