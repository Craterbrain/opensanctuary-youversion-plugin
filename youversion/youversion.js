// Pure logic for the YouVersion plugin: references -> USFM, YouVersion HTML -> verses. No DOM, no
// network, so it can be tested on its own; app.js does the fetching through the host.
(function (root) {
  'use strict';

  var API = 'https://api.youversion.com';

  // [USFM code, name, chapters, extra spellings...] in canonical order (the order YouVersion lists them).
  var BOOKS = [
    ['GEN', 'Genesis', 50, 'gn', 'ge'], ['EXO', 'Exodus', 40, 'ex', 'exod'], ['LEV', 'Leviticus', 27, 'lv', 'le'],
    ['NUM', 'Numbers', 36, 'nm', 'nu'], ['DEU', 'Deuteronomy', 34, 'dt', 'deut'], ['JOS', 'Joshua', 24, 'josh'],
    ['JDG', 'Judges', 21, 'judg', 'jg'], ['RUT', 'Ruth', 4, 'ru'], ['1SA', '1 Samuel', 31, '1sam', '1sm'],
    ['2SA', '2 Samuel', 24, '2sam', '2sm'], ['1KI', '1 Kings', 22, '1kgs', '1kg'], ['2KI', '2 Kings', 25, '2kgs', '2kg'],
    ['1CH', '1 Chronicles', 29, '1chr'], ['2CH', '2 Chronicles', 36, '2chr'], ['EZR', 'Ezra', 10],
    ['NEH', 'Nehemiah', 13, 'ne'], ['EST', 'Esther', 10, 'esth'], ['JOB', 'Job', 42, 'jb'],
    ['PSA', 'Psalms', 150, 'ps', 'psalm', 'pslm', 'psa'], ['PRO', 'Proverbs', 31, 'prov', 'pr'],
    ['ECC', 'Ecclesiastes', 12, 'eccl', 'ecc', 'qoh'], ['SNG', 'Song of Solomon', 8, 'song', 'sos', 'song of songs', 'ss'],
    ['ISA', 'Isaiah', 66, 'is'], ['JER', 'Jeremiah', 52, 'jer'], ['LAM', 'Lamentations', 5, 'lam'],
    ['EZK', 'Ezekiel', 48, 'ezek', 'eze'], ['DAN', 'Daniel', 12, 'dn'], ['HOS', 'Hosea', 14, 'ho'],
    ['JOL', 'Joel', 3, 'jl'], ['AMO', 'Amos', 9, 'am'], ['OBA', 'Obadiah', 1, 'ob', 'obad'],
    ['JON', 'Jonah', 4, 'jnh'], ['MIC', 'Micah', 7, 'mc'], ['NAM', 'Nahum', 3, 'na', 'nah'],
    ['HAB', 'Habakkuk', 3, 'hb'], ['ZEP', 'Zephaniah', 3, 'zeph', 'zp'], ['HAG', 'Haggai', 2, 'hg'],
    ['ZEC', 'Zechariah', 14, 'zech', 'zc'], ['MAL', 'Malachi', 4, 'ml'],
    ['MAT', 'Matthew', 28, 'mt', 'matt'], ['MRK', 'Mark', 16, 'mk', 'mr'], ['LUK', 'Luke', 24, 'lk'],
    ['JHN', 'John', 21, 'jn', 'jhn'], ['ACT', 'Acts', 28, 'ac'], ['ROM', 'Romans', 16, 'rom', 'ro', 'rm'],
    ['1CO', '1 Corinthians', 16, '1cor'], ['2CO', '2 Corinthians', 13, '2cor'], ['GAL', 'Galatians', 6, 'ga'],
    ['EPH', 'Ephesians', 6, 'eph'], ['PHP', 'Philippians', 4, 'phil', 'php', 'pp'], ['COL', 'Colossians', 4, 'col'],
    ['1TH', '1 Thessalonians', 5, '1thess', '1thes'], ['2TH', '2 Thessalonians', 3, '2thess', '2thes'],
    ['1TI', '1 Timothy', 6, '1tim'], ['2TI', '2 Timothy', 4, '2tim'], ['TIT', 'Titus', 3, 'ti'],
    ['PHM', 'Philemon', 1, 'philem', 'phlm'], ['HEB', 'Hebrews', 13, 'heb'], ['JAS', 'James', 5, 'jm', 'jas'],
    ['1PE', '1 Peter', 5, '1pet', '1pt'], ['2PE', '2 Peter', 3, '2pet', '2pt'], ['1JN', '1 John', 5, '1jn', '1jhn'],
    ['2JN', '2 John', 1, '2jn', '2jhn'], ['3JN', '3 John', 1, '3jn', '3jhn'], ['JUD', 'Jude', 1, 'jd'],
    ['REV', 'Revelation', 22, 'rev', 'rv', 'revelations']
  ];

  function squash(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  /** "I John", "First John", "2nd Cor." -> "1 John" shapes, before squashing. */
  function normalizeBookWords(s) {
    var t = String(s).toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^(iii|ii|i)\s+/, function (m) { return { i: '1 ', ii: '2 ', iii: '3 ' }[m.trim()]; });
    t = t.replace(/^(1st|first)\s+/, '1 ').replace(/^(2nd|second)\s+/, '2 ').replace(/^(3rd|third)\s+/, '3 ');
    return t;
  }

  var INDEX = (function () {
    var m = {};
    BOOKS.forEach(function (b, i) {
      m[squash(b[1])] = i;
      m[squash(b[0])] = m[squash(b[0])] == null ? i : m[squash(b[0])];
      for (var k = 3; k < b.length; k++) m[squash(b[k])] = i;
    });
    return m;
  })();

  /** A book name or abbreviation -> its index in BOOKS, or -1 (unknown) / -2 (ambiguous prefix). */
  function findBook(text) {
    var key = squash(normalizeBookWords(text));
    if (!key) return -1;
    if (INDEX[key] != null) return INDEX[key];
    var hits = {};
    Object.keys(INDEX).forEach(function (k) { if (k.indexOf(key) === 0) hits[INDEX[k]] = true; });
    var ids = Object.keys(hits);
    return ids.length === 1 ? Number(ids[0]) : ids.length > 1 ? -2 : -1;
  }

  /**
   * "John 3:16-18" / "1 Cor 13" / "Ps 23:1-3" / "John 3-4" / "John 3:16-4:2" -> a reference made of one part per
   * chapter: { book, code, name, label, chapters, parts: [{ chapter, from, to, fetchId, label }] }. `from` / `to`
   * are verse numbers, 0 meaning "from the start" / "to the end" of that chapter. The API serves one chapter per
   * call, so a part whose verse range is closed (`John 3:16-18`) is fetched exactly, and one that is open
   * (the first chapter of `3:16-4:2`) is fetched whole and trimmed (`sliceVerses`). Whole books are refused on
   * purpose. Throws a plain-language Error on anything else.
   */
  function parseReference(input) {
    var q = String(input || '').replace(/[\u2013\u2014]/g, '-').trim();
    if (!q) throw new Error('Type a reference such as John 3:16 or Psalm 23.');
    // Jude 3, Obadiah 5-7: a book with one chapter is cited by verse.
    var single = /^(.*?)[\s.]+(\d+)\s*(?:-\s*(\d+))?$/.exec(q);
    if (single) {
      var si = findBook(single[1]);
      if (si >= 0 && BOOKS[si][2] === 1 && (Number(single[2]) > 1 || single[3])) {
        q = BOOKS[si][1] + ' 1:' + single[2] + (single[3] ? '-' + single[3] : '');
      }
    }
    var m = /^(.*?)[\s.]*(\d+)\s*(?:[:.]\s*(\d+))?\s*(?:-\s*(\d+)\s*(?:[:.]\s*(\d+))?)?$/.exec(q);
    if (!m || !m[1].trim()) {
      // A bare book name is the whole book: fine when it is short enough for the publisher's limit (Jude, 3 John,
      // Haggai...), which the caller checks with `tooLong` before fetching anything.
      var whole = findBook(q);
      if (whole >= 0) return wholeBook(whole);
      if (whole === -2) throw new Error('\u201c' + q + '\u201d could be more than one book; spell it out.');
      throw new Error('I couldn\u2019t read \u201c' + q + '\u201d as a reference. Try John 3:16 or Psalm 23.');
    }
    var idx = findBook(m[1]);
    if (idx === -2) throw new Error('\u201c' + m[1].trim() + '\u201d could be more than one book; spell it out.');
    if (idx < 0) throw new Error('I don\u2019t know a book called \u201c' + m[1].trim() + '\u201d.');
    var book = BOOKS[idx];
    var c1 = Number(m[2]), v1 = m[3] ? Number(m[3]) : 0;
    var c2 = c1, v2 = v1;
    if (m[4]) {
      if (m[5]) { c2 = Number(m[4]); v2 = Number(m[5]); }          // 3:16-4:2
      else if (m[3]) { v2 = Number(m[4]); }                         // 3:16-18 (same chapter)
      else { c2 = Number(m[4]); }                                   // 3-4 (whole chapters)
    }
    if (m[5] && !m[3]) throw new Error('I couldn\u2019t read \u201c' + q + '\u201d as a reference.');
    for (var c of [c1, c2]) {
      if (c < 1 || c > book[2]) throw new Error(book[1] + ' has ' + book[2] + ' chapter' + (book[2] === 1 ? '' : 's') + '.');
    }
    if (c2 < c1) throw new Error('The chapter range runs backwards.');
    if ((m[3] && v1 < 1) || (m[5] && v2 < 1)) throw new Error('Verses start at 1.');
    if (c1 === c2 && v1 && v2 && v2 < v1) throw new Error('The verse range runs backwards.');
    var parts = [];
    for (var c = c1; c <= c2; c++) {
      var from = c === c1 ? v1 : 0;
      var to = c === c2 ? (c1 === c2 ? v2 : v2) : 0;
      if (c === c2 && c !== c1 && !m[5]) to = 0;       // "3-4" is whole chapters
      var closed = from > 0 && to > 0;
      var fetchId = book[0] + '.' + c + (closed ? '.' + from + (to > from ? '-' + to : '') : '');
      var label = book[1] + ' ' + c + (from || to ? ':' + (from || 1) + (to && to !== (from || 1) ? '-' + to : '') : '');
      parts.push({ chapter: c, from: from, to: to, fetchId: fetchId, label: label });
    }
    var label = parts.length === 1 ? parts[0].label : book[1] + ' ' + c1 + (v1 ? ':' + v1 : '') + '\u2013' + c2 + (v2 ? ':' + v2 : '');
    return { book: idx, code: book[0], name: book[1], chapters: parts.length, parts: parts, label: label };
  }

  /** A book named on its own: every chapter, whole. */
  function wholeBook(idx) {
    var book = BOOKS[idx], parts = [];
    for (var c = 1; c <= book[2]; c++) parts.push({ chapter: c, from: 0, to: 0, fetchId: book[0] + '.' + c, label: book[1] + ' ' + c });
    return { book: idx, code: book[0], name: book[1], chapters: parts.length, parts: parts, whole: true,
             label: book[1] + (parts.length > 1 ? ' 1\u2013' + book[2] : ' 1') };
  }

  /** The verses of `verses` ([{ verse_number, text }]) that fall in a part's range (0 = unbounded). */
  function sliceVerses(verses, from, to) {
    return verses.filter(function (v) { return (!from || v.verse_number >= from) && (!to || v.verse_number <= to); });
  }

  /** The publisher's own form of what was stored: `JHN.3` (whole chapter) or `JHN.3.16-18`. */
  function partUsfm(code, chapter, verses, isWhole) {
    if (isWhole || !verses.length) return code + '.' + chapter;
    var f = verses[0].verse_number, t = verses[verses.length - 1].verse_number;
    return code + '.' + chapter + '.' + f + (t > f ? '-' + t : '');
  }

  // ---- how much a publisher lets be shown at once -----------------------------------------------------
  // Biblica's license (the NIV family) says "no more than two chapters or twenty-five verses, whichever is
  // greater". Where a publisher's terms say nothing (Lockman, public domain, ...), a loose five chapters.
  var BIBLICA_ORG = '05a9aa40-37b6-4e34-b9f1-a443fa4b1fff';
  var LIMITS = {
    biblica: { chapters: 2, verses: 25, text: 'The publisher allows up to two chapters or 25 verses at a time, whichever is greater.' },
    other: { chapters: 5, verses: 0, text: 'Up to 5 chapters at a time.' }
  };
  /**
   * A reason to refuse before fetching anything, or ''. A publisher that counts only chapters is refused
   * at once; one that also allows 25 verses (Biblica) is let through up to 25 chapters, because the verses
   * are only known as the chapters arrive (`withinLimit` then stops it).
   */
  function tooLong(limit, chapters) {
    if (chapters > 25 || (!limit.verses && chapters > limit.chapters)) return 'That is ' + chapters + ' chapters. ' + limit.text;
    return '';
  }

  function limitFor(organizationId) { return organizationId === BIBLICA_ORG ? LIMITS.biblica : LIMITS.other; }
  /** Is a passage of `chapters` chapters and `verses` verses within `limit`? (`verses` may be unknown: null.) */
  function withinLimit(limit, chapters, verses) {
    if (chapters <= limit.chapters) return true;
    return !!limit.verses && verses != null && verses <= limit.verses;
  }

  // ---- HTTP ----------------------------------------------------------------------------------

  function biblesUrl(languageRange, pageToken) {
    return API + '/v1/bibles?language_ranges[]=' + encodeURIComponent(languageRange || '*') + '&page_size=99' +
      (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
  }
  function bibleUrl(id) { return API + '/v1/bibles/' + encodeURIComponent(id); }
  function passageUrl(bibleId, passageId) {
    return API + '/v1/bibles/' + encodeURIComponent(bibleId) + '/passages/' + encodeURIComponent(passageId).replace(/%2E/gi, '.') + '?format=html';
  }

  /** A trimmed copy of a Bibles list entry, or null if it isn't one. */
  function cleanBible(b) {
    if (!b || typeof b.id !== 'number') return null;
    return {
      id: b.id,
      abbreviation: String(b.localized_abbreviation || b.abbreviation || '').trim(),
      title: String(b.localized_title || b.title || '').trim(),
      language: String(b.language_tag || '').trim(),
      copyright: String(b.copyright || '').trim(),
      organization: typeof b.organization_id === 'string' ? b.organization_id : '',
      link: typeof b.youversion_deep_link === 'string' ? b.youversion_deep_link : ''
    };
  }

  // ---- passage HTML -> verses ----------------------------------------------------------------

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…' };
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      var v = ENTITIES[e.toLowerCase()];
      return v == null ? all : v;
    });
  }

  /**
   * YouVersion passage HTML -> [{ verse_number, text }]. Verses start at <span class="yv-v" v="N">; the
   * printed number (yv-vlbl), notes and headings are not text. Poetry lines (separate <div>s) become line
   * breaks inside the verse they belong to. Text before the first marker is dropped.
   */
  function htmlToVerses(html) {
    var verses = [];
    var cur = null;
    var skipDepth = 0;           // inside a span whose content is not verse text
    var spans = [];              // stack: does this open span skip its content?
    var re, m;
    function push(text) {
      if (!cur) return;
      cur.text += text;
    }
    function newline() { if (cur && cur.text && !/\n$/.test(cur.text)) cur.text += '\n'; }
    var src = String(html || '');
    re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
    while ((m = re.exec(src))) {
      if (m[4] !== undefined) { if (!skipDepth) push(decode(m[4])); continue; }
      var closing = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
      if (tag === 'span') {
        if (closing) { if (spans.pop()) skipDepth--; continue; }
        var cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || '';
        var classes = cls.split(/\s+/);
        var selfClosed = /\/\s*$/.test(attrs);
        if (classes.indexOf('yv-v') !== -1) {
          var vn = parseInt((/\bv="(\d+)/.exec(attrs) || [])[1], 10);
          if (vn > 0) { cur = { verse_number: vn, text: '' }; verses.push(cur); }
          spans.push(false);
          continue;
        }
        var skip = classes.indexOf('yv-vlbl') !== -1 || classes.indexOf('note') !== -1 || classes.indexOf('yv-n') !== -1 ||
          classes.indexOf('fr') !== -1 || classes.indexOf('ft') !== -1;
        if (!selfClosed) { spans.push(skip); if (skip) skipDepth++; }
      } else if (tag === 'div' || tag === 'p' || tag === 'br') {
        if (!skipDepth) newline();
      }
    }
    return verses
      .map(function (v) { return { verse_number: v.verse_number, text: v.text.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim() }; })
      .filter(function (v) { return v.text; });
  }

  /** Verses -> one string for the preview. */
  function previewText(verses) {
    return verses.map(function (v) { return v.verse_number + ' ' + v.text.replace(/\n/g, ' '); }).join('  ');
  }

  // ---- licensing ---------------------------------------------------------------------------------

  /** Used when the publisher's response says nothing about how long it may be kept. */
  var DEFAULT_TTL_SECS = 3600;

  /**
   * The short notice printed on every slide: the version and the rights holder, "NIV \u00b7 \u00a9 Biblica, Inc.".
   * Taken from the publisher's own copyright text; the version name alone if it can't be read.
   */
  function shortNotice(abbreviation, copyright) {
    var name = String(abbreviation || '').trim();
    var m = /(?:\u00a9|\(c\)|copyright)\s*(?:\u00a9\s*)?[\d,\s\-\u2013]*\s*(?:by\s+)?([^.\u00ae\u2122\n;]{2,60})/i.exec(String(copyright || ''));
    var holder = m ? m[1].replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '') : '';
    if (/^public domain/i.test(String(copyright || '').trim())) holder = 'Public Domain';
    var tag = holder ? name + ' \u00b7 ' + (holder === 'Public Domain' ? holder : '\u00a9 ' + holder) : name;
    return tag.length > 60 ? tag.slice(0, 59) + '\u2026' : tag;
  }

  /** Seconds a passage may still be kept, from the host's `cacheSecs` (null = the response didn't say). */
  function keepSecs(cacheSecs) {
    return typeof cacheSecs === 'number' ? Math.max(0, Math.floor(cacheSecs)) : DEFAULT_TTL_SECS;
  }

  /** The `licensed` block that makes the host seal a passage and expire it (see OpenSanctuary's storage/db/licensed.rs). */
  function licensedBlock(bible, usfm, tag, ttlSecs) {
    return { bible_id: bible.id, usfm: usfm, tag: tag, copyright: bible.copyright || '', link: bible.link || '', ttl_secs: ttlSecs };
  }

  var api = {
    BOOKS: BOOKS, sliceVerses: sliceVerses, tooLong: tooLong, partUsfm: partUsfm, limitFor: limitFor, withinLimit: withinLimit, LIMITS: LIMITS, BIBLICA_ORG: BIBLICA_ORG, shortNotice: shortNotice, keepSecs: keepSecs, licensedBlock: licensedBlock, DEFAULT_TTL_SECS: DEFAULT_TTL_SECS, findBook: findBook, parseReference: parseReference, biblesUrl: biblesUrl, bibleUrl: bibleUrl,
    passageUrl: passageUrl, cleanBible: cleanBible, htmlToVerses: htmlToVerses, previewText: previewText, decode: decode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YouVersion = api;
})(typeof self !== 'undefined' ? self : this);
