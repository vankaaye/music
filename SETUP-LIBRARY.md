# One library everywhere (and AirPlay that works)

Put your music somewhere with a real web address, then point the app at a list
file. Every device you connect shows the same library, and AirPlay finally
works — a HomePod or Apple TV fetches the track itself, which it cannot do for
a file living inside your browser.

Two commands do the work:

```sh
# 1. will this host work?  (run BEFORE uploading anything)
./tools/publish-library.sh check https://your-host/music/

# 2. build the list, upload, verify, print the link
./tools/publish-library.sh publish ~/Music r2:music https://your-host/music/
```

---

## Step 1 — Pick a host

The only requirements are **HTTPS** and a permissive **`Access-Control-Allow-Origin`**
header. Recommended:

| Host | Free tier | Why |
| --- | --- | --- |
| **Cloudflare R2** | 10 GB, no egress fees | No bandwidth billing surprises. |
| **Backblaze B2** | 10 GB | Has a "share with all HTTPS origins" CORS preset. |

Any static host works — S3, a VPS with nginx, Supabase Storage. GitHub Pages
technically works but **do not put commercial music on it**: it is public and
against GitHub's terms.

### Cloudflare R2, specifically

1. Sign up at <https://dash.cloudflare.com>, open **R2**, **Create bucket**
   (call it `music`).
2. In the bucket's **Settings**, enable public access — either the provided
   `r2.dev` development URL or a custom domain. Note the resulting base URL.
3. In the bucket's **CORS policy**, allow this app to read it:

```json
[
  {
    "AllowedOrigins": ["https://vankaaye.github.io"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

**Do not take my word for any of that.** Upload one small file, then:

```sh
./tools/publish-library.sh check https://<your-r2-url>/test.mp3
```

It reports HTTPS, reachability, CORS and Range separately, and exits non-zero if
the host will not work. Sort this out before uploading a whole library.

## Step 2 — Set up rclone

[rclone](https://rclone.org/install/) speaks R2, B2, S3 and most other storage.

```sh
rclone config      # choose "s3" for R2, then Cloudflare R2 as the provider
```

Name the remote `r2`. R2 needs an **S3 API token** (R2 → Manage API tokens),
which gives you an access key, a secret and an endpoint.

Check it:

```sh
rclone lsd r2:
```

## Step 3 — Publish

```sh
./tools/publish-library.sh publish ~/Music r2:music https://<your-r2-url>/
```

It will:

1. build `library.json` from your folder — reading ID3 tags, falling back to
   `Artist - Title` filenames, recursing into subfolders;
2. upload the audio and the manifest with rclone, showing progress;
3. re-check the uploaded manifest over HTTPS with CORS and Range;
4. print the link to paste into the app.

## Step 4 — Connect

In the app: **+ → Connect Library → Link**, paste the printed URL, **Connect**.

Repeat on every device — iPhone, the home-screen app, tablet, laptop. Same
library on all of them.

## Step 5 — AirPlay

Play a track, open Now Playing, tap the AirPlay button, pick your speaker. The
receiver fetches the track from your host, so it plays.

Downloading a track for offline use does not break this: while AirPlay is
active the app streams from the URL, and goes back to the local copy afterwards.

---

## Adding music later

```sh
./tools/publish-library.sh publish ~/Music r2:music https://<your-r2-url>/
```

Then tap **Refresh** on the library bar in the app. New tracks appear, deleted
ones drop out, and existing downloads are kept.

## Two things to be clear about

**Anything reachable this way is reachable by anyone with the link.** Link mode
sends no password, because browsers can only read files a host serves openly.
Use an unguessable bucket path. If you need real authentication, use **WebDAV**
mode — at the cost of the CORS setup in [SETUP-NEXTCLOUD.md](SETUP-NEXTCLOUD.md).

**Check your storage bill.** 10 GB is roughly 2,000 songs at 5 MB. R2 charges no
egress; most other hosts do, so streaming a lot from them can cost money.

## If the app still will not connect

It reports the real reason:

| Message | Meaning |
| --- | --- |
| "Could not fetch that link…" | No CORS, or the address is wrong |
| "That link is not publicly readable" | Bucket is private — make it public, or use WebDAV mode |
| "Nothing found at that link" | Wrong filename or path |
| "No audio tracks were listed" | Manifest parsed but had no usable entries |

Run `check` against the exact URL you pasted; it will tell you which of HTTPS,
reachability, CORS or Range is at fault.
