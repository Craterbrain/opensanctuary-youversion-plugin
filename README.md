# OpenSanctuary YouVersion plugin

Look up a passage in the licensed Bibles the [YouVersion Platform](https://developers.youversion.com) offers
(NIV, NASB, AMP and many more) and add it to an [OpenSanctuary](https://github.com/Craterbrain/opensanctuary)
schedule.

## What it does and does not do

- **No key needed.** OpenSanctuary releases include a YouVersion key and add it themselves, so the plugin works as soon as it is
  approved. The plugin and its page never see that key.
- **Your own key, if you want it.** Register a free app at the Platform portal, accept the licenses you want, and paste its App
  Key under "Use my own key". It is kept in OpenSanctuary's secure storage (`keyring.own`), sent only to `api.youversion.com`,
  and used instead of the built-in one.
- **Passages, and short books, within each publisher's limit.** Chapters or verses (`John 3:16-18`, `Psalm 23`, `Jude 3`), and ranges across
  chapters (`John 3:16-4:2`, `Psalm 23-25`; one call per chapter, trimmed to the verses asked for). The **NIV** family (Biblica)
  allows "no more than two chapters or twenty-five verses, whichever is greater"; for any other publisher, whose terms set no limit
  (Lockman's NASB and AMP, public domain), the plugin allows a loose five chapters. A lookup stops fetching as soon as it passes the
  limit. **A book named on its own is the whole book**, allowed only when it fits that limit: for the NIV, Obadiah, Philemon, 2 John, 3 John, Jude
  (one chapter) and Haggai (two); for other publishers, books of up to five chapters (Ruth, Joel, Jonah, Philippians, Titus...). A longer book,
  or a whole Bible, is refused before anything is fetched.
- A lookup shows the passage with the publisher's copyright notice. Nothing is saved until you press
  **Add to library & schedule**, which stores that one passage in your Bible library and puts it on the schedule.
- **Kept only as long as the publisher allows.** Every passage is stored with the lifetime YouVersion's `Cache-Control` gives
  (the NIV: one hour). OpenSanctuary seals it on disk, deletes it when the time is up (and at every start-up), and leaves it
  out of saved and exported schedules, which carry only the reference. While the app is open the plugin asks again before the
  time runs out and renews it (the text stays as it is).
- **Opening a schedule looks the passages up again.** A saved or exported schedule that holds NIV passages shows "fetching the
  text…" and the plugin fills them in by itself. It needs this plugin installed and approved, with the key saved.
- Every slide carries the publisher's short notice (`NIV · © Biblica, Inc`) as its last line.
- The list of Bibles and each copyright notice are kept in memory for the visit only.

## Install

```sh
./package.sh          # builds youversion-plugin.zip
```

In OpenSanctuary: **Settings > Plugins > Install plugin...**, choose the zip, then review and approve what it
asks for. It needs an OpenSanctuary release with licensed-passage support (after 0.3.5; see `docs/LICENSED_SCRIPTURE.md` there).

(A build of OpenSanctuary made without the key, such as a local one, asks for your own key.)

Check it first with `os-next --check-plugin youversion`.

## Develop

```sh
bun test                # reference parsing and HTML -> verses
```

`youversion/youversion.js` is pure logic (no DOM, no network); `youversion/app.js` is the panel.

## Licensing

The code is MIT (see `LICENSE`). Bible text belongs to its publishers and is subject to each version's license and
the YouVersion Platform terms; this repository contains none of it, and its tests use made-up text.
