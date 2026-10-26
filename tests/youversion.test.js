import { test, expect, describe } from "bun:test";
import Y from "../youversion/youversion.js";

describe("references", () => {
  const ids = (q) => Y.parseReference(q).parts.map((p) => p.fetchId);
  test("chapters, verses and ranges within a chapter", () => {
    expect(ids("John 3:16")).toEqual(["JHN.3.16"]);
    expect(ids("John 3:16-18")).toEqual(["JHN.3.16-18"]);
    expect(ids("John 3:16\u201318")).toEqual(["JHN.3.16-18"]); // en dash
    expect(ids("Psalm 23")).toEqual(["PSA.23"]);
    expect(ids("1 Cor 13")).toEqual(["1CO.13"]);
    expect(ids("I John 4")).toEqual(["1JN.4"]);
    expect(ids("first john 4:7")).toEqual(["1JN.4.7"]);
    expect(ids("phil 2:5")).toEqual(["PHP.2.5"]);
    expect(ids("Rev. 22:21")).toEqual(["REV.22.21"]);
    expect(ids("  mt 5:3-5 ")).toEqual(["MAT.5.3-5"]);
    expect(Y.parseReference("ps 23:1-3").label).toBe("Psalms 23:1-3");
  });
  test("ranges across chapters become one part per chapter, trimmed to the verses asked for", () => {
    const r = Y.parseReference("John 3:16-4:2");
    expect(r.chapters).toBe(2);
    expect(r.parts.map((p) => [p.chapter, p.from, p.to, p.fetchId])).toEqual([[3, 16, 0, "JHN.3"], [4, 0, 2, "JHN.4"]]);
    expect(r.label).toBe("John 3:16\u20134:2");
    expect(ids("Psalm 23-25")).toEqual(["PSA.23", "PSA.24", "PSA.25"]);
    expect(Y.parseReference("Psalm 23-25").parts.every((p) => !p.from && !p.to)).toBe(true); // whole chapters
    expect(ids("Gen 1:30-2:3")).toEqual(["GEN.1", "GEN.2"]);
    expect(Y.parseReference("Rev 22:1-22:5").parts.map((p) => p.fetchId)).toEqual(["REV.22.1-5"]);
  });
  test("trimming keeps only the verses in a part's range", () => {
    const vs = [1, 2, 3, 4, 5].map((n) => ({ verse_number: n, text: "v" + n }));
    expect(Y.sliceVerses(vs, 3, 0).map((v) => v.verse_number)).toEqual([3, 4, 5]);
    expect(Y.sliceVerses(vs, 0, 2).map((v) => v.verse_number)).toEqual([1, 2]);
    expect(Y.sliceVerses(vs, 0, 0)).toHaveLength(5);
    expect(Y.sliceVerses(vs, 2, 4)).toHaveLength(3);
  });
  test("what was stored is named in the publisher's own form", () => {
    const vs = [{ verse_number: 16 }, { verse_number: 17 }, { verse_number: 36 }];
    expect(Y.partUsfm("JHN", 3, vs, false)).toBe("JHN.3.16-36");
    expect(Y.partUsfm("JHN", 3, vs, true)).toBe("JHN.3");
    expect(Y.partUsfm("JHN", 3, [{ verse_number: 16 }], false)).toBe("JHN.3.16");
  });
  test("books with one chapter are cited by verse", () => {
    expect(ids("Jude 3")).toEqual(["JUD.1.3"]);
    expect(ids("Jude 3-5")).toEqual(["JUD.1.3-5"]);
    expect(ids("3 John 4")).toEqual(["3JN.1.4"]);
    expect(ids("Jude 1")).toEqual(["JUD.1"]);
  });
  test("refuses what it should: whole books, backwards ranges, nonsense", () => {
    expect(() => Y.parseReference("John 3:18-16")).toThrow(/backwards/);
    expect(() => Y.parseReference("John 4-3")).toThrow(/backwards/);
    expect(() => Y.parseReference("Gen 2:3-2:1")).toThrow(/backwards/);
    expect(() => Y.parseReference("Psalms 151")).toThrow(/150 chapters/);
    expect(() => Y.parseReference("jo 3")).toThrow(/more than one book/);
    expect(() => Y.parseReference("Hezekiah 1")).toThrow(/don\u2019t know a book/);
    expect(() => Y.parseReference("")).toThrow();
  });
  test("a book named on its own is the whole book, to be checked against the publisher's limit", () => {
    const jude = Y.parseReference("Jude");
    expect(jude).toMatchObject({ whole: true, chapters: 1, label: "Jude 1" });
    expect(jude.parts.map((p) => p.fetchId)).toEqual(["JUD.1"]);
    const haggai = Y.parseReference("haggai");
    expect(haggai.parts.map((p) => p.fetchId)).toEqual(["HAG.1", "HAG.2"]);
    expect(haggai.label).toBe("Haggai 1\u20132");
    expect(Y.parseReference("Psalms").chapters).toBe(150);
    expect(Y.parseReference("Gen 1-30").chapters).toBe(30);
    const biblica = Y.limitFor(Y.BIBLICA_ORG), other = Y.limitFor("x");
    expect(Y.tooLong(biblica, 1)).toBe("");
    expect(Y.tooLong(biblica, 2)).toBe("");
    expect(Y.tooLong(biblica, 21)).toBe("");          // John: the verses decide, as chapters arrive
    expect(Y.tooLong(biblica, 150)).toContain("150 chapters");
    expect(Y.tooLong(other, 5)).toBe("");
    expect(Y.tooLong(other, 6)).toContain("Up to 5 chapters");
    expect(Y.tooLong(other, 150)).toContain("150 chapters");
  });
  test("book table matches YouVersion's order and sizes", () => {
    expect(Y.BOOKS.length).toBe(66);
    expect(Y.BOOKS[0].slice(0, 3)).toEqual(["GEN", "Genesis", 50]);
    expect(Y.BOOKS[65].slice(0, 3)).toEqual(["REV", "Revelation", 22]);
    expect(Y.BOOKS.reduce((n, b) => n + b[2], 0)).toBe(1189);
  });
});

