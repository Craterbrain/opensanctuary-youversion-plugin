// YouVersion Bible: a sandboxed OpenSanctuary plugin. It has no network or console access of its own:
// the host fetches from api.youversion.com for it (net.fetch, with the user's own App Key), saves the
// passage the user chose (library.addScriptures) and runs the schedule command it may have been granted.
// Passages only: one chapter at a time, nothing is downloaded in bulk and nothing is kept until the user
// presses "Add". Licensed text is kept only as long as the publisher's own Cache-Control allows: the host
// seals it, expires it, and drops it from every saved or exported schedule; this page renews it while the
// app is open, and looks it up again when a schedule that names it is opened. See OpenSanctuary's
// docs/LICENSED_SCRIPTURE.md.
(function () {
  'use strict';

  var Y = YouVersion;
  var call = OS.call;
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('status');
  var key = '';
  var bibles = [];          // every Bible the key can use (kept for this visit only)
  var copyrights = {};      // bible id -> copyright text, fetched when first needed
  var current = null;       // the passage on screen: { bible, ref, verses }
  var busy = false;

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }
  function show(id, on) { $(id).classList.toggle('hidden', !on); }

  /** One YouVersion call: { data, cacheSecs }, `cacheSecs` being how long the publisher lets it be kept. */
  async function apiFull(url) {
    // Without a key of its own the request goes out bare: OpenSanctuary's server adds the key its release
    // carries (the plugin never sees that one). A key the church saved here is sent instead.
    var headers = { 'Accept': 'application/json' };
    if (key) headers['X-YVP-App-Key'] = key;
    var res = await call('net.fetch', { url: url, headers: headers });
    if (res.status === 401) throw new Error(key ? 'YouVersion did not accept your key. Check it, or remove it to use the built-in one.' : 'No YouVersion key is available in this build. Add your own below.');
    if (res.status === 403) throw new Error('Your key is not licensed for that Bible. Accept its license in the YouVersion Platform portal.');
    if (res.status === 404) throw new Error('YouVersion has no such passage in that Bible.');
    if (res.status === 429) throw new Error('YouVersion says to slow down. Try again in a moment.');
    if (res.status < 200 || res.status >= 300) throw new Error('YouVersion answered ' + res.status + '.');
    var data;
    try { data = JSON.parse(res.body); } catch (e) { throw new Error('YouVersion sent something unreadable.'); }
    return { data: data, cacheSecs: res.cacheSecs };
  }
  async function api(url) { return (await apiFull(url)).data; }

  // ---- key ----------------------------------------------------------------------------------------
  // Releases of OpenSanctuary carry a YouVersion key and add it themselves, so nothing is needed here. A church
  // can still save its own (its own app, its own licenses); it is kept in secure storage and wins.
  async function loadKey() {
    try {
      var r = await call('keyring.get', { account: 'app_key' });
      key = (r && r.secret) || '';
    } catch (e) { key = ''; }
    show('lookup', true);
    show('key-card', false);
    show('key-remove', !!key);
    $('key-change').textContent = key ? 'Change or remove my key' : 'Use my own key';
    await loadBibles();
    if (!bibles.length && !key) show('key-card', true);
  }

  $('key-save').addEventListener('click', async function () {
    var value = $('key-input').value.trim();
    if (!value || value.length > 200 || /\s/.test(value)) { setStatus('That doesn\u2019t look like an App Key.', 'error'); return; }
    try {
      await call('keyring.set', { account: 'app_key', secret: value });
      $('key-input').value = '';
      await loadKey();
    } catch (e) { setStatus('Could not save the key: ' + e.message, 'error'); }
  });

  $('key-change').addEventListener('click', function () { show('key-card', $('key-card').classList.contains('hidden')); });

  $('key-remove').addEventListener('click', async function () {
    try {
      await call('keyring.delete', { account: 'app_key' });
      key = ''; bibles = []; current = null; show('result', false);
      await loadKey();
    } catch (e) { setStatus('Could not remove the key: ' + e.message, 'error'); }
  });

  // ---- Bibles ---------------------------------------------------------------------------------------
  async function loadBibles() {
    setStatus('Loading the Bibles your key can use…');
    try {
      var list = [], token = null;
      for (var page = 0; page < 12; page++) {
        var data = await api(Y.biblesUrl('*', token));
        (data.data || []).forEach(function (b) { var c = Y.cleanBible(b); if (c) list.push(c); });
        token = data.next_page_token;
        if (!token) break;
      }
      bibles = list;
      var langs = {};
      bibles.forEach(function (b) { langs[b.language || '?'] = true; });
      var sel = $('lang');
      sel.textContent = '';
      Object.keys(langs).sort(function (a, b) { return a === 'en' ? -1 : b === 'en' ? 1 : a < b ? -1 : 1; }).forEach(function (l) {
        var o = document.createElement('option'); o.value = l; o.textContent = languageName(l); sel.appendChild(o);
      });
      fillVersions();
      setStatus(bibles.length ? bibles.length + ' Bibles available to your key.' : 'Your key has no Bibles yet. Accept licenses in the YouVersion Platform portal.', bibles.length ? '' : 'error');
    } catch (e) {
      setStatus(e.message, 'error');
    }
  }

  function languageName(tag) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) || tag; } catch (e) { return tag; }
  }

  function fillVersions() {
    var lang = $('lang').value;
    var sel = $('version');
    sel.textContent = '';
    bibles.filter(function (b) { return (b.language || '?') === lang; })
      .sort(function (a, b) { return a.abbreviation < b.abbreviation ? -1 : 1; })
      .forEach(function (b) {
        var o = document.createElement('option');
        o.value = String(b.id);
        o.textContent = b.abbreviation + ' — ' + b.title;
        sel.appendChild(o);
      });
  }
  $('lang').addEventListener('change', fillVersions);

  function selectedBible() {
    var id = Number($('version').value);
    return bibles.filter(function (b) { return b.id === id; })[0] || null;
  }

  async function copyrightOf(bible) {
    if (copyrights[bible.id] == null) {
      try {
        var d = await api(Y.bibleUrl(bible.id));
        copyrights[bible.id] = String(d.copyright || d.promotional_content || '').trim();
      } catch (e) { copyrights[bible.id] = ''; }
    }
    return copyrights[bible.id];
  }

  // ---- lookup ----------------------------------------------------------------------------------------
  async function lookup() {
    if (busy) return;
    var bible = selectedBible();
    if (!bible) { setStatus('Pick a Bible first.'); return; }
    var ref;
    try { ref = Y.parseReference($('ref').value); } catch (e) { setStatus(e.message, 'error'); return; }
    busy = true;
    show('result', false);
    current = null;
    setStatus('Looking up ' + ref.label + ' in ' + bible.abbreviation + '…');
    try {
      var got = await apiFull(Y.passageUrl(bible.id, ref.id));
      var data = got.data;
      var verses = Y.htmlToVerses(data.content);
      if (!verses.length) throw new Error('That passage came back empty.');
      var rights = await copyrightOf(bible);
      current = { bible: bible, ref: ref, verses: verses, keepSecs: Y.keepSecs(got.cacheSecs), fetchedAt: Date.now() };
      $('result-title').textContent = (data.reference || ref.label) + ' · ' + bible.abbreviation;
      var box = $('verses');
      box.textContent = '';
      verses.forEach(function (v) {
        var n = document.createElement('span'); n.className = 'vn'; n.textContent = v.verse_number;
        box.appendChild(n);
        box.appendChild(document.createTextNode(v.text + '\n'));
      });
      $('attribution').textContent = (rights ? rights + ' · ' : '') + 'Provided by YouVersion' + (bible.link ? ' (' + bible.link + ')' : '') + '.';
      show('result', true);
      setStatus(verses.length + ' verse' + (verses.length === 1 ? '' : 's') + '. Add it to put it in your library and schedule.', 'ok');
    } catch (e) {
      setStatus(e.message, 'error');
    } finally {
      busy = false;
    }
  }
  $('go').addEventListener('click', lookup);
  $('ref').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') lookup(); });

  // ---- keeping a passage ---------------------------------------------------------------------------
  var kept = {};            // library id -> { expiresAt, bible, usfm }  (this visit only)

  function info(bible) { return { id: bible.id, copyright: copyrights[bible.id] || '', link: bible.link }; }

  /** Saves a passage the way the publisher allows: sealed and expiring (ttlSecs), never longer. */
  async function keep(bible, usfm, book, chapter, verses, ttlSecs) {
    if (ttlSecs <= 0) throw new Error('YouVersion does not allow ' + bible.abbreviation + ' text to be kept, so it can\u2019t be added.');
    await copyrightOf(bible);
    var licensed = Y.licensedBlock(info(bible), usfm, Y.shortNotice(bible.abbreviation, copyrights[bible.id]), ttlSecs);
    var stored = await call('library.addScriptures', { items: [{ book: book, chapter: chapter, version: bible.abbreviation, verses: verses, licensed: licensed }] });
    kept[stored.ids[0]] = { expiresAt: (stored.expiresAtMs && stored.expiresAtMs[0]) || Date.now() + ttlSecs * 1000, bible: bible, usfm: usfm };
    return stored;
  }

  $('add').addEventListener('click', async function () {
    if (!current || busy) return;
    busy = true;
    try {
      var c = current;
      var ttl = c.keepSecs - Math.floor((Date.now() - c.fetchedAt) / 1000);
      var verses = c.verses;
      if (ttl < 5) {
        // The look-up's own lifetime ran out while it sat on screen: ask again.
        var again = await apiFull(Y.passageUrl(c.bible.id, c.ref.id));
        verses = Y.htmlToVerses(again.data.content);
        ttl = Y.keepSecs(again.cacheSecs);
      }
      var stored = await keep(c.bible, c.ref.id, c.ref.name, c.ref.chapter, verses, ttl);
      var msg = 'Saved ' + c.ref.label + ' (' + c.bible.abbreviation + '), kept ' + describeSecs(ttl) + ' as its publisher allows.';
      try {
        await call('sendCommand', { command: { AddToSchedule: { item_type: 'scripture', item_id: stored.ids[0] } } });
        msg += ' Added to the schedule.';
      } catch (e) {
        msg += ' (Not added to the schedule: ' + e.message + ')';
      }
      setStatus(msg, 'ok');
    } catch (e) {
      setStatus('Could not save the passage: ' + e.message, 'error');
    } finally {
      busy = false;
    }
  });

  function describeSecs(s) {
    if (s >= 86400) return 'for ' + Math.round(s / 86400) + ' day' + (s >= 172800 ? 's' : '');
    if (s >= 3600) return 'for ' + Math.round(s / 3600) + ' hour' + (s >= 5400 ? 's' : '');
    return 'for ' + Math.max(1, Math.round(s / 60)) + ' minute' + (s >= 90 ? 's' : '');
  }

  // ---- renewing: ask the publisher again before the time is up ------------------------------------------
  // The text stays exactly as it is; the publisher's fresh answer only tells how much longer it may be kept
  // (a Bible whose answer says "don't keep" stops being renewed, and the host deletes the passage when its
  // time is up).
  async function renewSoon() {
    var due = Object.keys(kept).filter(function (id) { return kept[id].expiresAt - Date.now() < 150000; });
    for (var i = 0; i < due.length; i++) {
      var id = due[i], k = kept[id];
      try {
        var res = await apiFull(Y.passageUrl(k.bible.id, k.usfm));   // the answer's body is thrown away
        var secs = Y.keepSecs(res.cacheSecs);
        if (secs <= 0) { delete kept[id]; continue; }
        var r = await call('library.refreshLicensed', { ids: [id], ttlSecs: secs });
        if (r.refreshed) k.expiresAt = r.expiresAtMs; else delete kept[id];   // the host no longer has it
      } catch (e) {
        if (k.expiresAt < Date.now()) delete kept[id];
      }
    }
  }
  setInterval(renewSoon, 30000);

  // ---- looking up again: a schedule that names licensed passages was opened ------------------------------
  var resolving = {};
  OS.on('licensed', async function (data) {
    var requests = (data && data.requests) || [];
    for (var i = 0; i < requests.length; i++) {
      var q = requests[i];
      var slot = q.item_id + '|' + q.usfm;
      if (resolving[slot] || q.source !== 'youversion') continue;
      resolving[slot] = true;
      try {
        if (!bibles.length) await loadBibles();
        var bible = bibles.filter(function (b) { return b.id === q.bible_id; })[0];
        if (!bible) throw new Error('your key can\u2019t use that Bible (' + q.version + ') any more');
        var got = await apiFull(Y.passageUrl(bible.id, q.usfm));
        var verses = Y.htmlToVerses(got.data.content);
        if (!verses.length) throw new Error('the passage came back empty');
        var stored = await keep(bible, q.usfm, q.book, q.chapter, verses, Y.keepSecs(got.cacheSecs));
        await call('sendCommand', { command: { ResolveLicensed: { item_id: q.item_id, passage_id: stored.ids[0] } } });
        setStatus('Looked up ' + (got.data.reference || q.usfm) + ' (' + bible.abbreviation + ') for the schedule.', 'ok');
      } catch (e) {
        setStatus('Could not look up ' + q.usfm + ': ' + e.message, 'error');
      } finally {
        delete resolving[slot];
      }
    }
  });

  if (OS.slot === 'dock') call('ui.resize', { height: 460 }).catch(function () {});
  loadKey();
})();
