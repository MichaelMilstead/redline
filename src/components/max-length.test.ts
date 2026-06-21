import { describe, it, expect } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { cutPosition } from "./max-length";

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

describe("cutPosition", () => {
  it("returns null when the doc is under the limit", () => {
    expect(cutPosition(makeDoc(para("abc")), 5)).toBeNull();
  });

  it("returns null when the doc is exactly at the limit", () => {
    expect(cutPosition(makeDoc(para("abcde")), 5)).toBeNull();
  });

  it("cuts a single paragraph after the limit-th character", () => {
    // "abcdef" with limit 4 -> keep "abcd"; text starts at pos 1, so cut = 5.
    const doc = makeDoc(para("abcdef"));
    const cut = cutPosition(doc, 4)!;
    expect(cut).toBe(5);
    expect(doc.textBetween(0, cut)).toBe("abcd");
  });

  it("counts across paragraphs (separators don't count)", () => {
    // "aaa" + "bbbb" = 7 text chars; limit 5 keeps "aaa" + first 2 of "bbbb".
    const doc = makeDoc(para("aaa"), para("bbbb"));
    const cut = cutPosition(doc, 5)!;
    const kept =
      doc.textBetween(0, cut, undefined, " ").length;
    expect(kept).toBe(5);
  });
});
