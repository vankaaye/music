# One library on every device — the short way

The app can read your music from a **link** instead of a server. You upload
your audio somewhere, upload one small list file next to it, and paste that
file's address into the app. There is no server to run and, on the hosts below,
nothing to configure.

Do this once per device (phone, the installed home-screen app, tablet, laptop)
and they all show the same library.

---

## Step 1 — Make the list file

From this repo:

```sh
python3 tools/make-library.py /path/to/your/music
```

It walks the folder (including subfolders), reads ID3 tags, falls back to
`Artist - Title` filenames, and writes **`library.json`** inside that folder.
No dependencies — the tag reader is built in.

Check it looks sane, then move on. You can hand-edit the file; it is only a
list of tracks.

## Step 2 — Upload

Upload the audio **and `library.json` together**, keeping the same folder
layout. The manifest uses relative paths, so as long as they stay side by side
it works wherever you put it.

## Step 3 — Connect

In the app: **+ → Connect Library → Link**, paste the address of
`library.json`, and tap **Connect**.

Then tap the download arrow on anything you want available offline and
data-free.

---

## Where to upload

The only requirement is that the host serves your files publicly over **HTTPS**
and sends the `Access-Control-Allow-Origin` header. These are verified as
sending `*`:

| Host | Free tier | Notes |
| --- | --- | --- |
| **Cloudflare R2** | 10 GB, no egress fees | Best balance. Set one CORS rule allowing `https://vankaaye.github.io`. |
| **Backblaze B2** | 10 GB | Similar; CORS is a bucket setting with a "share with all HTTPS origins" preset. |
| **GitHub Pages** | ~1 GB per site | Zero setup — already sends `*` and supports seeking. **Read the warning below.** |

Any static host works — a VPS with nginx, S3, Supabase Storage — as long as it
sends that header. If it doesn't, the app tells you exactly that when you try
to connect.

### Two honest warnings

**Anything reachable this way is reachable by anyone with the link.** The Link
mode sends no password, because browsers can only read files the host serves
openly. Use an unguessable folder name, and treat these URLs as semi-private,
not secret. If you need real authentication, use **WebDAV** mode instead — it
sends a username and password, at the cost of the CORS configuration described
in [SETUP-NEXTCLOUD.md](SETUP-NEXTCLOUD.md).

**Do not publish commercial music publicly.** Uploading albums you bought to a
public GitHub Pages site is copyright infringement and against GitHub's terms,
however convenient it is. For music you don't own the rights to, use a private
bucket with an unguessable path (R2/B2), or stay with local imports and
downloads.

---

## The list file format

`library.json` — relative paths resolve against the manifest's own address:

```json
{
  "tracks": [
    { "url": "Kailash Kher - Vachaadayyo Saami.mp3",
      "title": "Vachaadayyo Saami",
      "artist": "Kailash Kher",
      "album": "Bharat Ane Nenu",
      "duration": 304 },
    { "url": "Album One/Moonlight.mp3", "title": "Moonlight", "artist": "Night Owl" }
  ]
}
```

Everything except `url` is optional — the app reads the file's own tags when a
field is missing. A bare list of URLs is also accepted:

```json
["one.mp3", "two.mp3", "https://elsewhere.example.com/three.mp3"]
```

**M3U playlists work too**, including `#EXTINF` metadata:

```
#EXTM3U
#EXTINF:304,Kailash Kher - Vachaadayyo Saami
Kailash Kher - Vachaadayyo Saami.mp3
```

## Adding music later

Re-run the script, re-upload `library.json` (and the new audio), then tap
**Refresh** on the library bar in the app. New tracks appear; tracks removed
from the list are dropped from the library. Downloads you already made are kept.

## If it doesn't connect

The app states the actual reason. The common ones:

| Message | Meaning |
| --- | --- |
| "Could not fetch that link…" | Host doesn't allow other sites to read it (no CORS), or the address is wrong |
| "That link is not publicly readable" | The file needs auth — make it public, or use WebDAV mode |
| "Nothing found at that link" | Wrong filename or path |
| "No audio tracks were listed" | The manifest parsed but had no usable entries |

To check a host yourself before involving the app:

```sh
curl -I -H "Origin: https://vankaaye.github.io" https://your-host/path/library.json
```

You want `HTTP/2 200` and an `access-control-allow-origin` header in the reply.
