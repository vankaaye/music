# Music

A personal, offline-first music player web app (PWA). It plays audio files
stored on your own device — no backend, no accounts, no streaming service, no
external APIs. Everything runs client-side and your audio never leaves the
device.

## Features

- **Library** — add your own audio files (multi-select). Hand-written ID3v2
  tag parser (v2.2 / v2.3 / v2.4) reads title, artist, album and embedded
  cover art, with a `Artist - Title` filename fallback. Browse by Songs,
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
- **Desktop** — drop audio files anywhere on the page to add them; space /
  arrow keys control playback.

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