describe("how much a publisher lets be shown at once", () => {
  test("Biblica: two chapters or 25 verses, whichever is greater", () => {
    const l = Y.limitFor(Y.BIBLICA_ORG);
    expect(l).toMatchObject({ chapters: 2, verses: 25 });
    expect(Y.withinLimit(l, 1, 176)).toBe(true);    // Psalm 119 is one chapter
    expect(Y.withinLimit(l, 2, 400)).toBe(true);    // two chapters, however long
    expect(Y.withinLimit(l, 3, 25)).toBe(true);     // three short chapters, 25 verses
    expect(Y.withinLimit(l, 3, 26)).toBe(false);
    expect(Y.withinLimit(l, 3, null)).toBe(false);  // unknown verses: not allowed
    expect(Y.withinLimit(l, 10, 20)).toBe(true);    // ten tiny chapters under 25 verses
  });
  test("any other publisher: a loose five chapters when its terms say nothing", () => {
    for (const org of ["798d8fa4-f640-4155-8cfb-fa91d1d8a06c" /* Lockman */, "", "c3187cfe-a191-4088-9fb2-24c306d9eb38", undefined]) {
      const l = Y.limitFor(org);
      expect(l).toMatchObject({ chapters: 5, verses: 0 });
      expect(Y.withinLimit(l, 5, 900)).toBe(true);
      expect(Y.withinLimit(l, 6, 10)).toBe(false);
    }
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
    expect(Y.cleanBible({ id: 111, abbreviation: "NIV11", localized_abbreviation: "NIV", title: "T", language_tag: "en", copyright: " c ", organization_id: "org-1", youversion_deep_link: "https://www.bible.com/versions/111" }))
      .toEqual({ id: 111, abbreviation: "NIV", title: "T", language: "en", copyright: "c", organization: "org-1", link: "https://www.bible.com/versions/111" });
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

describe("licensing helpers", () => {
  test("the notice is the version and the rights holder, from the publisher's own text", () => {
    expect(Y.shortNotice("NIV", "The Holy Bible, New International Version® NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by Permission."))
      .toBe("NIV · © Biblica, Inc");
    expect(Y.shortNotice("NASB2020", "New American Standard Bible® Copyright © 1960, 1971, 1977, 1995, 2020 by The Lockman Foundation. All rights reserved"))
      .toBe("NASB2020 · © The Lockman Foundation");
    expect(Y.shortNotice("BSB", "Public Domain")).toBe("BSB · Public Domain");
    expect(Y.shortNotice("X", "")).toBe("X");
    expect(Y.shortNotice("X", "something unreadable").length).toBeLessThan(61);
  });
  test("how long a passage may be kept comes from the publisher's answer", () => {
    expect(Y.keepSecs(3600)).toBe(3600);
    expect(Y.keepSecs(0)).toBe(0);            // do not keep
    expect(Y.keepSecs(-5)).toBe(0);
    expect(Y.keepSecs(null)).toBe(Y.DEFAULT_TTL_SECS);
    expect(Y.keepSecs(undefined)).toBe(Y.DEFAULT_TTL_SECS);
  });
  test("the licensed block names the Bible, the reference, the notice and the time limit", () => {
    expect(Y.licensedBlock({ id: 111, copyright: "c", link: "https://www.bible.com/versions/111" }, "JHN.3.16-18", "NIV", 3600))
      .toEqual({ bible_id: 111, usfm: "JHN.3.16-18", tag: "NIV", copyright: "c", link: "https://www.bible.com/versions/111", ttl_secs: 3600 });
  });
});
