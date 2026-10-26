import { describe, expect, it } from "vitest";
import { stripNoteCopy } from "../scripts/strip-rsc-html.mjs";

const push = (s: string) => `<script>self.__next_f.push(${JSON.stringify([1, s]).replace(/</g, "\\u003c")})</script>`;
const body = "<p>Élan — été</p>"; // multi-byte, so the length is in bytes
const len = Buffer.byteLength(body).toString(16);
const tree = `5:["$","main",null,{"id":"main","data-pagefind-body":"","dangerouslySetInnerHTML":{"__html":"$a"}}]\n`;

describe("stripNoteCopy", () => {
  it("empties the note row, even when it spans two pushes", () => {
    const flight = `${tree}a:T${len},${body}b:["$","p",null,{}]\n`;
    const cut = flight.indexOf("été");
    const html = `<main>${body}</main>${push(flight.slice(0, cut))}<i></i>${push(flight.slice(cut))}`;
    const out = stripNoteCopy(html)!;
    expect(out).toContain(`<main>${body}</main>`);
    const pushes = [...out.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/g)];
    expect(pushes).toHaveLength(1);
    expect(JSON.parse(pushes[0][1])[1]).toBe(`${tree}a:T0,b:["$","p",null,{}]\n`);
  });

  it("leaves a page alone when the row is referenced twice", () => {
    const flight = `${tree}6:["$","div",null,{"x":"$a"}]\na:T${len},${body}`;
    expect(stripNoteCopy(push(flight))).toBeNull();
  });

  it("leaves a page without a note body alone", () => {
    expect(stripNoteCopy(push(`1:["$","div",null,{}]\n`))).toBeNull();
    expect(stripNoteCopy("<p>no flight</p>")).toBeNull();
  });
});
