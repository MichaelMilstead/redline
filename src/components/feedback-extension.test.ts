import { describe, it, expect } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { buildTextAndMap } from "./feedback-extension";

// A minimal doc/paragraph/text schema — enough to exercise buildTextAndMap,
// which only cares about `isText` and `isTextblock`.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
});

function para(text?: string) {
  return schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : undefined,
  );
}

function makeDoc(...paras: PMNode[]) {
  return schema.nodes.doc.create(null, paras);
}

describe("buildTextAndMap", () => {
  it("maps each character of a single paragraph to its ProseMirror position", () => {
    const { text, map } = buildTextAndMap(makeDoc(para("Hello")));
    expect(text).toBe("Hello");
    expect(map).toEqual([1, 2, 3, 4, 5]);
  });

  it("inserts a blank-line separator between paragraphs", () => {
    const { text, map } = buildTextAndMap(makeDoc(para("Hi"), para("Yo")));
    expect(text).toBe("Hi\n\nYo");
    // 'H','i' -> 1,2 ; the two separator chars map to the second block's pos ; 'Y','o' -> 5,6
    expect(map).toEqual([1, 2, 4, 4, 5, 6]);
  });

  it("produces offsets that round-trip a quote to the right span", () => {
    const doc = makeDoc(para("Hi"), para("Yo"));
    const { text, map } = buildTextAndMap(doc);

    const start = text.indexOf("Yo");
    const from = map[start]!;
    const to = map[start + "Yo".length - 1]! + 1;

    expect([from, to]).toEqual([5, 7]);
    expect(doc.textBetween(from, to)).toBe("Yo");
  });

  it("returns empty results for an empty document", () => {
    const { text, map } = buildTextAndMap(makeDoc(para()));
    expect(text).toBe("");
    expect(map).toEqual([]);
  });
});
