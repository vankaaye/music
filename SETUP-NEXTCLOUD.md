# Connecting the Music app to Nextcloud

The app runs at `https://vankaaye.github.io/music/` and talks to your Nextcloud
over WebDAV. Follow these steps in order.

**Read this first:** the one step that actually blocks people is **CORS**
(step 5). Your browser refuses to let a page on `github.io` read files from
your Nextcloud unless Nextcloud explicitly says it's allowed — and Nextcloud
does *not* say so by default. Adding that permission needs access to the web
server in front of Nextcloud (nginx / Apache / Caddy).

If you are on **managed/shared Nextcloud hosting** where you cannot edit the
web server config, skip to [Option B](#option-b-no-cors-needed) — it avoids
CORS completely and is honestly the easier path.

---

## Option A — Nextcloud you control

### 1. Get Nextcloud running over HTTPS

Any of these is fine:

- **Nextcloud AIO** (Docker, recommended — handles certificates for you):
  <https://github.com/nextcloud/all-in-one>
- A VPS with the official Docker image behind Caddy or nginx
- An existing Nextcloud you already run

The only hard requirements: a **real HTTPS certificate** (not self-signed —
Let's Encrypt is free) and a hostname. A page served over HTTPS cannot talk to
an `http://` server, and browsers reject self-signed certs for this.

### 2. Upload your music

In the Nextcloud web UI, create a folder called `Music` and upload your files
into it. Subfolders are fine — the app crawls them recursively.

Supported: `.mp3`, `.m4a`, `.aac`, `.flac`, `.wav`, `.ogg`, `.oga`, `.opus`,
`.wma`. Anything else in the folder is ignored.

Tags matter for how things group: the app reads ID3 title/artist/album and
embedded cover art. Untagged files fall back to the filename, so naming them
`Artist - Title.mp3` gives good results.

### 3. Create an app password

Do **not** use your login password — if you have two-factor auth enabled it
will not work for WebDAV at all, and an app password can be revoked on its own.

1. Click your avatar (top right) → **Settings**
2. **Security** (left sidebar, under Personal)
3. Scroll to **Devices & sessions**
4. Type a name like `Music PWA` → **Create new app password**
5. Copy the generated password now — it is shown only once

### 4. Find your WebDAV URL

On that same Security page (or Settings → Files), Nextcloud shows its WebDAV
address at the bottom left. It looks like:

```
https://YOUR-HOST/remote.php/dav/files/YOUR-USERNAME/
```

Note both `YOUR-HOST` and the exact `YOUR-USERNAME` spelling.

### 5. Allow this site (CORS) — the important step

Add these headers on your reverse proxy. The preflight `OPTIONS` request must
be answered **by the proxy**, not passed to Nextcloud — Nextcloud replies `401`
to unauthenticated `OPTIONS`, which the browser reads as "denied".

#### Caddy (simplest)

```caddy
your-host.example.com {
    @dav path /remote.php/dav/*
    header @dav {
        Access-Control-Allow-Origin  "https://vankaaye.github.io"
        Access-Control-Allow-Methods "GET, HEAD, OPTIONS, PROPFIND"
        Access-Control-Allow-Headers "Authorization, Depth, Range, Content-Type"
        Access-Control-Expose-Headers "Content-Length, Content-Range, Accept-Ranges"
    }

    @davpreflight {
        path /remote.php/dav/*
        method OPTIONS
    }
    respond @davpreflight 204

    reverse_proxy localhost:11000   # your Nextcloud
}
```

#### nginx

Inside the `server { ... }` block for your Nextcloud, **above** the existing
PHP `location` blocks:

```nginx
location ^~ /remote.php/dav {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin  "https://vankaaye.github.io" always;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS, PROPFIND" always;
        add_header Access-Control-Allow-Headers "Authorization, Depth, Range, Content-Type" always;
        add_header Access-Control-Max-Age 86400 always;
        add_header Content-Length 0;
        return 204;
    }

    add_header Access-Control-Allow-Origin  "https://vankaaye.github.io" always;
    add_header Access-Control-Allow-Headers "Authorization, Depth, Range, Content-Type" always;
    add_header Access-Control-Expose-Headers "Content-Length, Content-Range, Accept-Ranges" always;

    # hand off to Nextcloud exactly as your normal PHP location does
    try_files $uri $uri/ /remote.php$request_uri;
}
```

Then `nginx -t && systemctl reload nginx`.

#### Apache

Needs `a2enmod headers rewrite`, then in the vhost:

```apache
<LocationMatch "^/remote\.php/dav">
    Header always set Access-Control-Allow-Origin  "https://vankaaye.github.io"
    Header always set Access-Control-Allow-Methods "GET, HEAD, OPTIONS, PROPFIND"
    Header always set Access-Control-Allow-Headers "Authorization, Depth, Range, Content-Type"
    Header always set Access-control-Expose-Headers "Content-Length, Content-Range, Accept-Ranges"

    RewriteEngine On
    RewriteCond %{REQUEST_METHOD} OPTIONS
    RewriteRule ^ - [R=204,L]
</LocationMatch>
```

Then `apachectl configtest && systemctl reload apache2`.

> Why each header: `Authorization` carries your app password, `Depth` is what
> WebDAV uses to list a folder, `Range` is what lets you seek within a track
> and is required for the download progress bar.

### 6. Connect in the app

Open <https://vankaaye.github.io/music/> and tap **+ → Connect Server…**

| Field | Value |
| --- | --- |
| Server URL | `https://YOUR-HOST/remote.php/dav/files/YOUR-USERNAME` |
| Folder | `/Music` |
| Username | your Nextcloud username |
| Password | the **app password** from step 3 |

Tap **Connect**. It lists your files, reads tags and cover art, and your
library appears.

Repeat this on your phone, tablet and laptop — same server, same library
everywhere.

### 7. Download for offline

Tap the red circled arrow next to any track to store it on that device, or use
**Download** on an album/artist page for the whole set. Downloaded tracks play
with no connection and use no mobile data. Tap the grey check to free the space
again.

---

## Option B — no CORS needed

If you cannot edit the web server config, host the app **on the same domain as
Nextcloud**. Same origin means the browser never applies CORS, so step 5
disappears entirely.

1. Download the four app files from the repo: `index.html`,
   `manifest.webmanifest`, `sw.js`, and the three icons.
2. Put them somewhere your Nextcloud domain serves as plain static files —
   e.g. a `music/` directory in the web root, so they load from
   `https://YOUR-HOST/music/`.
3. Open `https://YOUR-HOST/music/` and connect with the same values as step 6.

This also makes the app installable from your own domain, which is nicer for a
home-screen icon.

> Note: dropping files into Nextcloud's *own* web root can be overwritten by
> Nextcloud upgrades. A separate vhost or a subdirectory outside the Nextcloud
> code is tidier.

---

## If it does not connect

The app shows the real reason. Match it here:

| Message | Cause | Fix |
| --- | --- | --- |
| "Could not reach the server…" | CORS blocked, wrong host, or plain `http://` | Step 5; confirm the URL opens in a browser |
| "Authentication failed" | Wrong user, or you used your login password with 2FA on | Use the app password from step 3 |
| "Server does not allow WebDAV listing (PROPFIND)" | Proxy is stripping or refusing `PROPFIND` | Add `PROPFIND` to allowed methods (step 5) |
| "Server returned HTTP 404" | Wrong path or username | Recheck the URL from step 4 — username is case-sensitive |

To see the underlying error, open the browser console (desktop Chrome:
F12 → Console). A CORS failure names the exact header it wanted.

### Quick check from a terminal

This proves the server side works, independently of the app:

```sh
curl -u 'USERNAME:APP-PASSWORD' -X PROPFIND \
     -H 'Depth: 1' \
     'https://YOUR-HOST/remote.php/dav/files/USERNAME/Music/'
```

XML listing your files = Nextcloud is correct, and anything still failing is
CORS. `401` = credentials. `404` = wrong path.
