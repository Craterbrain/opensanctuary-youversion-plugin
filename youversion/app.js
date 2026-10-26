// YouVersion Bible: a sandboxed OpenSanctuary plugin. It has no network or console access of its own:
// the host fetches from api.youversion.com for it (net.fetch, with the user's own App Key), saves the
// passage the user chose (library.addScriptures) and runs the schedule command it may have been granted.
// Passages only: one chapter at a time, nothing is downloaded in bulk and nothing is kept until the user
// presses "Add". See docs/PLUGIN_PERMISSIONS.md in OpenSanctuary.
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

  async function api(url) {
    var res = await call('net.fetch', { url: url, headers: { 'X-YVP-App-Key': key, 'Accept': 'application/json' } });
    if (res.status === 401) throw new Error('YouVersion did not accept the key. Check it, or change it below.');
    if (res.status === 403) throw new Error('Your key is not licensed for that Bible. Accept its license in the YouVersion Platform portal.');
    if (res.status === 404) throw new Error('YouVersion has no such passage in that Bible.');
    if (res.status === 429) throw new Error('YouVersion says to slow down. Try again in a moment.');
    if (res.status < 200 || res.status >= 300) throw new Error('YouVersion answered ' + res.status + '.');
    try { return JSON.parse(res.body); } catch (e) { throw new Error('YouVersion sent something unreadable.'); }
  }

  // ---- key ----------------------------------------------------------------------------------------
  async function loadKey() {
    try {
      var r = await call('keyring.get', { account: 'app_key' });
      key = (r && r.secret) || '';
    } catch (e) { key = ''; }
    show('key-card', !key);
    show('lookup', !!key);
    if (key) await loadBibles();
    else setStatus('Add your YouVersion Platform key to begin.');
  }

  $('key-save').addEventListener('click', async function () {
    var value = $('key-input').value.trim();
    if (!value || value.length > 200 || /\s/.test(value)) { setStatus('That doesn’t look like an App Key.', 'error'); return; }
    try {
      await call('keyring.set', { account: 'app_key', secret: value });
      $('key-input').value = '';
      await loadKey();
    } catch (e) { setStatus('Could not save the key: ' + e.message, 'error'); }
  });

  $('key-change').addEventListener('click', async function () {
    try {
      await call('keyring.delete', { account: 'app_key' });
      key = ''; bibles = []; current = null; show('result', false);
      await loadKey();
      setStatus('Key removed. Paste a new one to continue.', 'ok');
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
      var data = await api(Y.passageUrl(bible.id, ref.id));
      var verses = Y.htmlToVerses(data.content);
      if (!verses.length) throw new Error('That passage came back empty.');
      var rights = await copyrightOf(bible);
      current = { bible: bible, ref: ref, verses: verses };
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

  $('add').addEventListener('click', async function () {
    if (!current || busy) return;
    busy = true;
    try {
      var item = { book: current.ref.name, chapter: current.ref.chapter, version: current.bible.abbreviation, verses: current.verses };
      var stored = await call('library.addScriptures', { items: [item] });
      var msg = 'Saved ' + current.ref.label + ' (' + current.bible.abbreviation + ').';
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

  if (OS.slot === 'dock') call('ui.resize', { height: 460 }).catch(function () {});
  loadKey();
})();
