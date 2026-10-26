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
   * "John 3:16-18" / "1 Cor 13" / "Ps 23:1-3" -> { book, code, name, chapter, from, to, id, label }.
   * One chapter at a time: a passage is a chapter or verses inside one. Whole books are refused on
   * purpose, and so are ranges across chapters. Throws a plain-language Error on anything else.
   */
  function parseReference(input) {
    var q = String(input || '').replace(/[–—]/g, '-').trim();
    if (!q) throw new Error('Type a reference such as John 3:16 or Psalm 23.');
    // Jude 3, Obadiah 5-7: a book with one chapter is cited by verse.
    var single = /^(.*?)[\s.]+(\d+)\s*(?:-\s*(\d+))?$/.exec(q);
    if (single) {
      var si = findBook(single[1]);
      if (si >= 0 && BOOKS[si][2] === 1 && (Number(single[2]) > 1 || single[3])) {
        q = BOOKS[si][1] + ' 1:' + single[2] + (single[3] ? '-' + single[3] : '');
      }
    }
    var m = /^(.*?)[\s.]*(\d+)\s*(?:[:.]\s*(\d+)\s*(?:-\s*(\d+)\s*(?:[:.]\s*(\d+))?)?)?$/.exec(q);
    if (!m || !m[1].trim()) {
      if (findBook(q) >= 0) throw new Error('Name a chapter too, for example ' + BOOKS[findBook(q)][1] + ' 1. Whole books are not downloaded.');
      throw new Error('I couldn’t read “' + q + '” as a reference. Try John 3:16 or Psalm 23.');
    }
    var idx = findBook(m[1]);
    if (idx === -2) throw new Error('“' + m[1].trim() + '” could be more than one book; spell it out.');
    if (idx < 0) throw new Error('I don’t know a book called “' + m[1].trim() + '”.');
    var book = BOOKS[idx];
    var chapter = Number(m[2]);
    if (chapter < 1 || chapter > book[2]) throw new Error(book[1] + ' has ' + book[2] + ' chapter' + (book[2] === 1 ? '' : 's') + '.');
    var from = m[3] ? Number(m[3]) : 0, to = m[4] ? Number(m[4]) : from;
    if (m[5]) throw new Error('One chapter at a time: look up each chapter separately.');
    if (m[3] && from < 1) throw new Error('Verses start at 1.');
    if (to < from) throw new Error('The verse range runs backwards.');
    var id = book[0] + '.' + chapter + (from ? '.' + from + (to > from ? '-' + to : '') : '');
    var label = book[1] + ' ' + chapter + (from ? ':' + from + (to > from ? '-' + to : '') : '');
    return { book: idx, code: book[0], name: book[1], chapter: chapter, from: from, to: to, id: id, label: label };
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

  var api = {
    BOOKS: BOOKS, findBook: findBook, parseReference: parseReference, biblesUrl: biblesUrl, bibleUrl: bibleUrl,
    passageUrl: passageUrl, cleanBible: cleanBible, htmlToVerses: htmlToVerses, previewText: previewText, decode: decode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YouVersion = api;
})(typeof self !== 'undefined' ? self : this);
