import { test, expect, describe } from "bun:test";
import Y from "../youversion/youversion.js";

describe("references", () => {
  const id = (q) => Y.parseReference(q).id;
  test("chapters, verses and ranges", () => {
    expect(id("John 3:16")).toBe("JHN.3.16");
    expect(id("John 3:16-18")).toBe("JHN.3.16-18");
    expect(id("John 3:16–18")).toBe("JHN.3.16-18"); // en dash
    expect(id("Psalm 23")).toBe("PSA.23");
    expect(id("1 Cor 13")).toBe("1CO.13");
    expect(id("I John 4")).toBe("1JN.4");
    expect(id("first john 4:7")).toBe("1JN.4.7");
    expect(id("phil 2:5")).toBe("PHP.2.5");
    expect(id("Rev. 22:21")).toBe("REV.22.21");
    expect(id("  mt 5:3-5 ")).toBe("MAT.5.3-5");
  });
  test("books with one chapter are cited by verse", () => {
    expect(id("Jude 3")).toBe("JUD.1.3");
    expect(id("Jude 3-5")).toBe("JUD.1.3-5");
    expect(id("3 John 4")).toBe("3JN.1.4");
    expect(id("Jude 1")).toBe("JUD.1");
  });
  test("labels use the book's name", () => {
    expect(Y.parseReference("ps 23:1-3").label).toBe("Psalms 23:1-3");
  });
  test("refuses what it should: whole books, other chapters, nonsense", () => {
    expect(() => Y.parseReference("John")).toThrow(/Whole books are not downloaded/);
    expect(() => Y.parseReference("Gen 1:1-2:3")).toThrow(/One chapter at a time/);
    expect(() => Y.parseReference("John 3:18-16")).toThrow(/backwards/);
    expect(() => Y.parseReference("Psalms 151")).toThrow(/150 chapters/);
    expect(() => Y.parseReference("jo 3")).toThrow(/more than one book/);
    expect(() => Y.parseReference("Hezekiah 1")).toThrow(/don’t know a book/);
    expect(() => Y.parseReference("")).toThrow();
  });
  test("book table matches YouVersion's order and sizes", () => {
    expect(Y.BOOKS.length).toBe(66);
    expect(Y.BOOKS[0].slice(0, 3)).toEqual(["GEN", "Genesis", 50]);
    expect(Y.BOOKS[65].slice(0, 3)).toEqual(["REV", "Revelation", 22]);
    expect(Y.BOOKS.reduce((n, b) => n + b[2], 0)).toBe(1189);
  });
});

describe("urls and lists", () => {
  test("endpoint urls", () => {
    expect(Y.biblesUrl("*")).toBe("https://api.youversion.com/v1/bibles?language_ranges[]=*&page_size=99");
    expect(Y.biblesUrl("en", "abc def")).toContain("&page_token=abc%20def");
    expect(Y.bibleUrl(111)).toBe("https://api.youversion.com/v1/bibles/111");
    expect(Y.passageUrl(111, "JHN.3.16-18")).toBe("https://api.youversion.com/v1/bibles/111/passages/JHN.3.16-18?format=html");
  });
  test("cleanBible keeps what the plugin needs", () => {
    expect(Y.cleanBible({ id: 111, abbreviation: "NIV11", localized_abbreviation: "NIV", title: "T", language_tag: "en", copyright: " c ", youversion_deep_link: "https://www.bible.com/versions/111" }))
      .toEqual({ id: 111, abbreviation: "NIV", title: "T", language: "en", copyright: "c", link: "https://www.bible.com/versions/111" });
    expect(Y.cleanBible({ id: "x" })).toBe(null);
    expect(Y.cleanBible(null)).toBe(null);
  });
});

describe("passage html", () => {
  const v = (n) => `<span class="yv-v" v="${n}"></span><span class="yv-vlbl">${n}</span>`;
  test("splits verses and drops the printed numbers", () => {
    const html = `<div><div class="p">${v(16)}Alpha beta. ${v(17)}Gamma &amp; delta &#8217;s. </div></div>`;
    expect(Y.htmlToVerses(html)).toEqual([{ verse_number: 16, text: "Alpha beta." }, { verse_number: 17, text: "Gamma & delta ’s." }]);
  });
  test("poetry lines stay with their verse, as line breaks", () => {
    const html = `<div><div class="q1">${v(1)}The <span class="nd">Lord</span> keeps me,</div><div class="q2">${v(2)}He leads me,</div><div class="q1">beside the water,</div></div>`;
    expect(Y.htmlToVerses(html)).toEqual([{ verse_number: 1, text: "The Lord keeps me," }, { verse_number: 2, text: "He leads me,\nbeside the water," }]);
  });
  test("a superscription belongs to the verse that carries it; notes are not text", () => {
    const html = `<div><div class="d">${v(1)} A Psalm.</div><div class="q1">First line<span class="note">a note</span></div></div>`;
    expect(Y.htmlToVerses(html)).toEqual([{ verse_number: 1, text: "A Psalm.\nFirst line" }]);
  });
  test("text before the first marker is dropped; junk gives nothing", () => {
    expect(Y.htmlToVerses(`<div>Heading</div><div>${v(3)}Three</div>`)).toEqual([{ verse_number: 3, text: "Three" }]);
    expect(Y.htmlToVerses("")).toEqual([]);
    expect(Y.htmlToVerses("not html")).toEqual([]);
    expect(Y.htmlToVerses(null)).toEqual([]);
  });
  test("preview text", () => {
    expect(Y.previewText([{ verse_number: 1, text: "a\nb" }, { verse_number: 2, text: "c" }])).toBe("1 a b  2 c");
  });
});
