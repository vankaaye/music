# Music

A personal, offline-first music player web app (PWA). It plays audio files
stored on your own device — no backend, no accounts, no streaming service, no
external APIs. Everything runs client-side and your audio never leaves the
device.

## Features

- **Library** — add individual files or a whole folder; picking a folder pulls
  in every subfolder too. Files are matched on their path, so two albums may
  each contain a track of the same name, and untagged files fall back to their
  containing folder as the album. Hand-written ID3v2
  tag parser (v2.2 / v2.3 / v2.4) reads title, artist, album and embedded
  cover art, with a `Artist - Title` filename fallback. Download-site branding
  (`[iSongs.info]`, `[www.AtoZmp3.in]`, bare domains, leading track numbers) is
  stripped from titles, artists and albums on import, while genuine
  parentheticals like `(Original Motion Picture Soundtrack)` are kept; an
  existing library is cleaned once automatically and **Clean Up Names** in the
  Add menu re-runs it. Browse by Songs,
  Albums (artwork grid) or Artists, drill into a group, and search across
  title / artist / album. Edit mode removes songs. Shows song count and how
  much storage the library uses.
- **Storage** — audio blobs, artwork and metadata are persisted in IndexedDB
  so the library survives reloads (`navigator.storage.persist()` is requested
  on first import). Duplicate files (same name + size) are skipped, with live
  import progress. If IndexedDB is unavailable (e.g. `file://` or private
  mode) a warning is shown and playback still works for the session.
- **Playback** — a blurred-glass mini player, a full-screen Now Playing sheet
  (large artwork, scrubber, elapsed/remaining time, previous / play / next,
  shuffle, repeat off/all/one, volume), swipe-down to dismiss, artwork that
  scales while playing, the blurred cover as the background, MediaSession
  integration for lock-screen / headphone / car controls, and it remembers and
  restores the last track and position (paused) on next launch.
- **One library on every device** — connect a **Link** (a `library.json` or
  `.m3u` listing your tracks, uploaded next to the audio on any static host) and
  the same library appears everywhere you connect it. No server to run and
  nothing to configure on hosts that already allow cross-origin reads. See
  **[SETUP-LIBRARY.md](SETUP-LIBRARY.md)**; `tools/make-library.py` generates the
  list file from a folder.
- **Your own server (WebDAV / TrueNAS)** — connect a WebDAV share and the app
  lists it recursively, reads tags, and streams tracks on demand. Connect the
  same server from your phone, tablet and desktop to get the same library
  everywhere. Refresh picks up newly added files and prunes deleted ones;
  Disconnect removes the server's tracks from the device. Credentials are
  stored only on that device, and a service worker attaches them to media
  requests so seeking works.
- **Downloads / offline** — every streamable track has an Apple-style download
  button (circled arrow → live progress ring → filled check). Downloaded audio
  is stored on the device, so it plays with no connection and uses no mobile
  data; playback always prefers the local copy over the network. Album and
  artist pages have a **Download** action for the whole group, the library
  footer reports what is on-device versus streaming, and going offline shows
  how many tracks are ready. Tap the check to free the space again — the track
  stays in the library and can be re-downloaded or streamed.
- **AirPlay / device output** — in Safari the Now Playing view offers Apple's
  own AirPlay picker, with the button lit while audio is routed to a device.
  Other browsers get the Remote Playback picker (e.g. Cast) when a receiver is
  available; the button hides where neither is supported.
  **Songs stored on the device cannot be sent over AirPlay**: hand-off gives the
  receiver a URL to fetch, and an imported or downloaded file only exists inside
  the browser, so the receiver has nothing to play. The app says so when you try.
  Tracks streamed from a library link have a real address and can hand off. To
  send on-device audio, use **Control Centre → Screen Mirroring**, which carries
  the device's own output; the AirPlay control in the Now Playing card uses the
  same hand-off mechanism and fails the same way.
- **Lyrics** — a lyrics button in Now Playing shows time-synced lyrics with the
  current line highlighted and auto-scrolled, Apple Music style; tap any line to
  jump to it. Lyrics come from the file's own embedded ID3 tags first, then from
  [LRCLIB](https://lrclib.net) (free, no account). Fetched lyrics are cached on
  the device, so they work offline afterwards. Untimed lyrics are shown as plain
  text, and manual scrolling pauses the auto-follow for a few seconds.
- **Desktop** — drop audio files anywhere on the page to add them; space /
  arrow keys control playback.

### Connecting a library

The quickest route is **+ → Connect Library → Link** — see
**[SETUP-LIBRARY.md](SETUP-LIBRARY.md)**. The WebDAV route below is for when you
need password-protected access to your own server.

> Using Nextcloud? See **[SETUP-NEXTCLOUD.md](SETUP-NEXTCLOUD.md)** for
> step-by-step instructions, including the CORS configuration.

**+ → Connect Server…**, then enter the WebDAV URL (e.g.
`https://nas.example.com/webdav`), an optional subfolder, and credentials.

Your server must:
- be reachable over **HTTPS** (a page served over HTTPS cannot call `http://`),
- allow **WebDAV `PROPFIND`** on that path,
- send **CORS** headers permitting this site — `Access-Control-Allow-Origin`,
  plus `Authorization`, `Depth`, `Range` in `Access-Control-Allow-Headers`, and
  `PROPFIND` in `Access-Control-Allow-Methods`.

To reach a home NAS from outside the house, expose it through a reverse proxy
with a real certificate, or join the devices with a VPN such as Tailscale.

## Tech

Plain HTML, CSS and vanilla JavaScript — no framework, no build step, no
dependencies, no CDNs. One `index.html` with inline CSS and JS. Service
worker, web manifest and icons are the only separate files (they have to be).
Apple Music dark theme, safe-area insets for notched phones, and
`prefers-reduced-motion` respected. Tested on a 390px-wide viewport.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire app (markup, styles, logic) |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Service worker — precaches the app shell (never the audio) |
| `icon-192.png`, `icon-512.png` | Maskable app icons |
| `apple-touch-icon.png` | 180px iOS home-screen icon |

## Run / Deploy

Because it uses a service worker and IndexedDB, serve it over `http(s)` (not
`file://`):

```sh
# from this folder
python3 -m http.server 8080
# then open http://localhost:8080
```

### GitHub Pages

Push these files to the repository and enable **Settings → Pages → Deploy from
a branch**, selecting the branch and the `/ (root)` folder. Pages requires a
public repository unless your plan includes private Pages. The live URL will be
`https://<user>.github.io/<repo>/`.
