# OpenSanctuary YouVersion plugin

Look up a passage in the licensed Bibles the [YouVersion Platform](https://developers.youversion.com) offers
(NIV, NASB, AMP and many more) and add it to an [OpenSanctuary](https://github.com/Craterbrain/opensanctuary)
schedule.

## What it does and does not do

- You use **your own** free YouVersion Platform App Key. Register an app at the Platform portal and accept the
  license for each Bible you want. The plugin keeps the key in OpenSanctuary's secure storage (`keyring.own`)
  and sends it only to `api.youversion.com`.
- **Passages only.** One chapter at a time, or verses inside one (`John 3:16-18`, `Psalm 23`, `1 Cor 13`,
  `Jude 3`). Whole books, whole Bibles and ranges across chapters are refused on purpose.
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

Check it first with `os-next --check-plugin youversion`.

## Develop

```sh
bun test                # reference parsing and HTML -> verses
```

`youversion/youversion.js` is pure logic (no DOM, no network); `youversion/app.js` is the panel.

## Licensing

The code is MIT (see `LICENSE`). Bible text belongs to its publishers and is subject to each version's license and
the YouVersion Platform terms; this repository contains none of it, and its tests use made-up text.
